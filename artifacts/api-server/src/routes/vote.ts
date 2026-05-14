import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { votersTable, candidatesTable, electionsTable, votesTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { randomUUID, createHash } from "crypto";
import { autoAnchorIfEnabled } from "../services/blockchain-proof";
import { requireVoterAuth } from "../lib/voter-auth";

const router: IRouter = Router();

function generateBlockHash(voterId: string, candidateId: string, electionId: string): string {
  const data = `${voterId}:${candidateId}:${electionId}:${Date.now()}:${randomUUID()}`;
  return createHash("sha256").update(data).digest("hex");
}

router.post("/", requireVoterAuth, async (req, res) => {
  try {
    const { candidate_id } = req.body;
    const voterSession = req.voterSession;
    if (!voterSession) {
      res.status(401).json({ status: "error", message: "Voter authentication required", data: null });
      return;
    }

    if (!candidate_id) {
      res.json({ status: "error", message: "candidate_id is required" });
      return;
    }

    const voterId = voterSession.voterId;
    const electionId = voterSession.electionId;
    const blockHash = generateBlockHash(voterId, candidate_id, electionId);

    await db.transaction(async (tx) => {
      const voterResults = await tx
        .select()
        .from(votersTable)
        .where(
          and(
            eq(votersTable.id, voterId),
            eq(votersTable.electionId, electionId),
          ),
        );
      if (voterResults.length === 0) {
        throw new Error("VOTER_NOT_FOUND");
      }

      const voter = voterResults[0];
      if (voter.hasVoted) {
        throw new Error("ALREADY_VOTED");
      }

      const electionResults = await tx
        .select()
        .from(electionsTable)
        .where(eq(electionsTable.id, electionId));
      if (electionResults.length === 0 || electionResults[0].status !== "active") {
        throw new Error("ELECTION_NOT_ACTIVE");
      }

      const candidateResults = await tx
        .select()
        .from(candidatesTable)
        .where(
          and(
            eq(candidatesTable.id, candidate_id),
            eq(candidatesTable.electionId, electionId),
          ),
        );
      if (candidateResults.length === 0) {
        throw new Error("INVALID_CANDIDATE");
      }

      await tx.insert(votesTable).values({
        id: randomUUID(),
        electionId,
        voterId,
        candidateId: candidate_id,
        blockHash,
      });

      await tx.update(candidatesTable)
        .set({ votes: sql`${candidatesTable.votes} + 1` })
        .where(
          and(
            eq(candidatesTable.id, candidate_id),
            eq(candidatesTable.electionId, electionId),
          ),
        );

      await tx.update(votersTable)
        .set({ hasVoted: true })
        .where(
          and(
            eq(votersTable.id, voterId),
            eq(votersTable.electionId, electionId),
          ),
        );
    });

    let anchorTxHash: string | null = null;
    try {
      const anchorResult = await autoAnchorIfEnabled(electionId);
      anchorTxHash = anchorResult && "data" in anchorResult ? (anchorResult.data as any)?.tx_hash ?? null : null;
    } catch (anchorErr) {
      req.log.warn({ err: anchorErr, election_id: electionId }, "Vote recorded but auto-anchor failed");
    }

    res.json({
      status: "success",
      message: "Vote cast successfully!",
      data: {
        block_hash: blockHash,
        anchor_tx_hash: anchorTxHash,
      },
    });
  } catch (err) {
    if (err instanceof Error) {
      const knownErrors: Record<string, string> = {
        VOTER_NOT_FOUND: "Voter not found",
        ALREADY_VOTED: "You have already voted in this election",
        ELECTION_NOT_ACTIVE: "Election is not active",
        INVALID_CANDIDATE: "Candidate is invalid for this election",
      };
      const message = knownErrors[err.message];
      if (message) {
        res.json({ status: "error", message });
        return;
      }
    }

    req.log.error(err);
    res.json({ status: "error", message: "Internal server error" });
  }
});

export default router;
