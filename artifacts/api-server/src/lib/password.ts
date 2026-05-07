import bcrypt from "bcryptjs";
import { createHash, timingSafeEqual } from "node:crypto";

const PASSWORD_ROUNDS = 12;
const LEGACY_PASSWORD_SALT = "blockvotes_salt";

function hashLegacyPassword(password: string): string {
  return createHash("sha256")
    .update(password + LEGACY_PASSWORD_SALT)
    .digest("hex");
}

export function isLegacyPasswordHash(hashedPassword: string): boolean {
  return /^[a-f0-9]{64}$/i.test(hashedPassword.trim());
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_ROUNDS);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  if (!password || !hashedPassword) return false;

  if (isLegacyPasswordHash(hashedPassword)) {
    const legacyHash = hashLegacyPassword(password);
    const provided = Buffer.from(legacyHash, "utf8");
    const stored = Buffer.from(hashedPassword, "utf8");
    return provided.length === stored.length && timingSafeEqual(provided, stored);
  }

  return bcrypt.compare(password, hashedPassword);
}
