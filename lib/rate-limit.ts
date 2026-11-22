// In-memory rate limiter for Chitra E-commerce.
//
// Provides three limiters:
//   authLimiter  — 5 requests per minute   (login, sendSignupOtp)
//   otpLimiter   — 5 requests per 5 minutes (verifySignupOtp, forgot-password, reset-password)
//   apiLimiter   — 30 requests per 10 seconds (general API)
//
// Each limiter uses a sliding-window counter per identifier (email/IP).
// In a serverless deployment, each instance has its own counter; this matches
// the existing admin-login throttle pattern in lib/admin-auth.ts.

type WindowEntry = { count: number; resetAt: number };

class RateLimiter {
  private windows = new Map<string, WindowEntry[]>();

  constructor(private maxRequests: number, private windowMs: number) {}

  private prune(key: string, now: number): void {
    const entries = this.windows.get(key) ?? [];
    const valid = entries.filter((e) => e.resetAt > now);
    if (valid.length > 0) this.windows.set(key, valid);
    else this.windows.delete(key);
  }

  /** Returns { allowed: true } or { allowed: false, retryAfterSeconds }. */
  check(key: string): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
    const now = Date.now();
    this.prune(key, now);

    const entries = this.windows.get(key) ?? [];
    if (entries.length >= this.maxRequests) {
      const oldestReset = Math.min(...entries.map((e) => e.resetAt));
      const retryAfterSeconds = Math.ceil((oldestReset - now) / 1000);
      return { allowed: false, retryAfterSeconds: Math.max(1, retryAfterSeconds) };
    }

    entries.push({ count: 1, resetAt: now + this.windowMs });
    this.windows.set(key, entries);
    return { allowed: true };
  }

  reset(key: string): void {
    this.windows.delete(key);
  }
}

// authLimiter: 5 requests per minute per identifier
export const authLimiter = new RateLimiter(5, 60 * 1000);

// otpLimiter: 5 requests per 5 minutes per identifier
export const otpLimiter = new RateLimiter(5, 5 * 60 * 1000);

// apiLimiter: 30 requests per 10 seconds per identifier
export const apiLimiter = new RateLimiter(30, 10 * 1000);
