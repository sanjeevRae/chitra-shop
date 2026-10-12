'use client';

import { useCallback, useEffect, useState } from 'react';
import InsightDashboard from '@/components/admin/InsightDashboard';
import ProductDashboard from '@/components/admin/ProductDashboard';
import ProductAdmin from '@/components/admin/ProductAdmin';
import CmsAdmin from '@/components/admin/CmsAdmin';

type TabKey = 'overview' | 'products' | 'inventory' | 'cms' | 'policies';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'products', label: 'Products table' },
  { key: 'inventory', label: 'Manage products' },
  { key: 'cms', label: 'Content (CMS)' },
  { key: 'policies', label: 'Policies' },
];

type Admin = { id: string; name: string; email: string };

// Same localStorage key as before: holds the opaque session from
// POST /api/admin?action=login (12h, server-verified against
// public.admin_sessions + role='admin').
export const TOKEN_KEY = 'chitra-admin-token';

export default function AdminDashboard({ initialAdmin }: { initialAdmin: Admin }) {
  const [token, setToken] = useState('');
  // Rendered only after the /admin server gate already verified the session
  // cookie maps to a customers row with role='admin'; identity is fixed.
  const admin = initialAdmin;
  const [active, setActive] = useState<TabKey>('overview');
  const [busy, setBusy] = useState(false);

  // The /admin page server gate already role-checked this session against
  // customers.role='admin'. This re-reads the stored token on mount so tabs
  // keep calling /api/admin after refresh; an invalid/expired token routes
  // back to /admin/login instead of failing silently.
  useEffect(() => {
    let stored = '';
    try {
      stored = window.localStorage.getItem(TOKEN_KEY) ?? '';
    } catch {
      /* storage unavailable */
    }
    if (!stored) {
      window.location.replace('/admin/login?expired=1');
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe localStorage read decides the dashboard token once on mount
    setToken(stored);
  }, []);

  const logout = useCallback(async () => {
    setBusy(true);
    try {
      const stored = window.localStorage.getItem(TOKEN_KEY) ?? '';
      await fetch('/api/admin?action=logout', {
        method: 'POST',
        headers: stored ? { Authorization: `Bearer ${stored}` } : {},
      }).catch(() => null);
    } catch {
      /* storage unavailable */
    } finally {
      try {
        window.localStorage.removeItem(TOKEN_KEY);
      } catch {
        /* storage unavailable */
      }
      // Server clears the HttpOnly cookie; replace so back-button can't replay.
      window.location.replace('/admin/login');
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#f6f2ee] text-[#111]">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
        <header className="flex flex-col gap-4 border-b border-[#e0dbd4] pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8f1f35]">Chitra Tech</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Admin dashboard</h1>
            <p className="mt-2 text-sm text-[#666]">
              Orders, inventory, and storefront content.
              {admin ? ` Signed in as ${admin.name || admin.email}.` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            disabled={busy}
            className="h-11 border border-[#ded8d0] bg-white px-5 text-sm font-semibold text-[#333] transition hover:border-[#111] disabled:opacity-60"
          >
            {busy ? 'Logging out…' : 'Log out'}
          </button>
        </header>

        <nav className="mt-6 flex flex-wrap gap-2">
          {tabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActive(tab.key)}
              className={`border px-4 py-2 text-sm font-semibold transition ${active === tab.key ? 'border-[#111] bg-[#111] text-white' : 'border-[#ded8d0] bg-white text-[#333] hover:border-[#111]'}`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="mt-6">
          {active === 'overview' && <InsightDashboard token={token} />}
          {active === 'products' && <ProductDashboard token={token} />}
          {active === 'inventory' && <ProductAdmin token={token} />}
          {active === 'cms' && <CmsAdmin token={token} />}
          {active === 'policies' && <CmsAdmin token={token} initialSection="policies" />}
        </div>
      </div>
    </div>
  );
}
