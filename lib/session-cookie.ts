// Session cookie helpers for Chitra E-commerce.
// All session tokens (customer + admin) are HttpOnly cookies so they are never
// accessible to JavaScript, preventing XSS token theft.
//
// Cookie attributes:
//   httpOnly: true   — cannot be read by document.cookie
//   secure:    production only (HTTPS)
//   sameSite:  lax   — CSRF defense-in-depth (origin/referer checks add more)
//   path:      '/'   — cookie sent to all routes
//   maxAge:    43200 — 12 hours (admin) / 30 days (customer) set by caller

export const COOKIE_NAMES = {
  customer: 'chitra-customer-session',
  admin: 'chitra-admin-session',
} as const;

type CookieOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'lax' | 'strict' | 'none';
  path?: string;
  maxAge?: number;
};

const isSecure = () => {
  // In Next.js middleware/edge, check via headers; in server components, assume
  // production if not localhost. The caller can override per environment.
  return typeof process !== 'undefined' && process.env.NODE_ENV === 'production';
};

export function setSessionCookie(
  name: string,
  value: string,
  maxAgeSeconds: number,
  opts: CookieOptions = {}
): string {
  const secure = opts.secure ?? isSecure();
  const parts: string[] = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    `Path=${opts.path ?? '/'}`,
    `HttpOnly`,
    `SameSite=${opts.sameSite ?? 'Lax'}`,
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(
  name: string,
  opts: CookieOptions = {}
): string {
  const secure = opts.secure ?? isSecure();
  const parts: string[] = [
    `${encodeURIComponent(name)}=`,
    `Path=${opts.path ?? '/'}`,
    `HttpOnly`,
    `SameSite=${opts.sameSite ?? 'Lax'}`,
    `Max-Age=0`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/** Read a cookie value from the Cookie header string. */
export function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = new RegExp(
    '(?:^|;\\s*)' + encodeURIComponent(name) + '=([^;]*)'
  ).exec(cookieHeader);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]) || null;
  } catch {
    return null;
  }
}
