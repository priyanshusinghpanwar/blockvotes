export const electionProofRegistryAbi = [
  {
    type: "function",
    name: "anchorBatch",
    stateMutability: "nonpayable",
    inputs: [
      { name: "electionId", type: "string" },
      { name: "batchIndex", type: "uint256" },
      { name: "merkleRoot", type: "bytes32" },
      { name: "voteCount", type: "uint256" },
      { name: "cumulativeVoteCount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "finalizeElection",
    stateMutability: "nonpayable",
    inputs: [
      { name: "electionId", type: "string" },
      { name: "finalMerkleRoot", type: "bytes32" },
      { name: "tallyHash", type: "bytes32" },
      { name: "totalVotes", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getBatchAnchor",
    stateMutability: "view",
    inputs: [
      { name: "electionId", type: "string" },
      { name: "batchIndex", type: "uint256" },
    ],
    outputs: [
      { name: "merkleRoot", type: "bytes32" },
      { name: "voteCount", type: "uint256" },
      { name: "cumulativeVoteCount", type: "uint256" },
      { name: "anchoredAt", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "getFinalProof",
    stateMutability: "view",
    inputs: [{ name: "electionId", type: "string" }],
    outputs: [
      { name: "finalMerkleRoot", type: "bytes32" },
      { name: "tallyHash", type: "bytes32" },
      { name: "totalVotes", type: "uint256" },
      { name: "finalizedAt", type: "uint256" },
    ],
  },
] as const;
