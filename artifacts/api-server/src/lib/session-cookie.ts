import type { CookieOptions } from "express";

type SessionCookieSameSite = NonNullable<CookieOptions["sameSite"]>;

function normalizeSameSite(value: string | undefined): SessionCookieSameSite | null {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === "lax" ||
    normalized === "strict" ||
    normalized === "none"
  ) {
    return normalized;
  }
  return null;
}

function resolveSameSite(fallback: SessionCookieSameSite): SessionCookieSameSite {
  const configured = normalizeSameSite(process.env.SESSION_COOKIE_SAME_SITE);
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? "none" : fallback;
}

function resolveSecure(): boolean {
  const configured = process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase();
  if (configured === "true") return true;
  if (configured === "false") return false;
  return process.env.NODE_ENV === "production";
}

export function buildSessionCookieOptions(
  fallbackSameSite: SessionCookieSameSite,
  maxAge?: number,
): CookieOptions {
  const sameSite = resolveSameSite(fallbackSameSite);
  const secure = resolveSecure() || sameSite === "none";

  return {
    httpOnly: true,
    sameSite,
    secure,
    path: "/",
    ...(typeof maxAge === "number" ? { maxAge } : {}),
  };
}
