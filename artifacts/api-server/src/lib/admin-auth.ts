import { createHmac, timingSafeEqual } from "node:crypto";
import { db, companiesTable, electionsTable, candidatesTable, votersTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type { NextFunction, Request, Response } from "express";
import { buildSessionCookieOptions } from "./session-cookie";

const ADMIN_SESSION_COOKIE = "blockvotes_admin_session";
const ADMIN_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type AdminSessionPayload = {
  companyId: string;
  email: string;
  exp: number;
};

type CompanySession = {
  id: string;
  name: string;
  email: string;
};

declare global {
  namespace Express {
    interface Request {
      adminCompany?: CompanySession;
    }
  }
}

function getSessionSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    "local-dev-admin-session-secret-change-me"
  );
}

function toBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(encodedPayload: string): string {
  return createHmac("sha256", getSessionSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function buildSessionToken(payload: AdminSessionPayload): string {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function parseSessionToken(token: string | undefined): AdminSessionPayload | null {
  if (!token) return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signPayload(encodedPayload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(encodedPayload)) as AdminSessionPayload;
    if (!parsed.companyId || !parsed.email || !parsed.exp) return null;
    if (parsed.exp <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearSessionCookie(res: Response): void {
  res.clearCookie(ADMIN_SESSION_COOKIE, buildSessionCookieOptions("lax"));
}

export function attachAdminSessionCookie(
  res: Response,
  company: { id: string; email: string },
): void {
  const token = buildSessionToken({
    companyId: company.id,
    email: company.email,
    exp: Date.now() + ADMIN_SESSION_TTL_MS,
  });

  res.cookie(
    ADMIN_SESSION_COOKIE,
    token,
    buildSessionCookieOptions("lax", ADMIN_SESSION_TTL_MS),
  );
}

export function logoutAdminSession(_req: Request, res: Response): void {
  clearSessionCookie(res);
}

export async function requireAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = typeof req.cookies?.[ADMIN_SESSION_COOKIE] === "string"
    ? req.cookies[ADMIN_SESSION_COOKIE]
    : undefined;
  const session = parseSessionToken(token);

  if (!session) {
    clearSessionCookie(res);
    res.status(401).json({
      status: "error",
      message: "Authentication required",
      data: null,
    });
    return;
  }

  const companies = await db
    .select({
      id: companiesTable.id,
      name: companiesTable.name,
      email: companiesTable.email,
    })
    .from(companiesTable)
    .where(
      and(
        eq(companiesTable.id, session.companyId),
        eq(companiesTable.email, session.email),
      ),
    )
    .limit(1);

  const company = companies[0];
  if (!company) {
    clearSessionCookie(res);
    res.status(401).json({
      status: "error",
      message: "Admin session is no longer valid",
      data: null,
    });
    return;
  }

  req.adminCompany = company;
  next();
}

export function requireAdminCompanyId(req: Request): string {
  const companyId = req.adminCompany?.id;
  if (!companyId) {
    throw new Error("Authenticated company context is missing");
  }

  return companyId;
}

export async function ensureElectionBelongsToAdmin(
  electionId: string,
  companyId: string,
): Promise<{ id: string; companyId: string; status: string; name: string } | null> {
  const elections = await db
    .select({
      id: electionsTable.id,
      companyId: electionsTable.companyId,
      status: electionsTable.status,
      name: electionsTable.name,
    })
    .from(electionsTable)
    .where(
      and(
        eq(electionsTable.id, electionId),
        eq(electionsTable.companyId, companyId),
      ),
    )
    .limit(1);

  return elections[0] ?? null;
}

export async function ensureCandidateBelongsToAdmin(
  candidateId: string,
  companyId: string,
): Promise<{ id: string; electionId: string } | null> {
  const candidates = await db
    .select({
      id: candidatesTable.id,
      electionId: candidatesTable.electionId,
    })
    .from(candidatesTable)
    .innerJoin(electionsTable, eq(candidatesTable.electionId, electionsTable.id))
    .where(
      and(
        eq(candidatesTable.id, candidateId),
        eq(electionsTable.companyId, companyId),
      ),
    )
    .limit(1);

  return candidates[0] ?? null;
}

export async function ensureVoterBelongsToAdmin(
  voterId: string,
  companyId: string,
): Promise<{ id: string; electionId: string } | null> {
  const voters = await db
    .select({
      id: votersTable.id,
      electionId: votersTable.electionId,
    })
    .from(votersTable)
    .innerJoin(electionsTable, eq(votersTable.electionId, electionsTable.id))
    .where(
      and(
        eq(votersTable.id, voterId),
        eq(electionsTable.companyId, companyId),
      ),
    )
    .limit(1);

  return voters[0] ?? null;
}
