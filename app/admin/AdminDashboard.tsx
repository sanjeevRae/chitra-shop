'use client';

import { useCallback, useState } from 'react';
import InsightDashboard from '@/components/admin/InsightDashboard';
import ProductDashboard from '@/components/admin/ProductDashboard';
import ProductAdmin from '@/components/admin/ProductAdmin';
import CmsAdmin from '@/components/admin/CmsAdmin';
import TrackingSettings from '@/components/admin/TrackingSettings';

type TabKey = 'overview' | 'products' | 'inventory' | 'cms' | 'policies' | 'tracking';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'products', label: 'Products table' },
  { key: 'inventory', label: 'Manage products' },
  { key: 'cms', label: 'Content (CMS)' },
  { key: 'policies', label: 'Policies' },
  { key: 'tracking', label: 'Meta Ads / Tracking' },
];

type Admin = { id: string; name: string; email: string };

export default function AdminDashboard({ initialAdmin }: { initialAdmin: Admin }) {
  const admin = initialAdmin;
  const [active, setActive] = useState<TabKey>('overview');
  const [busy, setBusy] = useState(false);

  // Client-side API calls use credentials: 'include' so the HttpOnly session
  // cookie is sent automatically. No token is stored in localStorage,
  // preventing XSS token theft.

  const logout = useCallback(async () => {
    setBusy(true);
    try {
      await fetch('/api/admin?action=logout', {
        method: 'POST',
        credentials: 'include',
      }).catch(() => null);
    } finally {
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
          {active === 'overview' && <InsightDashboard />}
          {active === 'products' && <ProductDashboard />}
          {active === 'inventory' && <ProductAdmin />}
          {active === 'cms' && <CmsAdmin />}
          {active === 'policies' && <CmsAdmin initialSection="policies" />}
          {active === 'tracking' && <TrackingSettings />}
        </div>
      </div>
    </div>
  );
}
