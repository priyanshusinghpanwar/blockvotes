import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Contract,
  JsonRpcProvider,
  Network,
  Wallet,
  isAddress,
  keccak256,
  solidityPacked,
  toUtf8Bytes,
} from "ethers";
import { db } from "@workspace/db";
import {
  candidatesTable,
  electionAnchorBatchesTable,
  electionFinalProofsTable,
  votesTable,
} from "@workspace/db";
import { asc, desc, eq } from "drizzle-orm";
import { electionProofRegistryAbi } from "../blockchain/election-proof-registry-abi";

const ZERO_BYTES32 = `0x${"0".repeat(64)}`;
const PLACEHOLDER_VALUE_PATTERN = /^<.*>$/;

function parseBooleanEnv(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function normalizeOptionalEnv(value: string | undefined): string {
  return value?.trim() || "";
}

function isPlaceholderValue(value: string): boolean {
  return value.length === 0 || PLACEHOLDER_VALUE_PATTERN.test(value);
}

type DeploymentMetadata = {
  address: string | null;
  chainId: number | null;
};

let deploymentMetadataCache: DeploymentMetadata | null = null;

function getDeploymentMetadata(): DeploymentMetadata {
  if (deploymentMetadataCache) return deploymentMetadataCache;

  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const candidatePaths = [
      path.resolve(currentDir, "../blockchain/registry-deployment.json"),
      path.resolve(currentDir, "../../src/blockchain/registry-deployment.json"),
      path.resolve(process.cwd(), "artifacts/api-server/src/blockchain/registry-deployment.json"),
      path.resolve(process.cwd(), "src/blockchain/registry-deployment.json"),
    ];
    const deploymentPath = candidatePaths.find(candidate => existsSync(candidate));

    if (!deploymentPath) {
      deploymentMetadataCache = { address: null, chainId: null };
      return deploymentMetadataCache;
    }

    const parsed = JSON.parse(readFileSync(deploymentPath, "utf8")) as {
      address?: unknown;
      chainId?: unknown;
    };

    const address =
      typeof parsed.address === "string" && isAddress(parsed.address.trim())
        ? parsed.address.trim()
        : null;
    const chainId =
      typeof parsed.chainId === "string"
        ? Number.parseInt(parsed.chainId, 10)
        : typeof parsed.chainId === "number"
          ? parsed.chainId
          : null;

    deploymentMetadataCache = {
      address,
      chainId: Number.isFinite(chainId) ? Number(chainId) : null,
    };
    return deploymentMetadataCache;
  } catch {
    deploymentMetadataCache = { address: null, chainId: null };
    return deploymentMetadataCache;
  }
}

type BlockchainConfigResolution = {
  enabledFlag: boolean;
  rpcUrl: string;
  privateKey: string;
  contractAddress: string;
  chainId: number | null;
  issues: string[];
};

function resolveBlockchainConfig(): BlockchainConfigResolution {
  const enabledFlag = parseBooleanEnv(process.env.BLOCKCHAIN_ENABLED);
  const deployment = getDeploymentMetadata();

  const rpcUrl =
    normalizeOptionalEnv(process.env.BLOCKCHAIN_RPC_URL) ||
    normalizeOptionalEnv(process.env.GANACHE_RPC_URL);
  const privateKey = normalizeOptionalEnv(process.env.BLOCKCHAIN_PRIVATE_KEY);
  const configuredAddress = normalizeOptionalEnv(process.env.BLOCKCHAIN_CONTRACT_ADDRESS);
  const contractAddress =
    !isPlaceholderValue(configuredAddress) && isAddress(configuredAddress)
      ? configuredAddress
      : deployment.address || "";

  const configuredChainId = normalizeOptionalEnv(process.env.BLOCKCHAIN_CHAIN_ID);
  const parsedConfiguredChainId = configuredChainId
    ? Number.parseInt(configuredChainId, 10)
    : null;
  const chainId =
    parsedConfiguredChainId && Number.isFinite(parsedConfiguredChainId)
      ? parsedConfiguredChainId
      : deployment.chainId;

  const issues: string[] = [];
  if (!rpcUrl) issues.push("BLOCKCHAIN_RPC_URL is missing");
  if (!privateKey || isPlaceholderValue(privateKey)) issues.push("BLOCKCHAIN_PRIVATE_KEY is missing");
  if (!contractAddress) issues.push("BLOCKCHAIN_CONTRACT_ADDRESS is missing");
  if (contractAddress && !isAddress(contractAddress)) issues.push("BLOCKCHAIN_CONTRACT_ADDRESS is invalid");

  return {
    enabledFlag,
    rpcUrl,
    privateKey,
    contractAddress,
    chainId: chainId && Number.isFinite(chainId) ? chainId : null,
    issues,
  };
}

export function isBlockchainEnabled(): boolean {
  const config = resolveBlockchainConfig();
  return config.enabledFlag && config.issues.length === 0;
}

function createProvider(config: BlockchainConfigResolution): JsonRpcProvider {
  if (config.chainId != null) {
    const network = Network.from(config.chainId);
    return new JsonRpcProvider(config.rpcUrl, network, { staticNetwork: network });
  }

  return new JsonRpcProvider(config.rpcUrl);
}

function destroyProvider(provider: JsonRpcProvider | null | undefined): void {
  if (!provider) return;

  try {
    provider.destroy();
  } catch {
    // Ignore provider shutdown issues; they are non-fatal cleanup failures.
  }
}

function ensureHex32(hash: string): string {
  const trimmed = hash.trim().toLowerCase();
  if (trimmed.startsWith("0x") && trimmed.length === 66) return trimmed;
  if (/^[a-f0-9]{64}$/.test(trimmed)) return `0x${trimmed}`;
  return keccak256(toUtf8Bytes(trimmed));
}

function buildMerkleRoot(rawLeaves: string[]): string {
  if (rawLeaves.length === 0) return ZERO_BYTES32;

  let level = rawLeaves.map(ensureHex32);
  while (level.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = level[i + 1] ?? left;
      nextLevel.push(keccak256(solidityPacked(["bytes32", "bytes32"], [left, right])));
    }
    level = nextLevel;
  }

  return level[0]!;
}

function buildTallyHash(electionId: string, candidateVotes: Array<{ id: string; votes: number }>): string {
  const normalized = [...candidateVotes].sort((a, b) => a.id.localeCompare(b.id));
  const payload = JSON.stringify({
    election_id: electionId,
    candidates: normalized,
    total_votes: normalized.reduce((sum, entry) => sum + entry.votes, 0),
  });
  return keccak256(toUtf8Bytes(payload));
}

function getBlockchainConfig() {
  const config = resolveBlockchainConfig();

  if (!config.enabledFlag) {
    throw new Error("Blockchain integration is disabled. Set BLOCKCHAIN_ENABLED=true.");
  }

  if (config.issues.length > 0) {
    throw new Error(
      `Blockchain configuration missing or invalid: ${config.issues.join("; ")}.`,
    );
  }

  return config;
}

function getRegistryContract() {
  const config = getBlockchainConfig();
  const provider = createProvider(config);
  const wallet = new Wallet(config.privateKey, provider);
  const contract = new Contract(config.contractAddress, electionProofRegistryAbi, wallet);
  return { provider, wallet, contract, config };
}

async function getOrderedVotes(electionId: string) {
  return db
    .select({
      id: votesTable.id,
      blockHash: votesTable.blockHash,
      createdAt: votesTable.createdAt,
    })
    .from(votesTable)
    .where(eq(votesTable.electionId, electionId))
    .orderBy(asc(votesTable.createdAt), asc(votesTable.id));
}

async function getLatestAnchor(electionId: string) {
  const rows = await db
    .select()
    .from(electionAnchorBatchesTable)
    .where(eq(electionAnchorBatchesTable.electionId, electionId))
    .orderBy(desc(electionAnchorBatchesTable.batchIndex))
    .limit(1);
  return rows[0] ?? null;
}

export async function anchorPendingVotesForElection(electionId: string) {
  if (!isBlockchainEnabled()) {
    const config = resolveBlockchainConfig();
    return {
      status: "error" as const,
      message: config.enabledFlag
        ? `Blockchain integration is not ready: ${config.issues.join("; ")}.`
        : "Blockchain integration is disabled. Set BLOCKCHAIN_ENABLED=true.",
    };
  }

  const allVotes = await getOrderedVotes(electionId);
  const latestAnchor = await getLatestAnchor(electionId);

  const fromOffset = latestAnchor ? latestAnchor.toVoteOffset + 1 : 0;
  if (fromOffset >= allVotes.length) {
    return {
      status: "noop" as const,
      message: "No new votes to anchor.",
      data: {
        election_id: electionId,
        total_votes: allVotes.length,
        anchored_vote_count: latestAnchor?.cumulativeVoteCount ?? 0,
      },
    };
  }

  const pendingVotes = allVotes.slice(fromOffset);
  const merkleRoot = buildMerkleRoot(pendingVotes.map(vote => vote.blockHash));
  const batchIndex = (latestAnchor?.batchIndex ?? 0) + 1;
  const voteCount = pendingVotes.length;
  const cumulativeVoteCount = allVotes.length;

  let provider: JsonRpcProvider | null = null;
  try {
    const registry = getRegistryContract();
    provider = registry.provider;
    const tx = await registry.contract.anchorBatch(
      electionId,
      batchIndex,
      merkleRoot,
      voteCount,
      cumulativeVoteCount,
    );
    const receipt = await tx.wait();

    await db.insert(electionAnchorBatchesTable).values({
      id: randomUUID(),
      electionId,
      batchIndex,
      fromVoteOffset: fromOffset,
      toVoteOffset: fromOffset + voteCount - 1,
      voteCount,
      cumulativeVoteCount,
      merkleRoot,
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber ? Number(receipt.blockNumber) : null,
    });

    return {
      status: "success" as const,
      message: `Anchored batch ${batchIndex} on chain.`,
      data: {
        election_id: electionId,
        batch_index: batchIndex,
        vote_count: voteCount,
        cumulative_vote_count: cumulativeVoteCount,
        merkle_root: merkleRoot,
        tx_hash: tx.hash,
        block_number: receipt?.blockNumber ? Number(receipt.blockNumber) : null,
      },
    };
  } finally {
    destroyProvider(provider);
  }
}

export async function finalizeElectionProofOnChain(electionId: string) {
  if (!isBlockchainEnabled()) {
    const config = resolveBlockchainConfig();
    return {
      status: "error" as const,
      message: config.enabledFlag
        ? `Blockchain integration is not ready: ${config.issues.join("; ")}.`
        : "Blockchain integration is disabled. Set BLOCKCHAIN_ENABLED=true.",
    };
  }

  const existingFinalProof = await db
    .select()
    .from(electionFinalProofsTable)
    .where(eq(electionFinalProofsTable.electionId, electionId))
    .limit(1);
  if (existingFinalProof.length > 0) {
    return {
      status: "noop" as const,
      message: "Election already finalized on chain.",
      data: existingFinalProof[0],
    };
  }

  const votes = await getOrderedVotes(electionId);
  const voteHashes = votes.map(vote => vote.blockHash);
  const finalMerkleRoot =
    voteHashes.length > 0 ? buildMerkleRoot(voteHashes) : keccak256(toUtf8Bytes(`empty:${electionId}`));

  const candidateVotes = await db
    .select({
      id: candidatesTable.id,
      votes: candidatesTable.votes,
    })
    .from(candidatesTable)
    .where(eq(candidatesTable.electionId, electionId));
  const tallyHash = buildTallyHash(
    electionId,
    candidateVotes.map(candidate => ({ id: candidate.id, votes: candidate.votes })),
  );

  let provider: JsonRpcProvider | null = null;
  try {
    const registry = getRegistryContract();
    provider = registry.provider;
    const tx = await registry.contract.finalizeElection(
      electionId,
      finalMerkleRoot,
      tallyHash,
      votes.length,
    );
    const receipt = await tx.wait();

    const finalRow = {
      id: randomUUID(),
      electionId,
      finalMerkleRoot,
      tallyHash,
      totalVotes: votes.length,
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber ? Number(receipt.blockNumber) : null,
    };

    await db.insert(electionFinalProofsTable).values(finalRow);

    return {
      status: "success" as const,
      message: "Election finalized on chain.",
      data: {
        election_id: electionId,
        final_merkle_root: finalMerkleRoot,
        tally_hash: tallyHash,
        total_votes: votes.length,
        tx_hash: tx.hash,
        block_number: receipt?.blockNumber ? Number(receipt.blockNumber) : null,
      },
    };
  } finally {
    destroyProvider(provider);
  }
}

export async function getElectionAnchors(electionId: string) {
  const rows = await db
    .select()
    .from(electionAnchorBatchesTable)
    .where(eq(electionAnchorBatchesTable.electionId, electionId))
    .orderBy(asc(electionAnchorBatchesTable.batchIndex));

  const finalProof = await db
    .select()
    .from(electionFinalProofsTable)
    .where(eq(electionFinalProofsTable.electionId, electionId))
    .limit(1);

  return {
    anchors: rows,
    finalProof: finalProof[0] ?? null,
  };
}

export async function verifyElectionAnchors(electionId: string) {
  const votes = await getOrderedVotes(electionId);
  const anchors = await db
    .select()
    .from(electionAnchorBatchesTable)
    .where(eq(electionAnchorBatchesTable.electionId, electionId))
    .orderBy(asc(electionAnchorBatchesTable.batchIndex));

  const verificationRows: Array<{
    batch_index: number;
    db_merkle_root: string;
    recomputed_merkle_root: string;
    db_matches_recomputed: boolean;
    chain_merkle_root: string | null;
    chain_matches_db: boolean | null;
  }> = [];

  const canVerifyOnChain = isBlockchainEnabled();
  let provider: JsonRpcProvider | null = null;
  let contract: Contract | null = null;

  if (canVerifyOnChain) {
    const registry = getRegistryContract();
    provider = registry.provider;
    contract = registry.contract;
  }

  try {
    for (const anchor of anchors) {
      const slice = votes.slice(anchor.fromVoteOffset, anchor.toVoteOffset + 1);
      const recomputedRoot = buildMerkleRoot(slice.map(vote => vote.blockHash));
      const dbMatchesRecomputed = recomputedRoot.toLowerCase() === anchor.merkleRoot.toLowerCase();

      let chainMerkleRoot: string | null = null;
      let chainMatchesDb: boolean | null = null;

      if (contract) {
        const chainAnchor = await contract.getBatchAnchor(electionId, anchor.batchIndex);
        chainMerkleRoot = String(chainAnchor[0]);
        chainMatchesDb = chainMerkleRoot.toLowerCase() === anchor.merkleRoot.toLowerCase();
      }

      verificationRows.push({
        batch_index: anchor.batchIndex,
        db_merkle_root: anchor.merkleRoot,
        recomputed_merkle_root: recomputedRoot,
        db_matches_recomputed: dbMatchesRecomputed,
        chain_merkle_root: chainMerkleRoot,
        chain_matches_db: chainMatchesDb,
      });
    }

    const finalProofRows = await db
      .select()
      .from(electionFinalProofsTable)
      .where(eq(electionFinalProofsTable.electionId, electionId))
      .limit(1);

    const finalProof = finalProofRows[0] ?? null;
    const finalMerkleRoot =
      votes.length > 0 ? buildMerkleRoot(votes.map(vote => vote.blockHash)) : keccak256(toUtf8Bytes(`empty:${electionId}`));

    let chainFinalMerkleRoot: string | null = null;
    let chainFinalTallyHash: string | null = null;
    if (contract && finalProof) {
      const chainFinal = await contract.getFinalProof(electionId);
      chainFinalMerkleRoot = String(chainFinal[0]);
      chainFinalTallyHash = String(chainFinal[1]);
    }

    const allBatchesValid = verificationRows.every(
      row => row.db_matches_recomputed && (row.chain_matches_db ?? true),
    );
    const finalProofValid = !finalProof
      ? null
      : {
          db_matches_recomputed: finalProof.finalMerkleRoot.toLowerCase() === finalMerkleRoot.toLowerCase(),
          chain_matches_db: chainFinalMerkleRoot
            ? chainFinalMerkleRoot.toLowerCase() === finalProof.finalMerkleRoot.toLowerCase()
            : null,
          chain_tally_matches_db: chainFinalTallyHash
            ? chainFinalTallyHash.toLowerCase() === finalProof.tallyHash.toLowerCase()
            : null,
        };

    return {
      election_id: electionId,
      total_votes: votes.length,
      all_batches_valid: allBatchesValid,
      batches: verificationRows,
      final_proof: finalProof
        ? {
            db_final_merkle_root: finalProof.finalMerkleRoot,
            recomputed_final_merkle_root: finalMerkleRoot,
            chain_final_merkle_root: chainFinalMerkleRoot,
            db_tally_hash: finalProof.tallyHash,
            chain_tally_hash: chainFinalTallyHash,
            checks: finalProofValid,
          }
        : null,
    };
  } finally {
    destroyProvider(provider);
  }
}

export async function getBlockchainHealth() {
  const config = resolveBlockchainConfig();
  if (!config.enabledFlag) {
    return {
      enabled: false,
      status: "disabled",
      message: "Blockchain integration is disabled",
    };
  }

  if (config.issues.length > 0) {
    return {
      enabled: false,
      status: "misconfigured",
      message: `Blockchain integration is enabled but incomplete: ${config.issues.join("; ")}.`,
      rpc_url: config.rpcUrl || null,
      contract_address: config.contractAddress || null,
      chain_id: config.chainId,
    };
  }

  let provider: JsonRpcProvider | null = null;
  try {
    provider = createProvider(config);
    const wallet = new Wallet(config.privateKey, provider);
    const [network, blockNumber] = await Promise.all([provider.getNetwork(), provider.getBlockNumber()]);

    return {
      enabled: true,
      status: "ok",
      rpc_url: config.rpcUrl,
      contract_address: config.contractAddress,
      signer_address: wallet.address,
      chain_id: Number(network.chainId),
      latest_block: blockNumber,
    };
  } catch (error) {
    return {
      enabled: false,
      status: "unavailable",
      message: error instanceof Error ? error.message : "Unable to reach blockchain RPC",
      rpc_url: config.rpcUrl,
      contract_address: config.contractAddress,
      chain_id: config.chainId,
    };
  } finally {
    destroyProvider(provider);
  }
}

export async function autoAnchorIfEnabled(electionId: string) {
  const autoAnchor = parseBooleanEnv(process.env.BLOCKCHAIN_AUTO_ANCHOR_ON_VOTE);
  if (!autoAnchor || !isBlockchainEnabled()) return null;
  return anchorPendingVotesForElection(electionId);
}
