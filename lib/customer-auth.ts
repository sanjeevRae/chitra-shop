import {
  createHash,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from 'node:crypto';

// Server-only customer auth helpers for /api/customer. Passwords are stored
// as scrypt hashes (salt:derived-key, hex) — never plaintext, matching the
// project's no-new-dependency rule (stdlib only, no bcrypt/js-sha packages).
// SAUD stores plaintext passwords in Firestore; we deliberately do not copy that.
//
// Sign-up/sign-in is EMAIL ONLY (no phone, no Google). `email` is the single
// identity: customers.id = `email_<slug>`.

export type CustomerAuthMethod = 'email';

const SCRYPT_KEY_LENGTH = 64;

function customerIdFor(method: CustomerAuthMethod, seed: string): string {
  const slug = seed
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return `${method}_${slug || 'user'}`;
}

export function emailCustomerId(email: string): string {
  return customerIdFor('email', email || 'email-user');
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!password || !stored || !stored.includes(':')) return false;
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  let expected: Buffer;
  try {
    expected = Buffer.from(expectedHex, 'hex');
  } catch {
    return false;
  }
  let actual: Buffer;
  try {
    actual = scryptSync(password, salt, expected.length);
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Opaque customer session token (no JWT dependency). Format: `<id>.<secret>`. */
export function newSessionToken(customerId: string): string {
  return `${customerId}.${randomBytes(24).toString('hex')}`;
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function newPublicId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${randomUUID().slice(0, 8)}`;
}

