import { defineConfig } from "drizzle-kit";
import { ensureDatabaseUrlLoaded } from "./src/load-env";

const databaseUrl = ensureDatabaseUrlLoaded();

if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is missing. Add it to a workspace .env file or artifacts/api-server/.env.",
  );
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
