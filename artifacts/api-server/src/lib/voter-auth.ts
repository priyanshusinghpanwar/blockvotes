import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const VOTER_SESSION_COOKIE = "blockvotes_voter_session";
const VOTER_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

type VoterSessionPayload = {
  voterId: string;
  electionId: string;
  exp: number;
};

declare global {
  namespace Express {
    interface Request {
      voterSession?: {
        voterId: string;
        electionId: string;
      };
    }
  }
}

function getSessionSecret(): string {
  return (
    process.env.VOTER_SESSION_SECRET?.trim() ||
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    "local-dev-voter-session-secret-change-me"
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

function buildSessionToken(payload: VoterSessionPayload): string {
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function parseSessionToken(token: string | undefined): VoterSessionPayload | null {
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
    const parsed = JSON.parse(fromBase64Url(encodedPayload)) as VoterSessionPayload;
    if (!parsed.voterId || !parsed.electionId || !parsed.exp) return null;
    if (parsed.exp <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearVoterSessionCookie(res: Response): void {
  res.clearCookie(VOTER_SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
  });
}

export function attachVoterSessionCookie(
  res: Response,
  voter: { id: string; electionId: string },
): void {
  const token = buildSessionToken({
    voterId: voter.id,
    electionId: voter.electionId,
    exp: Date.now() + VOTER_SESSION_TTL_MS,
  });

  res.cookie(VOTER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: VOTER_SESSION_TTL_MS,
    path: "/",
  });
}

export function logoutVoterSession(_req: Request, res: Response): void {
  clearVoterSessionCookie(res);
}

export function requireVoterAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const token = typeof req.cookies?.[VOTER_SESSION_COOKIE] === "string"
    ? req.cookies[VOTER_SESSION_COOKIE]
    : undefined;
  const session = parseSessionToken(token);

  if (!session) {
    clearVoterSessionCookie(res);
    res.status(401).json({
      status: "error",
      message: "Voter authentication required",
      data: null,
    });
    return;
  }

  req.voterSession = {
    voterId: session.voterId,
    electionId: session.electionId,
  };
  next();
}
