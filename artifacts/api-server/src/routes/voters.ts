import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { votersTable, electionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  generatePassword,
  generateLoginOtp,
  sendVoterCredentials,
  sendVoterLoginOtpDelivery,
  sendVoterPasswordUpdatedNotice,
} from "../email-service";
import {
  ensureElectionBelongsToAdmin,
  ensureVoterBelongsToAdmin,
  requireAdminAuth,
  requireAdminCompanyId,
} from "../lib/admin-auth";
import { hashPassword, isLegacyPasswordHash, verifyPassword } from "../lib/password";
import { attachVoterSessionCookie, createVoterSessionToken } from "../lib/voter-auth";

const router: IRouter = Router();
const requiredCsvHeaders = ["name", "voter_id", "aadhar_id", "mobile", "email_id", "age", "gender"] as const;
const LOGIN_OTP_VALIDITY_MS = 10 * 60 * 1000;
const LOGIN_OTP_MAX_ATTEMPTS = 5;
const LOGIN_INITIATE_MAX_ATTEMPTS = 5;
const LOGIN_INITIATE_LOCKOUT_MS = 15 * 60 * 1000;
const LOGIN_OTP_GLOBAL_MAX_ATTEMPTS = 8;
const LOGIN_OTP_GLOBAL_LOCKOUT_MS = 15 * 60 * 1000;
const LOGIN_OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const PASSWORD_CHANGE_REPORT_VALIDITY_MS = 24 * 60 * 60 * 1000;

type RequiredCsvHeader = (typeof requiredCsvHeaders)[number];
type RegisterVoterInput = {
  electionId: string;
  electionName: string;
  electionStartAt?: Date | null;
  electionEndAt?: Date | null;
  email: string;
  name: string;
  voterId?: string | null;
  aadharId?: string | null;
  mobile?: string | null;
  photoUrl?: string | null;
  signatureUrl?: string | null;
  age?: number | null;
  gender?: string | null;
};
type RegisterVoterResult = {
  status: "success" | "error";
  message: string;
  password?: string;
  email_sent?: boolean;
  email_error?: string;
};
type PendingLoginOtpSession = {
  challengeId: string;
  voterId: string;
  electionId: string;
  email: string;
  mobile: string;
  otpHash: string;
  expiresAt: Date;
  attempts: number;
};
type LoginAttemptState = {
  failedAttempts: number;
  lockedUntilMs: number | null;
};
type OtpLockState = {
  failedAttempts: number;
  lockedUntilMs: number | null;
};
type OtpCooldownState = {
  resendAllowedAtMs: number;
};
type PasswordChangeReportSession = {
  voterId: string;
  electionId: string;
  expiresAtMs: number;
};
type CsvPreparedVoter = {
  row: number;
  name: string;
  emailId: string;
  voterId: string;
  aadharId: string;
  mobile: string;
  age: number;
  gender: string;
};
type CsvValidationRowResult = {
  row: number;
  status: "valid" | "error";
  name: string;
  email_id: string;
  message: string;
};
type CsvValidationSummary = {
  total: number;
  valid: number;
  invalid: number;
  rows: CsvValidationRowResult[];
  prepared: CsvPreparedVoter[];
};

const pendingLoginOtpSessions = new Map<string, PendingLoginOtpSession>();
const loginAttemptStateByCredential = new Map<string, LoginAttemptState>();
const otpLockStateByVoterId = new Map<string, OtpLockState>();
const otpResendCooldownByVoterId = new Map<string, OtpCooldownState>();
const passwordChangeReportSessions = new Map<string, PasswordChangeReportSession>();

function getSingleValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function normalizeCredentialInput(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toUpperCase();
}

function normalizeOtpInput(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, "").trim();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeVoterId(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeAadharId(value: string): string {
  return value.replace(/\D/g, "");
}

function normalizeGender(value: string): string {
  return value.trim().toLowerCase();
}

const allowedGenders = new Set(["male", "female", "other"]);

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidMobile(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

function isValidAadharId(value: string): boolean {
  return /^\d{12}$/.test(normalizeAadharId(value));
}

function isValidImageLikeValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(trimmed)) return true;

  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidPasswordFormat(value: string): boolean {
  return /^[A-Z0-9]{6,20}$/.test(value);
}

function createCredentialKey(electionId: string, email: string): string {
  return `${electionId.trim().toLowerCase()}::${normalizeEmail(email)}`;
}

function getRetryAfterSeconds(untilMs: number): number {
  return Math.max(1, Math.ceil((untilMs - Date.now()) / 1000));
}

function cleanupLoginSecurityState(): void {
  const now = Date.now();

  for (const [key, state] of loginAttemptStateByCredential.entries()) {
    if (state.lockedUntilMs && state.lockedUntilMs <= now) {
      loginAttemptStateByCredential.delete(key);
    }
  }

  for (const [voterId, state] of otpLockStateByVoterId.entries()) {
    if (state.lockedUntilMs && state.lockedUntilMs <= now) {
      otpLockStateByVoterId.delete(voterId);
    }
  }

  for (const [voterId, state] of otpResendCooldownByVoterId.entries()) {
    if (state.resendAllowedAtMs <= now) {
      otpResendCooldownByVoterId.delete(voterId);
    }
  }
}

function getCredentialLockRetrySeconds(credentialKey: string): number | null {
  const state = loginAttemptStateByCredential.get(credentialKey);
  if (!state?.lockedUntilMs) return null;
  if (state.lockedUntilMs <= Date.now()) {
    loginAttemptStateByCredential.delete(credentialKey);
    return null;
  }
  return getRetryAfterSeconds(state.lockedUntilMs);
}

function registerCredentialFailure(credentialKey: string): {
  locked: boolean;
  retryAfterSeconds?: number;
  remainingAttempts?: number;
} {
  const now = Date.now();
  const current = loginAttemptStateByCredential.get(credentialKey) || {
    failedAttempts: 0,
    lockedUntilMs: null,
  };

  if (current.lockedUntilMs && current.lockedUntilMs > now) {
    return {
      locked: true,
      retryAfterSeconds: getRetryAfterSeconds(current.lockedUntilMs),
    };
  }

  current.failedAttempts += 1;

  if (current.failedAttempts >= LOGIN_INITIATE_MAX_ATTEMPTS) {
    current.lockedUntilMs = now + LOGIN_INITIATE_LOCKOUT_MS;
    current.failedAttempts = 0;
    loginAttemptStateByCredential.set(credentialKey, current);
    return {
      locked: true,
      retryAfterSeconds: getRetryAfterSeconds(current.lockedUntilMs),
    };
  }

  loginAttemptStateByCredential.set(credentialKey, current);
  return {
    locked: false,
    remainingAttempts: LOGIN_INITIATE_MAX_ATTEMPTS - current.failedAttempts,
  };
}

function clearCredentialFailures(credentialKey: string): void {
  loginAttemptStateByCredential.delete(credentialKey);
}

function getOtpLockRetrySeconds(voterId: string): number | null {
  const state = otpLockStateByVoterId.get(voterId);
  if (!state?.lockedUntilMs) return null;
  if (state.lockedUntilMs <= Date.now()) {
    otpLockStateByVoterId.delete(voterId);
    return null;
  }
  return getRetryAfterSeconds(state.lockedUntilMs);
}

function registerOtpFailure(voterId: string): {
  locked: boolean;
  retryAfterSeconds?: number;
  remainingAttempts?: number;
} {
  const now = Date.now();
  const current = otpLockStateByVoterId.get(voterId) || {
    failedAttempts: 0,
    lockedUntilMs: null,
  };

  if (current.lockedUntilMs && current.lockedUntilMs > now) {
    return {
      locked: true,
      retryAfterSeconds: getRetryAfterSeconds(current.lockedUntilMs),
    };
  }

  current.failedAttempts += 1;

  if (current.failedAttempts >= LOGIN_OTP_GLOBAL_MAX_ATTEMPTS) {
    current.lockedUntilMs = now + LOGIN_OTP_GLOBAL_LOCKOUT_MS;
    current.failedAttempts = 0;
    otpLockStateByVoterId.set(voterId, current);
    return {
      locked: true,
      retryAfterSeconds: getRetryAfterSeconds(current.lockedUntilMs),
    };
  }

  otpLockStateByVoterId.set(voterId, current);
  return {
    locked: false,
    remainingAttempts: LOGIN_OTP_GLOBAL_MAX_ATTEMPTS - current.failedAttempts,
  };
}

function clearOtpFailures(voterId: string): void {
  otpLockStateByVoterId.delete(voterId);
}

function getOtpResendRetrySeconds(voterId: string): number | null {
  const cooldown = otpResendCooldownByVoterId.get(voterId);
  if (!cooldown) return null;
  if (cooldown.resendAllowedAtMs <= Date.now()) {
    otpResendCooldownByVoterId.delete(voterId);
    return null;
  }
  return getRetryAfterSeconds(cooldown.resendAllowedAtMs);
}

function setOtpResendCooldown(voterId: string): { resendAllowedAtIso: string; resendInSeconds: number } {
  const resendAllowedAtMs = Date.now() + LOGIN_OTP_RESEND_COOLDOWN_MS;
  otpResendCooldownByVoterId.set(voterId, { resendAllowedAtMs });
  return {
    resendAllowedAtIso: new Date(resendAllowedAtMs).toISOString(),
    resendInSeconds: Math.ceil(LOGIN_OTP_RESEND_COOLDOWN_MS / 1000),
  };
}

function cleanupExpiredLoginOtpSessions(): void {
  const now = Date.now();
  for (const [key, session] of pendingLoginOtpSessions.entries()) {
    if (session.expiresAt.getTime() <= now) {
      pendingLoginOtpSessions.delete(key);
    }
  }
}

function clearPreviousSessionsForVoter(voterId: string): void {
  for (const [key, session] of pendingLoginOtpSessions.entries()) {
    if (session.voterId === voterId) {
      pendingLoginOtpSessions.delete(key);
    }
  }
}

function cleanupExpiredPasswordChangeReportSessions(): void {
  const now = Date.now();
  for (const [token, session] of passwordChangeReportSessions.entries()) {
    if (session.expiresAtMs <= now) {
      passwordChangeReportSessions.delete(token);
    }
  }
}

function createPasswordChangeReportToken(voterId: string, electionId: string): string {
  cleanupExpiredPasswordChangeReportSessions();
  const token = randomUUID().replaceAll("-", "");
  passwordChangeReportSessions.set(token, {
    voterId,
    electionId,
    expiresAtMs: Date.now() + PASSWORD_CHANGE_REPORT_VALIDITY_MS,
  });
  return token;
}

function consumePasswordChangeReportToken(token: string): PasswordChangeReportSession | null {
  cleanupExpiredPasswordChangeReportSessions();
  const session = passwordChangeReportSessions.get(token);
  if (!session) return null;
  passwordChangeReportSessions.delete(token);
  return session;
}

function getApiBaseUrl(req: any): string {
  const configuredBaseUrl = process.env.API_URL?.trim() || process.env.PUBLIC_API_URL?.trim();
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  const forwardedProtoHeader = req.headers?.["x-forwarded-proto"];
  const forwardedProto = Array.isArray(forwardedProtoHeader)
    ? forwardedProtoHeader[0]
    : typeof forwardedProtoHeader === "string"
      ? forwardedProtoHeader.split(",")[0]
      : null;
  const protocol = forwardedProto || req.protocol || "http";
  const host = req.get("host") || "localhost:3000";

  return `${protocol}://${host}`;
}

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!name || !domain) return email;
  if (name.length <= 2) return `${name[0] ?? "*"}*@${domain}`;
  return `${name.slice(0, 2)}${"*".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

function maskMobile(mobile: string): string {
  const digits = mobile.replace(/\D/g, "");
  if (digits.length < 4) return mobile;
  const tail = digits.slice(-4);
  return `******${tail}`;
}

function formatIstDate(value: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeOptionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const parsed = Number.parseInt(trimmed, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if (char === '"') {
      const next = content[i + 1];
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(current);
      current = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && content[i + 1] === "\n") {
        i++;
      }
      row.push(current);
      rows.push(row);
      row = [];
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows;
}

function headerIndexMap(headerRow: string[]): Map<string, number> {
  const map = new Map<string, number>();

  headerRow.forEach((header, index) => {
    const normalized = header.trim().toLowerCase();
    if (normalized.length > 0) {
      map.set(normalized, index);
    }
  });

  return map;
}

function parseCsvWithHeaderValidation(csvContent: string):
  | { error: string }
  | { rows: string[][]; headerMap: Map<string, number> } {
  const rows = parseCsv(csvContent);
  if (rows.length < 2) {
    return { error: "CSV must include a header and at least one voter row" };
  }

  const headerRow = rows[0] || [];
  if (headerRow.length > 0) {
    headerRow[0] = headerRow[0]?.replace(/^\uFEFF/, "") ?? "";
  }

  const headerMap = headerIndexMap(headerRow);
  const missingHeaders = requiredCsvHeaders.filter(header => !headerMap.has(header));
  if (missingHeaders.length > 0) {
    return { error: `CSV is missing required headers: ${missingHeaders.join(", ")}` };
  }

  return { rows, headerMap };
}

function readRowCell(row: string[], headerMap: Map<string, number>, header: RequiredCsvHeader): string {
  const idx = headerMap.get(header);
  if (idx === undefined) return "";
  return (row[idx] ?? "").trim();
}

async function validateCsvRowsForElection(
  electionId: string,
  rows: string[][],
  headerMap: Map<string, number>,
): Promise<CsvValidationSummary> {
  const existingVoters = await db
    .select({
      email: votersTable.email,
      voterId: votersTable.voterId,
      aadharId: votersTable.aadharId,
    })
    .from(votersTable)
    .where(eq(votersTable.electionId, electionId));

  const existingEmails = new Set(
    existingVoters
      .map(voter => normalizeEmail(voter.email))
      .filter(email => email.length > 0),
  );
  const existingVoterIds = new Set(
    existingVoters
      .map(voter => (voter.voterId ? normalizeVoterId(voter.voterId) : ""))
      .filter(voterId => voterId.length > 0),
  );
  const existingAadharIds = new Set(
    existingVoters
      .map(voter => (voter.aadharId ? normalizeAadharId(voter.aadharId) : ""))
      .filter(aadharId => aadharId.length > 0),
  );

  const seenEmailsInCsv = new Map<string, number>();
  const seenVoterIdsInCsv = new Map<string, number>();
  const seenAadharIdsInCsv = new Map<string, number>();

  const summary: CsvValidationSummary = {
    total: 0,
    valid: 0,
    invalid: 0,
    rows: [],
    prepared: [],
  };

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] || [];
    if (row.every(cell => cell.trim().length === 0)) {
      continue;
    }

    const rowNumber = i + 1;
    summary.total += 1;

    const name = readRowCell(row, headerMap, "name");
    const voterId = readRowCell(row, headerMap, "voter_id");
    const aadharId = readRowCell(row, headerMap, "aadhar_id");
    const mobile = readRowCell(row, headerMap, "mobile");
    const emailId = readRowCell(row, headerMap, "email_id");
    const ageRaw = readRowCell(row, headerMap, "age");
    const gender = readRowCell(row, headerMap, "gender");

    const missingValues: string[] = [];
    if (!name) missingValues.push("name");
    if (!voterId) missingValues.push("voter_id");
    if (!aadharId) missingValues.push("aadhar_id");
    if (!mobile) missingValues.push("mobile");
    if (!emailId) missingValues.push("email_id");
    if (!ageRaw) missingValues.push("age");
    if (!gender) missingValues.push("gender");

    if (missingValues.length > 0) {
      summary.invalid += 1;
      summary.rows.push({
        row: rowNumber,
        status: "error",
        name,
        email_id: emailId,
        message: `Missing required value(s): ${missingValues.join(", ")}`,
      });
      continue;
    }

    const normalizedEmail = normalizeEmail(emailId);
    if (!isValidEmail(normalizedEmail)) {
      summary.invalid += 1;
      summary.rows.push({
        row: rowNumber,
        status: "error",
        name,
        email_id: emailId,
        message: "Invalid email format",
      });
      continue;
    }

    const normalizedVoterId = normalizeVoterId(voterId);
    if (!normalizedVoterId) {
      summary.invalid += 1;
      summary.rows.push({
        row: rowNumber,
        status: "error",
        name,
        email_id: emailId,
        message: "Invalid voter_id value",
      });
      continue;
    }

    const normalizedAadharId = normalizeAadharId(aadharId);
    if (!isValidAadharId(aadharId)) {
      summary.invalid += 1;
      summary.rows.push({
        row: rowNumber,
        status: "error",
        name,
        email_id: emailId,
        message: "Invalid aadhar_id value. Use exactly 12 digits.",
      });
      continue;
    }

    if (!isValidMobile(mobile)) {
      summary.invalid += 1;
      summary.rows.push({
        row: rowNumber,
        status: "error",
        name,
        email_id: emailId,
        message: "Invalid mobile number. Use 10 to 15 digits.",
      });
      continue;
    }

    const age = Number.parseInt(ageRaw, 10);
    if (Number.isNaN(age) || age <= 0) {
      summary.invalid += 1;
      summary.rows.push({
        row: rowNumber,
        status: "error",
        name,
        email_id: emailId,
        message: "Invalid age value. Age must be a positive integer",
      });
      continue;
    }

    const normalizedGender = normalizeGender(gender);
    if (!allowedGenders.has(normalizedGender)) {
      summary.invalid += 1;
      summary.rows.push({
        row: rowNumber,
        status: "error",
        name,
        email_id: emailId,
        message: "Invalid gender value. Allowed values: male, female, other",
      });
      continue;
    }

    if (existingEmails.has(normalizedEmail)) {
      summary.invalid += 1;
      summary.rows.push({
        row: rowNumber,
        status: "error",
        name,
        email_id: emailId,
        message: "Voter already exists for this election (email)",
      });
      continue;
    }

    if (seenEmailsInCsv.has(normalizedEmail)) {
      const duplicateOf = seenEmailsInCsv.get(normalizedEmail);
      summary.invalid += 1;
      summary.rows.push({
        row: rowNumber,
        status: "error",
        name,
        email_id: emailId,
        message: `Duplicate email in CSV (already used at row ${duplicateOf})`,
      });
      continue;
    }

    if (existingVoterIds.has(normalizedVoterId)) {
      summary.invalid += 1;
      summary.rows.push({
        row: rowNumber,
        status: "error",
        name,
        email_id: emailId,
        message: "Voter already exists for this election (voter_id)",
      });
      continue;
    }

    if (existingAadharIds.has(normalizedAadharId)) {
      summary.invalid += 1;
      summary.rows.push({
        row: rowNumber,
        status: "error",
        name,
        email_id: emailId,
        message: "Voter already exists for this election (aadhar_id)",
      });
      continue;
    }

    if (seenVoterIdsInCsv.has(normalizedVoterId)) {
      const duplicateOf = seenVoterIdsInCsv.get(normalizedVoterId);
      summary.invalid += 1;
      summary.rows.push({
        row: rowNumber,
        status: "error",
        name,
        email_id: emailId,
        message: `Duplicate voter_id in CSV (already used at row ${duplicateOf})`,
      });
      continue;
    }

    if (seenAadharIdsInCsv.has(normalizedAadharId)) {
      const duplicateOf = seenAadharIdsInCsv.get(normalizedAadharId);
      summary.invalid += 1;
      summary.rows.push({
        row: rowNumber,
        status: "error",
        name,
        email_id: emailId,
        message: `Duplicate aadhar_id in CSV (already used at row ${duplicateOf})`,
      });
      continue;
    }

    seenEmailsInCsv.set(normalizedEmail, rowNumber);
    seenVoterIdsInCsv.set(normalizedVoterId, rowNumber);
    seenAadharIdsInCsv.set(normalizedAadharId, rowNumber);
    summary.valid += 1;
    summary.prepared.push({
      row: rowNumber,
      name: name.trim(),
      emailId: normalizedEmail,
      voterId: voterId.trim(),
      aadharId: normalizedAadharId,
      mobile: mobile.trim(),
      age,
      gender: normalizedGender,
    });
    summary.rows.push({
      row: rowNumber,
      status: "valid",
      name: name.trim(),
      email_id: normalizedEmail,
      message: "Ready for import",
    });
  }

  return summary;
}

async function getElectionById(electionId: string): Promise<{
  id: string;
  name: string;
  scheduledStartAt: Date | null;
  scheduledEndAt: Date | null;
} | null> {
  const elections = await db.select().from(electionsTable).where(eq(electionsTable.id, electionId));
  if (elections.length === 0) return null;
  const election = elections[0];
  return {
    id: election.id,
    name: election.name || "Election",
    scheduledStartAt: election.scheduledStartAt,
    scheduledEndAt: election.scheduledEndAt,
  };
}

async function registerVoter(input: RegisterVoterInput): Promise<RegisterVoterResult> {
  const safeVoterId = input.voterId?.trim() || null;
  const safeAadharId = input.aadharId ? normalizeAadharId(input.aadharId) : null;
  if (input.aadharId && !isValidAadharId(input.aadharId)) {
    return { status: "error", message: "Invalid aadhar_id value. Use exactly 12 digits." };
  }

  const existing = await db
    .select()
    .from(votersTable)
    .where(and(eq(votersTable.electionId, input.electionId), eq(votersTable.email, input.email)));

  if (existing.length > 0) {
    return { status: "error", message: "Voter already registered for this election" };
  }

  if (safeVoterId) {
    const existingByVoterId = await db
      .select()
      .from(votersTable)
      .where(and(eq(votersTable.electionId, input.electionId), eq(votersTable.voterId, safeVoterId)));
    if (existingByVoterId.length > 0) {
      return { status: "error", message: "Voter ID already registered for this election" };
    }
  }

  if (safeAadharId) {
    const existingByAadharId = await db
      .select()
      .from(votersTable)
      .where(and(eq(votersTable.electionId, input.electionId), eq(votersTable.aadharId, safeAadharId)));
    if (existingByAadharId.length > 0) {
      return { status: "error", message: "Aadhar ID already registered for this election" };
    }
  }

  const id = randomUUID();
  const generatedPassword = generatePassword();
  const normalizedPassword = normalizeCredentialInput(generatedPassword);
  const hashedPassword = await hashPassword(normalizedPassword);

  await db.insert(votersTable).values({
    id,
    electionId: input.electionId,
    email: input.email,
    name: input.name,
    password: hashedPassword,
    hasVoted: false,
    voterId: safeVoterId,
    aadharId: safeAadharId,
    mobile: input.mobile ?? null,
    photoUrl: input.photoUrl ?? null,
    signatureUrl: input.signatureUrl ?? null,
    profileCompleted: false,
    profileCompletedAt: null,
    age: input.age ?? null,
    gender: input.gender ?? null,
  });

  const emailResult = await sendVoterCredentials({
    to: input.email,
    voterName: input.name,
    electionName: input.electionName,
    electionId: input.electionId,
    password: generatedPassword,
    electionStartAt: input.electionStartAt ?? null,
    electionEndAt: input.electionEndAt ?? null,
  });

  return {
    status: "success",
    message: emailResult.sent
      ? `Voter added! Login credentials emailed to ${input.email}.`
      : `Voter added! Email not sent (${emailResult.error}). Share the password manually.`,
    password: generatedPassword,
    email_sent: emailResult.sent,
    email_error: emailResult.error,
  };
}

async function initiateVoterLogin(req: any, res: any): Promise<void> {
  try {
    cleanupExpiredLoginOtpSessions();
    cleanupLoginSecurityState();

    const { email, password, election_id } = req.body;
    if (!email || !password || !election_id) {
      res.json({
        status: "error",
        message: "email, password, and election_id are required",
        data: null,
      });
      return;
    }

    const normalizedPassword = normalizeCredentialInput(password);
    const normalizedEmail = typeof email === "string" ? normalizeEmail(email) : "";
    const credentialKey = createCredentialKey(election_id, normalizedEmail);

    const credentialLockSeconds = getCredentialLockRetrySeconds(credentialKey);
    if (credentialLockSeconds) {
      res.json({
        status: "error",
        message: `Too many failed login attempts. Try again in ${credentialLockSeconds} second(s).`,
        data: {
          retry_after_seconds: credentialLockSeconds,
          lock_reason: "credentials",
        },
      });
      return;
    }

    const results = await db
      .select()
      .from(votersTable)
      .where(
        and(
          eq(votersTable.electionId, election_id),
          eq(votersTable.email, normalizedEmail),
        ),
      );
    if (results.length === 0) {
      const attempt = registerCredentialFailure(credentialKey);
      res.json({
        status: "error",
        message: attempt.locked
          ? `Too many failed login attempts. Try again in ${attempt.retryAfterSeconds} second(s).`
          : `Invalid credentials or election ID. ${attempt.remainingAttempts} attempt(s) remaining before lockout.`,
        data: attempt.locked
          ? {
              retry_after_seconds: attempt.retryAfterSeconds,
              lock_reason: "credentials",
            }
          : {
              remaining_attempts: attempt.remainingAttempts,
            },
      });
      return;
    }

    const voter = results[0];
    const passwordMatches = await verifyPassword(normalizedPassword, voter.password);
    if (!passwordMatches) {
      const attempt = registerCredentialFailure(credentialKey);
      res.json({
        status: "error",
        message: attempt.locked
          ? `Too many failed login attempts. Try again in ${attempt.retryAfterSeconds} second(s).`
          : `Invalid credentials or election ID. ${attempt.remainingAttempts} attempt(s) remaining before lockout.`,
        data: attempt.locked
          ? {
              retry_after_seconds: attempt.retryAfterSeconds,
              lock_reason: "credentials",
            }
          : {
              remaining_attempts: attempt.remainingAttempts,
            },
      });
      return;
    }

    if (isLegacyPasswordHash(voter.password)) {
      await db
        .update(votersTable)
        .set({ password: await hashPassword(normalizedPassword) })
        .where(
          and(
            eq(votersTable.id, voter.id),
            eq(votersTable.electionId, voter.electionId),
          ),
        );
    }
    clearCredentialFailures(credentialKey);

    const otpLockSeconds = getOtpLockRetrySeconds(voter.id);
    if (otpLockSeconds) {
      res.json({
        status: "error",
        message: `OTP verification is temporarily locked. Try again in ${otpLockSeconds} second(s).`,
        data: {
          retry_after_seconds: otpLockSeconds,
          lock_reason: "otp",
        },
      });
      return;
    }

    const resendRetrySeconds = getOtpResendRetrySeconds(voter.id);
    if (resendRetrySeconds) {
      res.json({
        status: "error",
        message: `Please wait ${resendRetrySeconds} second(s) before requesting a new OTP.`,
        data: {
          retry_after_seconds: resendRetrySeconds,
          lock_reason: "resend_cooldown",
          masked_email: maskEmail(voter.email),
          masked_mobile: voter.mobile ? maskMobile(voter.mobile) : null,
        },
      });
      return;
    }

    const mobile = voter.mobile?.trim();
    if (!mobile) {
      res.json({
        status: "error",
        message: "Mobile number is not configured for this voter account",
        data: null,
      });
      return;
    }

    const challengeId = randomUUID();
    const otp = generateLoginOtp();
    const otpHash = await hashPassword(normalizeOtpInput(otp));
    const expiresAt = new Date(Date.now() + LOGIN_OTP_VALIDITY_MS);

    clearPreviousSessionsForVoter(voter.id);
    pendingLoginOtpSessions.set(challengeId, {
      challengeId,
      voterId: voter.id,
      electionId: voter.electionId,
      email: voter.email,
      mobile,
      otpHash,
      expiresAt,
      attempts: 0,
    });

    const electionMeta = await getElectionById(voter.electionId);
    const electionName = electionMeta?.name || "Election";
    const delivery = await sendVoterLoginOtpDelivery({
      to: voter.email,
      mobile,
      voterName: voter.name,
      electionName,
      otp,
    });

    if (!delivery.sent) {
      pendingLoginOtpSessions.delete(challengeId);
      res.json({
        status: "error",
        message: delivery.error || "Failed to send OTP to email and mobile",
        data: {
          email_sent: delivery.email_sent,
          sms_sent: delivery.sms_sent,
        },
      });
      return;
    }

    const cooldownInfo = setOtpResendCooldown(voter.id);
    const channelText =
      delivery.email_sent && delivery.sms_sent
        ? "registered email and mobile number"
        : delivery.email_sent
          ? "registered email"
          : "registered mobile number";

    res.json({
      status: "success",
      message: `OTP sent to your ${channelText}`,
      data: {
        challenge_id: challengeId,
        expires_at: expiresAt.toISOString(),
        expires_in_seconds: LOGIN_OTP_VALIDITY_MS / 1000,
        masked_email: maskEmail(voter.email),
        masked_mobile: maskMobile(mobile),
        email_sent: delivery.email_sent,
        sms_sent: delivery.sms_sent,
        delivery_warning: delivery.error || null,
        resend_available_at: cooldownInfo.resendAllowedAtIso,
        resend_available_in_seconds: cooldownInfo.resendInSeconds,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error", data: null });
  }
}

router.get("/", requireAdminAuth, async (req, res) => {
  try {
    const { election_id } = req.query;
    if (!election_id) {
      res.json({ status: "error", message: "election_id is required", data: [] });
      return;
    }
    const companyId = requireAdminCompanyId(req);
    const election = await ensureElectionBelongsToAdmin(election_id as string, companyId);
    if (!election) {
      res.status(404).json({ status: "error", message: "Election not found", data: [] });
      return;
    }
    const voters = await db.select().from(votersTable).where(eq(votersTable.electionId, election_id as string));
    const mapped = voters.map(v => ({
      id: v.id,
      election_id: v.electionId,
      email: v.email,
      email_id: v.email,
      name: v.name,
      voter_id: v.voterId,
      aadhar_id: v.aadharId,
      mobile: v.mobile,
      photo_url: v.photoUrl,
      signature_url: v.signatureUrl,
      profile_completed: v.profileCompleted,
      profile_completed_at: v.profileCompletedAt,
      age: v.age,
      gender: v.gender,
      has_voted: v.hasVoted,
      created_at: v.createdAt,
    }));
    res.json({ status: "success", message: "Voters fetched", data: mapped });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error", data: [] });
  }
});

router.post("/", requireAdminAuth, async (req, res) => {
  try {
    const { election_id, email, name, voter_id, aadhar_id, mobile, photo_url, signature_url, age, gender } = req.body;

    if (!election_id || !email || !name) {
      res.json({ status: "error", message: "election_id, email, and name are required" });
      return;
    }

    const companyId = requireAdminCompanyId(req);
    const ownedElection = await ensureElectionBelongsToAdmin(election_id, companyId);
    if (!ownedElection) {
      res.status(404).json({ status: "error", message: "Election not found" });
      return;
    }

    const electionMeta = await getElectionById(election_id);
    if (!electionMeta) {
      res.json({ status: "error", message: "Election not found" });
      return;
    }

    const result = await registerVoter({
      electionId: election_id,
      electionName: electionMeta.name,
      electionStartAt: electionMeta.scheduledStartAt,
      electionEndAt: electionMeta.scheduledEndAt,
      email: normalizeEmail(email),
      name,
      voterId: normalizeOptionalText(voter_id),
      aadharId: normalizeOptionalText(aadhar_id),
      mobile: normalizeOptionalText(mobile),
      photoUrl: normalizeOptionalText(photo_url),
      signatureUrl: normalizeOptionalText(signature_url),
      age: normalizeOptionalNumber(age),
      gender: normalizeOptionalText(gender),
    });

    if (result.status === "error") {
      res.json({ status: "error", message: result.message });
      return;
    }

    res.json({
      status: "success",
      message: result.message,
      data: {
        password: result.password,
        email_sent: result.email_sent,
        email_error: result.email_error,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error" });
  }
});

router.post("/import/preview", requireAdminAuth, async (req, res) => {
  try {
    const { election_id, csv_content } = req.body;

    if (!election_id || typeof election_id !== "string") {
      res.json({ status: "error", message: "election_id is required" });
      return;
    }

    if (!csv_content || typeof csv_content !== "string") {
      res.json({ status: "error", message: "csv_content is required" });
      return;
    }

    const companyId = requireAdminCompanyId(req);
    const electionExists = await ensureElectionBelongsToAdmin(election_id, companyId);
    if (!electionExists) {
      res.json({ status: "error", message: "Election not found" });
      return;
    }

    const parsed = parseCsvWithHeaderValidation(csv_content);
    if ("error" in parsed) {
      res.json({ status: "error", message: parsed.error });
      return;
    }

    const validation = await validateCsvRowsForElection(election_id, parsed.rows, parsed.headerMap);
    if (validation.total === 0) {
      res.json({ status: "error", message: "CSV has no voter records" });
      return;
    }

    const status = validation.invalid === 0 ? "success" : validation.valid > 0 ? "partial_success" : "error";
    res.json({
      status,
      message: `Preview complete: ${validation.total} row(s), ${validation.valid} valid, ${validation.invalid} invalid.`,
      data: {
        total: validation.total,
        valid: validation.valid,
        invalid: validation.invalid,
        results: validation.rows,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error" });
  }
});

router.post("/import", requireAdminAuth, async (req, res) => {
  try {
    const { election_id, csv_content } = req.body;

    if (!election_id || typeof election_id !== "string") {
      res.json({ status: "error", message: "election_id is required" });
      return;
    }

    if (!csv_content || typeof csv_content !== "string") {
      res.json({ status: "error", message: "csv_content is required" });
      return;
    }

    const companyId = requireAdminCompanyId(req);
    const ownedElection = await ensureElectionBelongsToAdmin(election_id, companyId);
    if (!ownedElection) {
      res.json({ status: "error", message: "Election not found" });
      return;
    }
    const electionMeta = await getElectionById(election_id);
    if (!electionMeta) {
      res.json({ status: "error", message: "Election not found" });
      return;
    }

    const parsed = parseCsvWithHeaderValidation(csv_content);
    if ("error" in parsed) {
      res.json({ status: "error", message: parsed.error });
      return;
    }

    const validation = await validateCsvRowsForElection(election_id, parsed.rows, parsed.headerMap);
    if (validation.total === 0) {
      res.json({ status: "error", message: "CSV has no voter records" });
      return;
    }

    if (validation.valid === 0) {
      res.json({
        status: "error",
        message: "No valid voter rows found. Fix validation issues and try again.",
        data: {
          total: validation.total,
          added: 0,
          failed: validation.invalid,
          results: validation.rows.map(row => ({
            row: row.row,
            status: "error",
            name: row.name,
            email_id: row.email_id,
            message: row.message,
          })),
        },
      });
      return;
    }

    const results: Array<{
      row: number;
      status: "success" | "error";
      name: string;
      email_id: string;
      message: string;
    }> = validation.rows
      .filter(row => row.status === "error")
      .map(row => ({
        row: row.row,
        status: "error" as const,
        name: row.name,
        email_id: row.email_id,
        message: row.message,
      }));

    let added = 0;
    let failed = validation.invalid;

    for (const preparedRow of validation.prepared) {
      const registerResult = await registerVoter({
        electionId: election_id,
        electionName: electionMeta.name,
        electionStartAt: electionMeta.scheduledStartAt,
        electionEndAt: electionMeta.scheduledEndAt,
        email: preparedRow.emailId,
        name: preparedRow.name,
        voterId: preparedRow.voterId,
        aadharId: preparedRow.aadharId,
        mobile: preparedRow.mobile,
        age: preparedRow.age,
        gender: preparedRow.gender,
      });

      if (registerResult.status === "error") {
        failed += 1;
        results.push({
          row: preparedRow.row,
          status: "error",
          name: preparedRow.name,
          email_id: preparedRow.emailId,
          message: registerResult.message,
        });
        continue;
      }

      added += 1;
      results.push({
        row: preparedRow.row,
        status: "success",
        name: preparedRow.name,
        email_id: preparedRow.emailId,
        message: registerResult.message,
      });
    }

    results.sort((a, b) => a.row - b.row);

    const status = added === 0 ? "error" : failed === 0 ? "success" : "partial_success";
    res.json({
      status,
      message: `Processed ${validation.total} voter record(s): ${added} added, ${failed} failed.`,
      data: {
        total: validation.total,
        added,
        failed,
        results,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error" });
  }
});

router.post("/credential-info", requireAdminAuth, async (req, res) => {
  try {
    const { election_id, email } = req.body;

    if (!election_id || !email) {
      res.json({
        status: "error",
        message: "election_id and email are required",
        data: null,
      });
      return;
    }

    const companyId = requireAdminCompanyId(req);
    const election = await ensureElectionBelongsToAdmin(election_id as string, companyId);
    if (!election) {
      res.status(404).json({
        status: "error",
        message: "Election not found",
        data: null,
      });
      return;
    }

    const results = await db
      .select()
      .from(votersTable)
      .where(
        and(
          eq(votersTable.electionId, election_id as string),
          eq(votersTable.email, normalizeEmail(email as string)),
        ),
      );

    if (results.length === 0) {
      res.json({
        status: "success",
        message: "No credential info found",
        data: null,
      });
      return;
    }

    const voter = results[0];

    res.json({
      status: "success",
      message: "Credential info fetched",
      data: {
        sent_at: voter.createdAt,
        sent_on_ist: formatIstDate(voter.createdAt),
        mobile: voter.mobile,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error", data: null });
  }
});

router.post("/profile", async (req, res) => {
  try {
    const { voter_id, election_id } = req.body;

    if (!voter_id || !election_id) {
      res.json({
        status: "error",
        message: "voter_id and election_id are required",
        data: null,
      });
      return;
    }

    const elections = await db
      .select()
      .from(electionsTable)
      .where(eq(electionsTable.id, election_id as string));
    if (elections.length === 0) {
      res.json({ status: "error", message: "Election not found", data: null });
      return;
    }

    const results = await db
      .select()
      .from(votersTable)
      .where(
        and(
          eq(votersTable.id, voter_id as string),
          eq(votersTable.electionId, election_id as string),
        ),
      );

    if (results.length === 0) {
      res.json({ status: "error", message: "Voter not found", data: null });
      return;
    }

    const voter = results[0];
    res.json({
      status: "success",
      message: "Voter profile fetched",
      data: {
        id: voter.id,
        election_id: voter.electionId,
        election_status: elections[0]?.status,
        voter_id: voter.voterId,
        aadhar_id: voter.aadharId,
        email: voter.email,
        name: voter.name,
        mobile: voter.mobile,
        age: voter.age,
        gender: voter.gender,
        photo_url: voter.photoUrl,
        signature_url: voter.signatureUrl,
        profile_completed: voter.profileCompleted,
        profile_completed_at: voter.profileCompletedAt,
        has_voted: voter.hasVoted,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error", data: null });
  }
});

router.post("/profile/update", async (req, res) => {
  try {
    const {
      voter_id,
      election_id,
      name,
      mobile,
      age,
      gender,
      photo_url,
      signature_url,
    } = req.body;

    if (!voter_id || !election_id) {
      res.json({
        status: "error",
        message: "voter_id and election_id are required",
        data: null,
      });
      return;
    }

    const elections = await db
      .select()
      .from(electionsTable)
      .where(eq(electionsTable.id, election_id as string));
    if (elections.length === 0) {
      res.json({ status: "error", message: "Election not found", data: null });
      return;
    }

    const election = elections[0];
    if (election?.status !== "pending") {
      res.json({
        status: "error",
        message: "Profile update is allowed only before the election starts",
        data: null,
      });
      return;
    }

    const results = await db
      .select()
      .from(votersTable)
      .where(
        and(
          eq(votersTable.id, voter_id as string),
          eq(votersTable.electionId, election_id as string),
        ),
      );
    if (results.length === 0) {
      res.json({ status: "error", message: "Voter not found", data: null });
      return;
    }

    const voter = results[0];
    const normalizedName = normalizeOptionalText(name);
    const normalizedMobile = normalizeOptionalText(mobile);
    const normalizedGender = normalizeOptionalText(gender)?.toLowerCase() ?? null;
    const normalizedPhotoUrl = normalizeOptionalText(photo_url);
    const normalizedSignatureUrl = normalizeOptionalText(signature_url);
    const normalizedAge = normalizeOptionalNumber(age);

    const missingFields: string[] = [];
    if (!normalizedName) missingFields.push("name");
    if (!normalizedMobile) missingFields.push("mobile");
    if (!normalizedAge || normalizedAge <= 0) missingFields.push("age");
    if (!normalizedGender) missingFields.push("gender");
    if (!normalizedPhotoUrl) missingFields.push("photo_url");
    if (!normalizedSignatureUrl) missingFields.push("signature_url");

    if (missingFields.length > 0) {
      res.json({
        status: "error",
        message: `Missing required profile field(s): ${missingFields.join(", ")}`,
        data: null,
      });
      return;
    }

    const safeName = normalizedName as string;
    const safeMobile = normalizedMobile as string;
    const safeAge = normalizedAge as number;
    const safeGender = normalizedGender as string;
    const safePhotoUrl = normalizedPhotoUrl as string;
    const safeSignatureUrl = normalizedSignatureUrl as string;

    if (!isValidMobile(safeMobile)) {
      res.json({
        status: "error",
        message: "Invalid mobile number. Use 10 to 15 digits.",
        data: null,
      });
      return;
    }

    if (!allowedGenders.has(safeGender)) {
      res.json({
        status: "error",
        message: "Invalid gender value. Allowed values: male, female, other",
        data: null,
      });
      return;
    }

    if (!isValidImageLikeValue(safePhotoUrl)) {
      res.json({
        status: "error",
        message: "Invalid photo_url. Use a public http(s) URL or data:image base64 value.",
        data: null,
      });
      return;
    }

    if (!isValidImageLikeValue(safeSignatureUrl)) {
      res.json({
        status: "error",
        message: "Invalid signature_url. Use a public http(s) URL or data:image base64 value.",
        data: null,
      });
      return;
    }

    await db
      .update(votersTable)
      .set({
        name: safeName,
        mobile: safeMobile,
        age: safeAge,
        gender: safeGender,
        photoUrl: safePhotoUrl,
        signatureUrl: safeSignatureUrl,
        profileCompleted: true,
        profileCompletedAt: new Date(),
      })
      .where(
        and(
          eq(votersTable.id, voter.id),
          eq(votersTable.electionId, voter.electionId),
        ),
      );

    res.json({
      status: "success",
      message: "Profile updated successfully. You can now cast your vote once election starts.",
      data: {
        id: voter.id,
        election_id: voter.electionId,
        voter_id: voter.voterId,
        aadhar_id: voter.aadharId,
        email: voter.email,
        name: safeName,
        mobile: safeMobile,
        age: safeAge,
        gender: safeGender,
        photo_url: safePhotoUrl,
        signature_url: safeSignatureUrl,
        profile_completed: true,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error", data: null });
  }
});

router.post("/profile/change-password", async (req, res) => {
  try {
    const { voter_id, election_id, current_password, new_password } = req.body;

    if (!voter_id || !election_id || !current_password || !new_password) {
      res.json({
        status: "error",
        message: "voter_id, election_id, current_password and new_password are required",
        data: null,
      });
      return;
    }

    const elections = await db
      .select()
      .from(electionsTable)
      .where(eq(electionsTable.id, election_id as string));
    if (elections.length === 0) {
      res.json({ status: "error", message: "Election not found", data: null });
      return;
    }

    const election = elections[0];
    if (election?.status !== "pending") {
      res.json({
        status: "error",
        message: "Password change is allowed only before the election starts",
        data: null,
      });
      return;
    }

    const voters = await db
      .select()
      .from(votersTable)
      .where(
        and(
          eq(votersTable.id, voter_id as string),
          eq(votersTable.electionId, election_id as string),
        ),
      );
    if (voters.length === 0) {
      res.json({ status: "error", message: "Voter not found", data: null });
      return;
    }

    const voter = voters[0];
    const normalizedCurrent = normalizeCredentialInput(String(current_password));
    const currentPasswordMatches = await verifyPassword(normalizedCurrent, voter.password);
    if (!currentPasswordMatches) {
      res.json({
        status: "error",
        message: "Current password is incorrect",
        data: null,
      });
      return;
    }

    const normalizedNew = normalizeCredentialInput(String(new_password));
    if (!isValidPasswordFormat(normalizedNew)) {
      res.json({
        status: "error",
        message: "New password must be 6-20 characters and contain only letters or numbers",
        data: null,
      });
      return;
    }

    if (normalizedNew === normalizedCurrent) {
      res.json({
        status: "error",
        message: "New password must be different from current password",
        data: null,
      });
      return;
    }

    await db
      .update(votersTable)
      .set({ password: await hashPassword(normalizedNew) })
      .where(
        and(
          eq(votersTable.id, voter.id),
          eq(votersTable.electionId, voter.electionId),
        ),
      );

    clearPreviousSessionsForVoter(voter.id);
    clearOtpFailures(voter.id);

    const reportToken = createPasswordChangeReportToken(voter.id, voter.electionId);
    const reportUrl = `${getApiBaseUrl(req)}/api/voters/password-change/report?token=${encodeURIComponent(reportToken)}`;
    const passwordUpdatedEmail = await sendVoterPasswordUpdatedNotice({
      to: voter.email,
      voterName: voter.name,
      electionName: election?.name || "Election",
      electionId: voter.electionId,
      password: normalizedNew,
      reportUrl,
      electionStartAt: election?.scheduledStartAt || null,
      electionEndAt: election?.scheduledEndAt || null,
    });

    res.json({
      status: "success",
      message: passwordUpdatedEmail.sent
        ? "Password changed successfully. Confirmation email has been sent."
        : `Password changed successfully, but confirmation email failed (${passwordUpdatedEmail.error || "unknown error"}).`,
      data: {
        email_sent: passwordUpdatedEmail.sent,
        email_error: passwordUpdatedEmail.error,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error", data: null });
  }
});

router.get("/password-change/report", async (req, res) => {
  try {
    cleanupExpiredPasswordChangeReportSessions();

    const token = typeof req.query.token === "string" ? req.query.token.trim() : "";
    if (!token) {
      res.status(400).type("html").send(`
        <html><body style="font-family:Arial,sans-serif;padding:24px;background:#f8fafc;">
          <h2 style="color:#b91c1c;">Invalid request</h2>
          <p>This report link is invalid or missing a token.</p>
        </body></html>
      `);
      return;
    }

    const session = consumePasswordChangeReportToken(token);
    if (!session) {
      res.status(400).type("html").send(`
        <html><body style="font-family:Arial,sans-serif;padding:24px;background:#f8fafc;">
          <h2 style="color:#b91c1c;">Link expired</h2>
          <p>This report link is no longer valid. Please contact your election administrator.</p>
        </body></html>
      `);
      return;
    }

    const voters = await db
      .select()
      .from(votersTable)
      .where(
        and(
          eq(votersTable.id, session.voterId),
          eq(votersTable.electionId, session.electionId),
        ),
      );
    if (voters.length === 0) {
      res.status(404).type("html").send(`
        <html><body style="font-family:Arial,sans-serif;padding:24px;background:#f8fafc;">
          <h2 style="color:#b91c1c;">Voter not found</h2>
          <p>Unable to process this report. Please contact your election administrator.</p>
        </body></html>
      `);
      return;
    }

    const voter = voters[0];
    const elections = await db
      .select()
      .from(electionsTable)
      .where(eq(electionsTable.id, voter.electionId));
    const election = elections[0];
    const electionName = election?.name || "Election";

    const renewedPassword = generatePassword();
    const normalizedRenewedPassword = normalizeCredentialInput(renewedPassword);

    await db
      .update(votersTable)
      .set({ password: await hashPassword(normalizedRenewedPassword) })
      .where(
        and(
          eq(votersTable.id, voter.id),
          eq(votersTable.electionId, voter.electionId),
        ),
      );

    clearPreviousSessionsForVoter(voter.id);
    clearOtpFailures(voter.id);

    const emailResult = await sendVoterCredentials({
      to: voter.email,
      voterName: voter.name,
      electionName,
      electionId: voter.electionId,
      password: normalizedRenewedPassword,
      electionStartAt: election?.scheduledStartAt || null,
      electionEndAt: election?.scheduledEndAt || null,
    });

    if (!emailResult.sent) {
      res.status(500).type("html").send(`
        <html><body style="font-family:Arial,sans-serif;padding:24px;background:#f8fafc;">
          <h2 style="color:#b91c1c;">Report received</h2>
          <p>Your report was recorded and password was renewed, but we could not send the new credentials email.</p>
          <p>Please contact your election administrator immediately.</p>
        </body></html>
      `);
      return;
    }

    res.type("html").send(`
      <html><body style="font-family:Arial,sans-serif;padding:24px;background:#f8fafc;">
        <h2 style="color:#166534;">Security report submitted</h2>
        <p>Your password has been renewed and fresh credentials have been sent to your registered email.</p>
        <p>You can now close this page.</p>
      </body></html>
    `);
  } catch (err) {
    req.log.error(err);
    res.status(500).type("html").send(`
      <html><body style="font-family:Arial,sans-serif;padding:24px;background:#f8fafc;">
        <h2 style="color:#b91c1c;">Something went wrong</h2>
        <p>Unable to process your report right now. Please contact your election administrator.</p>
      </body></html>
    `);
  }
});

router.delete("/:voterId", requireAdminAuth, async (req, res) => {
  try {
    const voterId = getSingleValue(req.params.voterId);
    const companyId = requireAdminCompanyId(req);
    const voter = await ensureVoterBelongsToAdmin(voterId, companyId);
    if (!voter) {
      res.status(404).json({ status: "error", message: "Voter not found" });
      return;
    }
    await db.delete(votersTable).where(eq(votersTable.id, voterId));
    res.json({ status: "success", message: "Voter deleted successfully!" });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error" });
  }
});

router.post("/login", async (req, res) => {
  await initiateVoterLogin(req, res);
});

router.post("/login/initiate", async (req, res) => {
  await initiateVoterLogin(req, res);
});

router.post("/login/verify", async (req, res) => {
  try {
    cleanupExpiredLoginOtpSessions();
    cleanupLoginSecurityState();

    const rawChallengeId = req.body?.challenge_id as string | string[] | undefined;
    const challengeId = getSingleValue(rawChallengeId);
    const otp = req.body?.otp;
    if (!challengeId || !otp) {
      res.json({
        status: "error",
        message: "challenge_id and otp are required",
        data: null,
      });
      return;
    }

    const session = pendingLoginOtpSessions.get(challengeId);
    if (!session) {
      res.json({
        status: "error",
        message: "OTP session not found or expired. Please login again.",
        data: null,
      });
      return;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      pendingLoginOtpSessions.delete(challengeId);
      res.json({
        status: "error",
        message: "OTP has expired. Please login again to get a new OTP.",
        data: null,
      });
      return;
    }

    const normalizedOtp = normalizeOtpInput(otp);
    const otpMatches = await verifyPassword(normalizedOtp, session.otpHash);
    if (!otpMatches) {
      const otpFailure = registerOtpFailure(session.voterId);
      if (otpFailure.locked) {
        pendingLoginOtpSessions.delete(challengeId);
        res.json({
          status: "error",
          message: `Too many invalid OTP attempts. Try again in ${otpFailure.retryAfterSeconds} second(s).`,
          data: {
            retry_after_seconds: otpFailure.retryAfterSeconds,
            lock_reason: "otp",
          },
        });
        return;
      }

      session.attempts += 1;
      if (session.attempts >= LOGIN_OTP_MAX_ATTEMPTS) {
        pendingLoginOtpSessions.delete(challengeId);
        res.json({
          status: "error",
          message: "Too many invalid attempts. Please login again to request a new OTP.",
          data: null,
        });
        return;
      }

      pendingLoginOtpSessions.set(challengeId, session);
      res.json({
        status: "error",
        message: `Invalid OTP. ${LOGIN_OTP_MAX_ATTEMPTS - session.attempts} attempt(s) remaining in this session.`,
        data: {
          remaining_attempts: LOGIN_OTP_MAX_ATTEMPTS - session.attempts,
          remaining_attempts_before_lock: otpFailure.remainingAttempts,
        },
      });
      return;
    }

    clearOtpFailures(session.voterId);
    pendingLoginOtpSessions.delete(challengeId);

    const results = await db
      .select()
      .from(votersTable)
      .where(
        and(
          eq(votersTable.id, session.voterId),
          eq(votersTable.electionId, session.electionId),
        ),
      );
    if (results.length === 0) {
      res.json({ status: "error", message: "Voter not found", data: null });
      return;
    }

    const voter = results[0];
    attachVoterSessionCookie(res, {
      id: voter.id,
      electionId: voter.electionId,
    });
    const authToken = createVoterSessionToken({
      id: voter.id,
      electionId: voter.electionId,
    });

    res.json({
      status: "success",
      message: "OTP verified. Login successful!",
      data: {
        id: voter.id,
        election_id: voter.electionId,
        name: voter.name,
        email: voter.email,
        voter_id: voter.voterId,
        aadhar_id: voter.aadharId,
        mobile: voter.mobile,
        age: voter.age,
        gender: voter.gender,
        photo_url: voter.photoUrl,
        signature_url: voter.signatureUrl,
        profile_completed: voter.profileCompleted,
        has_voted: voter.hasVoted,
        auth_token: authToken,
      },
    });
  } catch (err) {
    req.log.error(err);
    res.json({ status: "error", message: "Internal server error", data: null });
  }
});

export default router;
