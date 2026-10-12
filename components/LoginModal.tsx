'use client';

import { useEffect, useState } from 'react';
import { useCustomerAuth } from '@/lib/customer-context';

// These keys must match lib/customer-context.tsx exactly.
const USER_KEY = 'chitra-customer';
const SESSION_KEY = 'chitra-customer-session';

type Mode = 'login' | 'register' | 'forgot';
type Step = 'form' | 'otp';

export default function LoginModal() {
  const { isLoginOpen, closeLogin, login, forgotPassword, authStatus, refreshUser } =
    useCustomerAuth();

  const [mode, setMode] = useState<Mode>('login');
  const [step, setStep] = useState<Step>('form');

  // login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // forgot
  const [forgotEmail, setForgotEmail] = useState('');

  // register
  const [name, setName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  // otp
  const [otp, setOtp] = useState('');
  const [pending, setPending] = useState<{
    email: string;
    name: string;
    password: string;
  } | null>(null);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset transient state each time the modal opens.
  useEffect(() => {
    if (isLoginOpen) {
      /* eslint-disable react-hooks/set-state-in-effect -- reset modal form when it opens */
      setError('');
      setOtp('');
      setStep('form');
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [isLoginOpen]);

  if (!isLoginOpen) return null;

  function switchMode(next: Mode) {
    setMode(next);
    setStep('form');
    setError('');
    setOtp('');
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    await login({ mode: 'login', email: email.trim().toLowerCase(), password });
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    await forgotPassword(forgotEmail.trim().toLowerCase());
  }

  // Step 1 of signup: send OTP (NO account is created here)
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Enter your name.');
    if (regPassword.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/customer?action=send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: regEmail.trim().toLowerCase(),
          name: name.trim(),
          password: regPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not send the code.');
        return;
      }
      setPending({
        email: regEmail.trim().toLowerCase(),
        name: name.trim(),
        password: regPassword,
      });
      setOtp('');
      setStep('otp');
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  // Step 2 of signup: verify OTP -> account created + logged in
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/customer?action=verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pending, otp: otp.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Verification failed.');
        return;
      }
      // Adopt the session the server minted, then refresh the context user
      // (this dispatches the cart-merge event via the context).
      try {
        window.localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        if (data.token) window.localStorage.setItem(SESSION_KEY, data.token);
      } catch {
        /* storage unavailable */
      }
      await refreshUser();
      closeLogin();
    } catch {
      setError('Network error. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    if (!pending) return;
    setBusy(true);
    setError('');
    try {
      await fetch('/api/customer?action=send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pending.email,
          name: pending.name,
          password: pending.password,
        }),
      });
      setOtp('');
    } catch {
      setError('Could not resend. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    'w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-black focus:ring-2 focus:ring-black/10';
  const btnCls =
    'w-full rounded-xl bg-black py-3 text-base font-semibold text-white transition hover:bg-gray-800 disabled:opacity-60';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-8 shadow-2xl">
        <button
          type="button"
          onClick={closeLogin}
          aria-label="Close"
          className="absolute right-5 top-5 flex size-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
        >
          ✕
        </button>

        {mode === 'login' ? (
          <form onSubmit={handleLogin} className="grid gap-5">
            <h2 className="text-2xl font-semibold tracking-tight text-gray-900">Log in</h2>
            <input
              className={inputCls}
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              className={inputCls}
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {authStatus ? <p className="text-sm text-red-600">{authStatus}</p> : null}
            <button className={btnCls} type="submit">
              Log in
            </button>
            <p className="text-center text-sm text-gray-500">
              No account?{' '}
              <button
                type="button"
                className="text-black font-medium underline"
                onClick={() => switchMode('register')}
              >
                Sign up
              </button>
            </p>
            <p className="text-center text-sm text-gray-500">
              <button
                type="button"
                className="underline"
                onClick={() => switchMode('forgot')}
              >
                Forgot password?
              </button>
            </p>
          </form>
        ) : mode === 'forgot' ? (
          <form onSubmit={handleForgot} className="grid gap-5">
            <h2 className="text-2xl font-semibold tracking-tight text-gray-900">Forgot password</h2>
            <p className="text-sm text-gray-500">
              Enter your email and we&apos;ll help you reset your password.
            </p>
            <input
              className={inputCls}
              type="email"
              placeholder="Email"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              required
            />
            {authStatus ? <p className="text-sm text-gray-600">{authStatus}</p> : null}
            <button className={btnCls} type="submit">
              Send reset link
            </button>
            <p className="text-center text-sm text-gray-500">
              <button
                type="button"
                className="text-black font-medium underline"
                onClick={() => switchMode('login')}
              >
                Back to log in
              </button>
            </p>
          </form>
        ) : step === 'form' ? (
          <form onSubmit={handleSendOtp} className="grid gap-5">
            <h2 className="text-2xl font-semibold tracking-tight text-gray-900">Create account</h2>
            <input
              className={inputCls}
              type="text"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <input
              className={inputCls}
              type="email"
              placeholder="Email"
              value={regEmail}
              onChange={(e) => setRegEmail(e.target.value)}
              required
            />
            <input
              className={inputCls}
              type="password"
              placeholder="Password (min 8 characters)"
              value={regPassword}
              onChange={(e) => setRegPassword(e.target.value)}
              required
            />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button className={btnCls} disabled={busy} type="submit">
              {busy ? 'Sending code…' : 'Send verification code'}
            </button>
            <p className="text-center text-sm text-gray-500">
              Have an account?{' '}
              <button
                type="button"
                className="text-black font-medium underline"
                onClick={() => {
                  setMode('login');
                  setError('');
                }}
              >
                Log in
              </button>
            </p>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="grid gap-5">
            <h2 className="text-2xl font-semibold tracking-tight text-gray-900">Enter verification code</h2>
            <p className="text-sm text-gray-500">
              We sent a 6-digit code to <strong>{pending?.email}</strong>.
            </p>
            <input
              className={inputCls + ' text-center text-lg tracking-[0.5em]'}
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
              required
            />
            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            <button className={btnCls} disabled={busy || otp.length !== 6} type="submit">
              {busy ? 'Verifying…' : 'Verify & create account'}
            </button>
            <div className="flex items-center justify-between text-sm">
              <button
                type="button"
                className="text-gray-500 underline"
                onClick={() => {
                  setStep('form');
                  setError('');
                }}
              >
                Back
              </button>
              <button
                type="button"
                className="text-black font-medium underline"
                onClick={handleResend}
                disabled={busy}
              >
                Resend code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
