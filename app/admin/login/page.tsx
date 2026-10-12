'use client';

import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TOKEN_KEY } from '../AdminDashboard';

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const expired = params.get('expired') === '1';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState(expired ? 'Session expired. Please log in again.' : '');
  const [busy, setBusy] = useState(false);

  // Already holding a valid session? Skip straight to the dashboard.
  useEffect(() => {
    let stored = '';
    try {
      stored = window.localStorage.getItem(TOKEN_KEY) ?? '';
    } catch {
      return;
    }
    if (!stored) return;
    fetch('/api/admin?action=me', {
      method: 'POST',
      headers: { Authorization: `Bearer ${stored}` },
    })
      .then(response => (response.ok ? response.json() : null))
      .then(data => {
        if (data?.admin) router.replace('/admin');
      })
      .catch(() => null);
  }, [router]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFormError('');
    try {
      const response = await fetch('/api/admin?action=login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.token) {
        setFormError(data.error || 'Login failed.');
        return;
      }
      try {
        window.localStorage.setItem(TOKEN_KEY, data.token);
      } catch {
        /* storage unavailable */
      }
      // Full reload: the server gate reads the fresh HttpOnly cookie + role.
      window.location.replace('/admin');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f2ee] px-4 text-[#111]">
      <div className="w-full max-w-md border border-[#e0dbd4] bg-white p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8f1f35]">Chitra Tech</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Admin login</h1>
        <p className="mt-2 text-sm text-[#666]">
          Only accounts with the admin role can sign in here.
        </p>
        <form onSubmit={submit} className="mt-6 grid gap-4">
          <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#777]">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="admin@example.com"
              autoComplete="email"
              className="h-11 border border-[#ded8d0] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[#111] outline-none transition focus:border-[#111111]"
            />
          </label>
          <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#777]">
            Password
            <input
              type="password"
              required
              value={password}
              onChange={event => setPassword(event.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="h-11 border border-[#ded8d0] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[#111] outline-none transition focus:border-[#111111]"
            />
          </label>
          {formError && <p className="text-sm text-[#8f1f35]">{formError}</p>}
          <button
            type="submit"
            disabled={busy}
            className="h-11 bg-[#111] text-sm font-semibold text-white transition hover:bg-[#333] disabled:opacity-60"
          >
            {busy ? 'Please wait…' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
