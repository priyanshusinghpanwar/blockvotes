// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract ElectionProofRegistry {
    struct BatchAnchor {
        bytes32 merkleRoot;
        uint256 voteCount;
        uint256 cumulativeVoteCount;
        uint256 anchoredAt;
    }

    struct FinalProof {
        bytes32 finalMerkleRoot;
        bytes32 tallyHash;
        uint256 totalVotes;
        uint256 finalizedAt;
    }

    address public immutable owner;

    mapping(bytes32 electionKey => mapping(uint256 batchIndex => BatchAnchor)) private _batchAnchors;
    mapping(bytes32 electionKey => uint256 batchCount) public latestBatchIndex;
    mapping(bytes32 electionKey => FinalProof finalProof) private _finalProofs;
    mapping(bytes32 electionKey => bool finalized) public isFinalized;

    event BatchAnchored(
        string indexed electionId,
        uint256 indexed batchIndex,
        bytes32 merkleRoot,
        uint256 voteCount,
        uint256 cumulativeVoteCount,
        uint256 anchoredAt
    );

    event ElectionFinalized(
        string indexed electionId,
        bytes32 finalMerkleRoot,
        bytes32 tallyHash,
        uint256 totalVotes,
        uint256 finalizedAt
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can perform this action");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function anchorBatch(
        string calldata electionId,
        uint256 batchIndex,
        bytes32 merkleRoot,
        uint256 voteCount,
        uint256 cumulativeVoteCount
    ) external onlyOwner {
        require(bytes(electionId).length > 0, "Election ID is required");
        require(batchIndex > 0, "Batch index must be greater than zero");
        require(merkleRoot != bytes32(0), "Merkle root is required");
        require(voteCount > 0, "Vote count must be greater than zero");
        require(cumulativeVoteCount >= voteCount, "Invalid cumulative vote count");

        bytes32 electionKey = keccak256(abi.encodePacked(electionId));
        require(!isFinalized[electionKey], "Election already finalized");
        require(_batchAnchors[electionKey][batchIndex].anchoredAt == 0, "Batch already anchored");

        uint256 previousBatch = latestBatchIndex[electionKey];
        require(batchIndex == previousBatch + 1, "Batch index must be sequential");

        _batchAnchors[electionKey][batchIndex] = BatchAnchor({
            merkleRoot: merkleRoot,
            voteCount: voteCount,
            cumulativeVoteCount: cumulativeVoteCount,
            anchoredAt: block.timestamp
        });
        latestBatchIndex[electionKey] = batchIndex;

        emit BatchAnchored(
            electionId,
            batchIndex,
            merkleRoot,
            voteCount,
            cumulativeVoteCount,
            block.timestamp
        );
    }

    function finalizeElection(
        string calldata electionId,
        bytes32 finalMerkleRoot,
        bytes32 tallyHash,
        uint256 totalVotes
    ) external onlyOwner {
        require(bytes(electionId).length > 0, "Election ID is required");
        require(finalMerkleRoot != bytes32(0), "Final Merkle root is required");
        require(tallyHash != bytes32(0), "Tally hash is required");

        bytes32 electionKey = keccak256(abi.encodePacked(electionId));
        require(!isFinalized[electionKey], "Election already finalized");

        _finalProofs[electionKey] = FinalProof({
            finalMerkleRoot: finalMerkleRoot,
            tallyHash: tallyHash,
            totalVotes: totalVotes,
            finalizedAt: block.timestamp
        });
        isFinalized[electionKey] = true;

        emit ElectionFinalized(electionId, finalMerkleRoot, tallyHash, totalVotes, block.timestamp);
    }

    function getBatchAnchor(
        string calldata electionId,
        uint256 batchIndex
    )
        external
        view
        returns (bytes32 merkleRoot, uint256 voteCount, uint256 cumulativeVoteCount, uint256 anchoredAt)
    {
        bytes32 electionKey = keccak256(abi.encodePacked(electionId));
        BatchAnchor memory anchor = _batchAnchors[electionKey][batchIndex];
        return (anchor.merkleRoot, anchor.voteCount, anchor.cumulativeVoteCount, anchor.anchoredAt);
    }

    function getFinalProof(
        string calldata electionId
    )
        external
        view
        returns (bytes32 finalMerkleRoot, bytes32 tallyHash, uint256 totalVotes, uint256 finalizedAt)
    {
        bytes32 electionKey = keccak256(abi.encodePacked(electionId));
        FinalProof memory proof = _finalProofs[electionKey];
        return (proof.finalMerkleRoot, proof.tallyHash, proof.totalVotes, proof.finalizedAt);
    }
}
