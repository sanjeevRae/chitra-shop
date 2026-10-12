'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

// Chitra customer auth context (ports SAUD's CustomerAuthContext to Supabase).
// Session tokens live in localStorage; the account snapshot is refreshed from
// GET /api/customer?action=account&id= on mount (SAUD parity). Mutations use
// the session token as `Authorization: Bearer <token>` so the server can
// ownership-check orders and reviews. No passwords are ever stored client-side.

export type Customer = {
  id: string;
  method: 'email';
  role?: string;
  email?: string;
  phone?: string;
  name: string;
  photo?: string;
  address?: string;
  city?: string;
  area?: string;
  landmark?: string;
};

// Email/password only — no phone or Google auth.
export type LoginPayload = {
  mode: 'login' | 'register';
  email?: string;
  password?: string;
  name?: string;
  photo?: string;
};

type AuthContextValue = {
  user: Customer | null;
  sessionToken: string | null;
  isLoginOpen: boolean;
  authStatus: string;
  openLogin: () => void;
  closeLogin: () => void;
  login: (payload: LoginPayload) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  updateProfile: (profile: Partial<Customer>) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<Customer | null>;
  authHeaders: () => Record<string, string>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const USER_KEY = 'chitra-customer';
const SESSION_KEY = 'chitra-customer-session';

function readStoredUser(): Customer | null {
  try {
    const raw = window.localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as Customer) : null;
  } catch {
    return null;
  }
}

function readStoredToken(): string | null {
  try {
    return window.localStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}

export function useCustomerAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useCustomerAuth must be used inside CustomerAuthProvider');
  return context;
}

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Customer | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);
  const [authStatus, setAuthStatus] = useState('');

  useEffect(() => {
    const saved = readStoredUser();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe localStorage read (Next.js recommended pattern)
    if (saved?.id) setUser(saved);
    const token = readStoredToken();
    if (token) setSessionToken(token);
  }, []);

  const saveSession = useCallback((nextUser: Customer, token: string | null) => {
    setUser(nextUser);
    try {
      window.localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
      if (token) {
        setSessionToken(token);
        window.localStorage.setItem(SESSION_KEY, token);
      }
      // Let the store merge the customer's DB cart on login.
      window.dispatchEvent(new Event('chitra-auth'));
    } catch {
      /* storage unavailable */
    }
  }, []);

  const authHeaders = useCallback((): Record<string, string> => {
    const token = sessionToken ?? readStoredToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, [sessionToken]);

  const refreshUser = useCallback(async () => {
    const saved = typeof window === 'undefined' ? null : readStoredUser();
    if (!saved?.id) return null;
    try {
      const response = await fetch(
        `/api/customer?action=account&id=${encodeURIComponent(saved.id)}`,
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.user) return saved;
      const next = data.user as Customer;
      setUser(next);
      try {
        window.localStorage.setItem(USER_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    } catch {
      return saved;
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- session refresh on mount (SAUD parity)
    void refreshUser();
  }, [refreshUser]);

  const login = useCallback(
    async (payload: LoginPayload) => {
      setAuthStatus('Please wait...');
      try {
        const response = await fetch('/api/customer?action=account', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.user) {
          setAuthStatus(data.error || 'Login failed.');
          return;
        }
        saveSession(data.user as Customer, (data.token as string | undefined) ?? null);
        setAuthStatus('');
        setIsLoginOpen(false);
      } catch {
        setAuthStatus('Login failed. Please try again.');
      }
    },
    [saveSession],
  );

  // Password reset: the server currently answers 501 (not configured yet);
  // the modal surfaces authStatus verbatim, so this stays a thin wrapper.
  const forgotPassword = useCallback(async (email: string) => {
    setAuthStatus('Please wait...');
    try {
      const response = await fetch('/api/customer?action=forgot', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      setAuthStatus(data.error || data.message || 'Password reset is not configured yet.');
    } catch {
      setAuthStatus('Could not reach the server. Please try again.');
    }
  }, []);

  const updateProfile = useCallback(async (profile: Partial<Customer>) => {
    setAuthStatus('Saving profile...');
    try {
      const token = typeof window === 'undefined' ? null : readStoredToken();
      const response = await fetch('/api/customer?action=account', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(profile),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.user) {
        setAuthStatus(data.error || 'Profile update failed.');
        return;
      }
      const next = data.user as Customer;
      setUser(next);
      try {
        window.localStorage.setItem(USER_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      setAuthStatus('Profile saved.');
    } catch {
      setAuthStatus('Profile update failed.');
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const token = typeof window === 'undefined' ? null : readStoredToken();
      if (token) {
        await fetch('/api/customer?action=logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => undefined);
      }
    } finally {
      setUser(null);
      setSessionToken(null);
      setAuthStatus('');
      try {
        window.localStorage.removeItem(USER_KEY);
        window.localStorage.removeItem(SESSION_KEY);
      } catch {
        /* storage unavailable */
      }
      // Keep the local cart for the next login; nothing to merge on sign-out.
      window.dispatchEvent(new Event('chitra-auth'));
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      sessionToken,
      isLoginOpen,
      authStatus,
      openLogin: () => setIsLoginOpen(true),
      closeLogin: () => {
        setIsLoginOpen(false);
        setAuthStatus('');
      },
      login,
      forgotPassword,
      updateProfile,
      logout,
      refreshUser,
      authHeaders,
    }),
    [
      user,
      sessionToken,
      isLoginOpen,
      authStatus,
      login,
      forgotPassword,
      updateProfile,
      logout,
      refreshUser,
      authHeaders,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

