// Server-only admin auth for /api/admin (stdlib node:crypto only — no JWT dep).
//
// Replaces the old single shared-secret model (ADMIN_DASHBOARD_TOKEN compared
// with timing-unsafe ===). Admins now log in with email + password against
// public.customers rows with role = 'admin', and receive an opaque session
// token `<customerId>.<secret>` stored in the dedicated public.admin_sessions
// table (sha256 of the secret only, 12-hour expiry). The storefront login
// (customer_sessions, 30-day expiry) is a SEPARATE table — admin and customer
// auth never share state.

import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

// In-memory login throttle: max 5 attempts per 10 minutes per normalized
// email. Survives only per server instance (serverless-safe: worst case the
// limit resets on cold start, never blocks legitimate logins permanently).
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map<string, number[]>();

function pruneAttempts(now: number, key: string): number[] {
  const attempts = (loginAttempts.get(key) ?? []).filter(
    (stamp) => now - stamp < LOGIN_WINDOW_MS,
  );
  if (attempts.length > 0) loginAttempts.set(key, attempts);
  else loginAttempts.delete(key);
  return attempts;
}

export function isAdminLoginThrottled(email: string): boolean {
  return pruneAttempts(Date.now(), email.trim().toLowerCase()).length >= LOGIN_MAX_ATTEMPTS;
}

export function recordAdminLoginAttempt(email: string): void {
  const key = email.trim().toLowerCase();
  const attempts = pruneAttempts(Date.now(), key);
  attempts.push(Date.now());
  loginAttempts.set(key, attempts);
}

export function clearAdminLoginAttempts(email: string): void {
  loginAttempts.delete(email.trim().toLowerCase());
}

/** Opaque admin session token. Format: `<adminId>.<secret>`. */
export function newAdminSessionToken(adminId: string): string {
  return `${adminId}.${randomBytes(24).toString('hex')}`;
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function adminSessionExpiry(): string {
  return new Date(Date.now() + ADMIN_SESSION_TTL_MS).toISOString();
}

/** Split `<adminId>.<secret>`. Returns null when the format is wrong. */
export function splitAdminSessionToken(token: string): { adminId: string; secret: string } | null {
  if (!token || !token.includes('.')) return null;
  const separator = token.lastIndexOf('.');
  const adminId = token.slice(0, separator);
  const secret = token.slice(separator + 1);
  if (!adminId || !secret) return null;
  return { adminId, secret };
}

/** Constant-time compare of two hex digests (length-mismatch safe). */
export function safeEqualHex(actual: string, expected: string): boolean {
  if (!actual || !expected) return false;
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(actual, 'hex');
    b = Buffer.from(expected, 'hex');
  } catch {
    return false;
  }
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Name of the HttpOnly cookie that carries the admin session to /admin. */
export const ADMIN_SESSION_COOKIE = 'chitra-admin-session';

const ADMIN_SESSION_TTL_SECONDS = Math.floor(ADMIN_SESSION_TTL_MS / 1000);

/** Build the Set-Cookie value for the admin login cookie. Shared by
 * /api/admin (admin login/bootstrap) and /api/customer (storefront login for
 * an admin-role account) so the name + attributes never drift apart. Path MUST
 * be `/` — a cookie set on /api/admin or /api/customer is silently discarded
 * by the browser when its Path isn't a prefix of the current URL (that exact
 * bug once made /admin always 404). HttpOnly keeps it away from JS; `secure`
 * only in production (localhost is plain HTTP). */
export function buildAdminSessionCookie(token: string, isSecure: boolean): string {
  const secure = isSecure ? '; Secure' : '';
  return `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ADMIN_SESSION_TTL_SECONDS}${secure}`;
}

/** Value that expires (clears) the admin login cookie. */
export function buildAdminSessionCookieClear(isSecure: boolean): string {
  const secure = isSecure ? '; Secure' : '';
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
