import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import {
  hardeningStatements,
  loadDatabaseUrl,
  runStatements,
  splitSqlStatements,
} from "./schema-utils.mjs";

const client = new Client({ connectionString: loadDatabaseUrl(process.cwd()) });

try {
  await client.connect();

  const tableCheck = await client.query(`
    select exists (
      select 1
      from information_schema.tables
      where table_schema = 'public' and table_name = 'companies'
    ) as has_companies_table
  `);

  const hasCompaniesTable = Boolean(tableCheck.rows[0]?.has_companies_table);

  if (!hasCompaniesTable) {
    const migrationPath = path.resolve(process.cwd(), "./drizzle/0000_tiny_ozymandias.sql");
    const migrationSql = fs.readFileSync(migrationPath, "utf8");
    const statements = splitSqlStatements(migrationSql);
    await runStatements(client, statements);
  } else {
    await runStatements(client, hardeningStatements, { ignoreDuplicateErrors: true });
  }
} finally {
  await client.end();
}
