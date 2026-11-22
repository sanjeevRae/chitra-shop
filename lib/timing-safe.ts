// Timing-safe string comparison for Chitra E-commerce.
//
// Prevents timing attacks when comparing secrets (session tokens, OTP codes,
// password hashes) by comparing in constant time.

import { createHash, timingSafeEqual } from 'node:crypto';

/** Compare two strings in constant time. Returns true if equal. */
export function isTimingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** Hash a string with SHA-256 and return hex digest. */
export function sha256HexTimingSafe(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
