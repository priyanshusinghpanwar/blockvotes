import { Client } from "pg";
import { hardeningStatements, loadDatabaseUrl, runStatements } from "./schema-utils.mjs";

const client = new Client({ connectionString: loadDatabaseUrl(process.cwd()) });

try {
  await client.connect();
  await runStatements(client, hardeningStatements, { ignoreDuplicateErrors: true });
} finally {
  await client.end();
}
