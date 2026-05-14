CREATE TABLE "candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"election_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"image_url" text,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verified_at" timestamp,
	"votes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "companies_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "election_anchor_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"election_id" text NOT NULL,
	"batch_index" integer NOT NULL,
	"from_vote_offset" integer NOT NULL,
	"to_vote_offset" integer NOT NULL,
	"vote_count" integer NOT NULL,
	"cumulative_vote_count" integer NOT NULL,
	"merkle_root" text NOT NULL,
	"tx_hash" text NOT NULL,
	"block_number" integer,
	"anchored_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "election_final_proofs" (
	"id" text PRIMARY KEY NOT NULL,
	"election_id" text NOT NULL,
	"final_merkle_root" text NOT NULL,
	"tally_hash" text NOT NULL,
	"total_votes" integer NOT NULL,
	"tx_hash" text NOT NULL,
	"block_number" integer,
	"finalized_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "elections" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"winner_candidate_id" text,
	"winner_candidate_name" text,
	"scheduled_start_at" timestamp,
	"scheduled_end_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voters" (
	"id" text PRIMARY KEY NOT NULL,
	"election_id" text NOT NULL,
	"voter_id" text,
	"aadhar_id" text,
	"mobile" text,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"photo_url" text,
	"signature_url" text,
	"profile_completed" boolean DEFAULT false NOT NULL,
	"profile_completed_at" timestamp,
	"age" integer,
	"gender" text,
	"password" text NOT NULL,
	"has_voted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" text PRIMARY KEY NOT NULL,
	"election_id" text NOT NULL,
	"voter_id" text NOT NULL,
	"candidate_id" text NOT NULL,
	"block_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_anchor_batches" ADD CONSTRAINT "election_anchor_batches_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "election_final_proofs" ADD CONSTRAINT "election_final_proofs_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "elections" ADD CONSTRAINT "elections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voters" ADD CONSTRAINT "voters_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_voter_id_voters_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."voters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidates_election_id_idx" ON "candidates" USING btree ("election_id");--> statement-breakpoint
CREATE INDEX "candidates_election_verified_idx" ON "candidates" USING btree ("election_id","is_verified");--> statement-breakpoint
CREATE INDEX "election_anchor_batches_election_id_idx" ON "election_anchor_batches" USING btree ("election_id");--> statement-breakpoint
CREATE UNIQUE INDEX "election_anchor_batches_election_batch_uidx" ON "election_anchor_batches" USING btree ("election_id","batch_index");--> statement-breakpoint
CREATE UNIQUE INDEX "election_final_proofs_election_uidx" ON "election_final_proofs" USING btree ("election_id");--> statement-breakpoint
CREATE INDEX "elections_company_id_idx" ON "elections" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "elections_status_idx" ON "elections" USING btree ("status");--> statement-breakpoint
CREATE INDEX "elections_scheduled_start_at_idx" ON "elections" USING btree ("scheduled_start_at");--> statement-breakpoint
CREATE INDEX "elections_scheduled_end_at_idx" ON "elections" USING btree ("scheduled_end_at");--> statement-breakpoint
CREATE INDEX "voters_election_id_idx" ON "voters" USING btree ("election_id");--> statement-breakpoint
CREATE INDEX "voters_election_has_voted_idx" ON "voters" USING btree ("election_id","has_voted");--> statement-breakpoint
CREATE UNIQUE INDEX "voters_election_email_uidx" ON "voters" USING btree ("election_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "voters_election_voter_id_uidx" ON "voters" USING btree ("election_id","voter_id");--> statement-breakpoint
CREATE UNIQUE INDEX "voters_election_aadhar_id_uidx" ON "voters" USING btree ("election_id","aadhar_id");--> statement-breakpoint
CREATE INDEX "votes_election_id_idx" ON "votes" USING btree ("election_id");--> statement-breakpoint
CREATE INDEX "votes_candidate_id_idx" ON "votes" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "votes_created_at_idx" ON "votes" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "votes_election_voter_uidx" ON "votes" USING btree ("election_id","voter_id");
