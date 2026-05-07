import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function parseDatabaseUrlFromEnvFile(filePath: string): string | null {
  const content = readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (key !== "DATABASE_URL") continue;

    const value = stripWrappingQuotes(line.slice(separatorIndex + 1).trim());
    return value || null;
  }

  return null;
}

function getCandidateEnvFiles(): string[] {
  const candidates = new Set<string>();
  let currentDir = path.resolve(process.cwd());

  while (true) {
    candidates.add(path.join(currentDir, ".env"));
    candidates.add(path.join(currentDir, ".env.local"));
    candidates.add(path.join(currentDir, "artifacts", "api-server", ".env"));
    candidates.add(path.join(currentDir, "artifacts", "api-server", ".env.local"));

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  return [...candidates];
}

export function ensureDatabaseUrlLoaded(): string | null {
  const currentValue = process.env.DATABASE_URL?.trim();
  if (currentValue) return currentValue;

  for (const filePath of getCandidateEnvFiles()) {
    if (!existsSync(filePath)) continue;

    const parsedValue = parseDatabaseUrlFromEnvFile(filePath)?.trim();
    if (!parsedValue) continue;

    process.env.DATABASE_URL = parsedValue;
    return parsedValue;
  }

  return null;
}
