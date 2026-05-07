import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const explicitEnvKeys = new Set(Object.keys(process.env));

function stripWrappingQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function applyEnvFile(filePath: string, allowOverride: boolean): void {
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = stripWrappingQuotes(line.slice(separatorIndex + 1).trim());
    if (!key || !value) continue;

    if (allowOverride) {
      if (!explicitEnvKeys.has(key)) {
        process.env[key] = value;
      }
      continue;
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

const cwd = process.cwd();
applyEnvFile(path.join(cwd, ".env"), false);
applyEnvFile(path.join(cwd, ".env.local"), true);
