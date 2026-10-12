import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { safeEqualHex, sha256Hex, splitAdminSessionToken } from '@/lib/admin-auth';

// Supabase endpoints are configured only through environment variables.
let adminClient: SupabaseClient | null = null;

function getUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL.');
  return url;
}

function getServiceKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY.');
  return key;
}

export function getSupabaseAdmin(): SupabaseClient {
  if (typeof window !== 'undefined') {
    throw new Error('getSupabaseAdmin() is server-only.');
  }
  adminClient ??= createClient(getUrl(), getServiceKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}

/** Verify an opaque admin session token against public.admin_sessions and
 * confirm the linked customers row still has role = 'admin'. Returns the
 * admin id, or null when the session is missing, expired, or non-admin. */
export async function verifyAdminSessionToken(
  supabase: SupabaseClient,
  token: string | null,
): Promise<string | null> {
  const parts = token ? splitAdminSessionToken(token) : null;
  if (!parts) return null;
  const { data, error } = await supabase
    .from('admin_sessions')
    .select('id,customer_id,secret_hash,expires_at')
    .eq('id', token)
    .eq('customer_id', parts.adminId)
    .maybeSingle();
  if (error || !data) return null;
  const session = data as { customer_id: string; secret_hash: string; expires_at: string | null };
  if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) return null;
  if (!safeEqualHex(sha256Hex(parts.secret), session.secret_hash)) return null;
  const { data: admin } = await supabase
    .from('customers')
    .select('id')
    .eq('id', session.customer_id)
    .eq('role', 'admin')
    .maybeSingle();
  if (!admin) return null;
  return session.customer_id;
}

/** Admin gate used by /api/admin. Session-only: verifies the opaque admin
 * session token from x-admin-token / Authorization Bearer against
 * public.admin_sessions (role-checked server-side). There is NO shared-secret
 * fallback — only a real admin login grants access. */
export async function requireAdminSession(
  supabase: SupabaseClient,
  token: string | null,
): Promise<{ ok: true; adminId: string } | { ok: false; error: string }> {
  if (!token) return { ok: false, error: 'Unauthorized admin request.' };
  const adminId = await verifyAdminSessionToken(supabase, token);
  if (!adminId) return { ok: false, error: 'Admin session expired. Please log in again.' };
  return { ok: true, adminId };
}
