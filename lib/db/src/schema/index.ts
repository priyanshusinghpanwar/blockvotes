import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const companiesTable = pgTable("companies", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const electionsTable = pgTable(
  "elections",
  {
    id: text("id").primaryKey(),
    companyId: text("company_id")
      .notNull()
      .references(() => companiesTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull().default("pending"),
    winnerCandidateId: text("winner_candidate_id"),
    winnerCandidateName: text("winner_candidate_name"),
    scheduledStartAt: timestamp("scheduled_start_at"),
    scheduledEndAt: timestamp("scheduled_end_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    companyIdx: index("elections_company_id_idx").on(table.companyId),
    statusIdx: index("elections_status_idx").on(table.status),
    startAtIdx: index("elections_scheduled_start_at_idx").on(table.scheduledStartAt),
    endAtIdx: index("elections_scheduled_end_at_idx").on(table.scheduledEndAt),
  }),
);

export const candidatesTable = pgTable(
  "candidates",
  {
    id: text("id").primaryKey(),
    electionId: text("election_id")
      .notNull()
      .references(() => electionsTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    email: text("email").notNull().default(""),
    imageUrl: text("image_url"),
    isVerified: boolean("is_verified").notNull().default(false),
    verifiedAt: timestamp("verified_at"),
    votes: integer("votes").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    electionIdx: index("candidates_election_id_idx").on(table.electionId),
    verifiedIdx: index("candidates_election_verified_idx").on(table.electionId, table.isVerified),
  }),
);

export const votersTable = pgTable(
  "voters",
  {
    id: text("id").primaryKey(),
    electionId: text("election_id")
      .notNull()
      .references(() => electionsTable.id, { onDelete: "cascade" }),
    voterId: text("voter_id"),
    mobile: text("mobile"),
    email: text("email").notNull(),
    name: text("name").notNull(),
    photoUrl: text("photo_url"),
    signatureUrl: text("signature_url"),
    profileCompleted: boolean("profile_completed").notNull().default(false),
    profileCompletedAt: timestamp("profile_completed_at"),
    age: integer("age"),
    gender: text("gender"),
    password: text("password").notNull(),
    hasVoted: boolean("has_voted").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    electionIdx: index("voters_election_id_idx").on(table.electionId),
    votedIdx: index("voters_election_has_voted_idx").on(table.electionId, table.hasVoted),
    emailUniqueIdx: uniqueIndex("voters_election_email_uidx").on(table.electionId, table.email),
    voterIdUniqueIdx: uniqueIndex("voters_election_voter_id_uidx").on(table.electionId, table.voterId),
  }),
);

export const votesTable = pgTable(
  "votes",
  {
    id: text("id").primaryKey(),
    electionId: text("election_id")
      .notNull()
      .references(() => electionsTable.id, { onDelete: "cascade" }),
    voterId: text("voter_id")
      .notNull()
      .references(() => votersTable.id, { onDelete: "cascade" }),
    candidateId: text("candidate_id")
      .notNull()
      .references(() => candidatesTable.id, { onDelete: "cascade" }),
    blockHash: text("block_hash").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    electionIdx: index("votes_election_id_idx").on(table.electionId),
    candidateIdx: index("votes_candidate_id_idx").on(table.candidateId),
    createdAtIdx: index("votes_created_at_idx").on(table.createdAt),
    voterUniqueIdx: uniqueIndex("votes_election_voter_uidx").on(table.electionId, table.voterId),
  }),
);

export const electionAnchorBatchesTable = pgTable(
  "election_anchor_batches",
  {
    id: text("id").primaryKey(),
    electionId: text("election_id")
      .notNull()
      .references(() => electionsTable.id, { onDelete: "cascade" }),
    batchIndex: integer("batch_index").notNull(),
    fromVoteOffset: integer("from_vote_offset").notNull(),
    toVoteOffset: integer("to_vote_offset").notNull(),
    voteCount: integer("vote_count").notNull(),
    cumulativeVoteCount: integer("cumulative_vote_count").notNull(),
    merkleRoot: text("merkle_root").notNull(),
    txHash: text("tx_hash").notNull(),
    blockNumber: integer("block_number"),
    anchoredAt: timestamp("anchored_at").defaultNow().notNull(),
  },
  (table) => ({
    electionIdx: index("election_anchor_batches_election_id_idx").on(table.electionId),
    batchUniqueIdx: uniqueIndex("election_anchor_batches_election_batch_uidx").on(
      table.electionId,
      table.batchIndex,
    ),
  }),
);

export const electionFinalProofsTable = pgTable(
  "election_final_proofs",
  {
    id: text("id").primaryKey(),
    electionId: text("election_id")
      .notNull()
      .references(() => electionsTable.id, { onDelete: "cascade" }),
    finalMerkleRoot: text("final_merkle_root").notNull(),
    tallyHash: text("tally_hash").notNull(),
    totalVotes: integer("total_votes").notNull(),
    txHash: text("tx_hash").notNull(),
    blockNumber: integer("block_number"),
    finalizedAt: timestamp("finalized_at").defaultNow().notNull(),
  },
  (table) => ({
    electionUniqueIdx: uniqueIndex("election_final_proofs_election_uidx").on(table.electionId),
  }),
);

export const insertCompanySchema = createInsertSchema(companiesTable).omit({ createdAt: true });
export const insertElectionSchema = createInsertSchema(electionsTable).omit({ createdAt: true });
export const insertCandidateSchema = createInsertSchema(candidatesTable).omit({ createdAt: true });
export const insertVoterSchema = createInsertSchema(votersTable).omit({ createdAt: true });
export const insertVoteSchema = createInsertSchema(votesTable).omit({ createdAt: true });
export const insertElectionAnchorBatchSchema = createInsertSchema(electionAnchorBatchesTable).omit({ anchoredAt: true });
export const insertElectionFinalProofSchema = createInsertSchema(electionFinalProofsTable).omit({ finalizedAt: true });

export type Company = typeof companiesTable.$inferSelect;
export type Election = typeof electionsTable.$inferSelect;
export type Candidate = typeof candidatesTable.$inferSelect;
export type Voter = typeof votersTable.$inferSelect;
export type Vote = typeof votesTable.$inferSelect;
export type ElectionAnchorBatch = typeof electionAnchorBatchesTable.$inferSelect;
export type ElectionFinalProof = typeof electionFinalProofsTable.$inferSelect;
