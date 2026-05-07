import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";
import { ensureDatabaseUrlLoaded } from "./load-env";

const { Pool } = pg;
const databaseUrl = ensureDatabaseUrlLoaded();

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL must be set. Add it to a workspace .env file or artifacts/api-server/.env.",
  );
}

export const pool = new Pool({ connectionString: databaseUrl });
export const db = drizzle(pool, { schema });

export * from "./schema";
