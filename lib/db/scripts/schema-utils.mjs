import fs from "node:fs";
import path from "node:path";

export const hardeningStatements = [
  "ALTER TABLE candidates ADD CONSTRAINT candidates_election_id_elections_id_fk FOREIGN KEY (election_id) REFERENCES public.elections(id) ON DELETE CASCADE",
  "ALTER TABLE election_anchor_batches ADD CONSTRAINT election_anchor_batches_election_id_elections_id_fk FOREIGN KEY (election_id) REFERENCES public.elections(id) ON DELETE CASCADE",
  "ALTER TABLE election_final_proofs ADD CONSTRAINT election_final_proofs_election_id_elections_id_fk FOREIGN KEY (election_id) REFERENCES public.elections(id) ON DELETE CASCADE",
  "ALTER TABLE elections ADD CONSTRAINT elections_company_id_companies_id_fk FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE",
  "ALTER TABLE voters ADD CONSTRAINT voters_election_id_elections_id_fk FOREIGN KEY (election_id) REFERENCES public.elections(id) ON DELETE CASCADE",
  "ALTER TABLE voters ADD COLUMN IF NOT EXISTS aadhar_id text",
  "ALTER TABLE votes ADD CONSTRAINT votes_election_id_elections_id_fk FOREIGN KEY (election_id) REFERENCES public.elections(id) ON DELETE CASCADE",
  "ALTER TABLE votes ADD CONSTRAINT votes_voter_id_voters_id_fk FOREIGN KEY (voter_id) REFERENCES public.voters(id) ON DELETE CASCADE",
  "ALTER TABLE votes ADD CONSTRAINT votes_candidate_id_candidates_id_fk FOREIGN KEY (candidate_id) REFERENCES public.candidates(id) ON DELETE CASCADE",
  "CREATE INDEX IF NOT EXISTS candidates_election_id_idx ON candidates USING btree (election_id)",
  "CREATE INDEX IF NOT EXISTS candidates_election_verified_idx ON candidates USING btree (election_id, is_verified)",
  "CREATE INDEX IF NOT EXISTS election_anchor_batches_election_id_idx ON election_anchor_batches USING btree (election_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS election_anchor_batches_election_batch_uidx ON election_anchor_batches USING btree (election_id, batch_index)",
  "CREATE UNIQUE INDEX IF NOT EXISTS election_final_proofs_election_uidx ON election_final_proofs USING btree (election_id)",
  "CREATE INDEX IF NOT EXISTS elections_company_id_idx ON elections USING btree (company_id)",
  "CREATE INDEX IF NOT EXISTS elections_status_idx ON elections USING btree (status)",
  "CREATE INDEX IF NOT EXISTS elections_scheduled_start_at_idx ON elections USING btree (scheduled_start_at)",
  "CREATE INDEX IF NOT EXISTS elections_scheduled_end_at_idx ON elections USING btree (scheduled_end_at)",
  "CREATE INDEX IF NOT EXISTS voters_election_id_idx ON voters USING btree (election_id)",
  "CREATE INDEX IF NOT EXISTS voters_election_has_voted_idx ON voters USING btree (election_id, has_voted)",
  "CREATE UNIQUE INDEX IF NOT EXISTS voters_election_email_uidx ON voters USING btree (election_id, email)",
  "CREATE UNIQUE INDEX IF NOT EXISTS voters_election_voter_id_uidx ON voters USING btree (election_id, voter_id)",
  "CREATE UNIQUE INDEX IF NOT EXISTS voters_election_aadhar_id_uidx ON voters USING btree (election_id, aadhar_id)",
  "CREATE INDEX IF NOT EXISTS votes_election_id_idx ON votes USING btree (election_id)",
  "CREATE INDEX IF NOT EXISTS votes_candidate_id_idx ON votes USING btree (candidate_id)",
  "CREATE INDEX IF NOT EXISTS votes_created_at_idx ON votes USING btree (created_at)",
  "CREATE UNIQUE INDEX IF NOT EXISTS votes_election_voter_uidx ON votes USING btree (election_id, voter_id)",
];

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf8");
}

function parseEnv(text) {
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((line) => !line.trim().startsWith("#"))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
}

export function loadDatabaseUrl(cwd = process.cwd()) {
  const envText = [
    readEnvFile(path.resolve(cwd, "../../artifacts/api-server/.env")),
    readEnvFile(path.resolve(cwd, "../../artifacts/api-server/.env.local")),
  ].join("\n");

  const env = parseEnv(envText);
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  return env.DATABASE_URL;
}

export function splitSqlStatements(sqlText) {
  return sqlText
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export async function runStatements(client, statements, { ignoreDuplicateErrors = false } = {}) {
  for (const statement of statements) {
    try {
      await client.query(statement);
      console.log(`applied: ${statement}`);
    } catch (error) {
      if (
        ignoreDuplicateErrors &&
        error &&
        (error.code === "42710" || error.code === "42P07")
      ) {
        console.log(`exists: ${statement}`);
        continue;
      }

      throw error;
    }
  }
}
