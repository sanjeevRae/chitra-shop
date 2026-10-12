import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { getSupabaseAdmin, verifyAdminSessionToken } from '@/lib/supabase';
import AdminDashboard from './AdminDashboard';

export const dynamic = 'force-dynamic';

// Server gate for /admin: only a logged-in admin renders the dashboard.
// No session, expired session, or a non-admin session all get a real 404.
// Login at /admin/login validates email + password + role server-side and
// sets the HttpOnly cookie this gate reads.
export default async function AdminPage() {
  const token = (await cookies()).get('chitra-admin-session')?.value ?? null;
  if (!token) notFound();
  const adminId = await verifyAdminSessionToken(getSupabaseAdmin(), token).catch(() => null);
  if (!adminId) notFound();
  const { data: admin } = await getSupabaseAdmin()
    .from('customers')
    .select('id,name,email')
    .eq('id', adminId)
    .eq('role', 'admin')
    .maybeSingle();
  if (!admin) notFound();
  return (
    <AdminDashboard
      initialAdmin={{
        id: String(admin.id ?? adminId),
        name: String(admin.name ?? ''),
        email: String(admin.email ?? ''),
      }}
    />
  );
}
