'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getProduct, type ProductId } from './products';

export interface CartLine {
  id: ProductId;
  qty: number;
}

export interface CartNotice {
  id: number;
  name: string;
  image: string;
  totalItems: number;
}

export interface CartProduct {
  id: string;
  name: string;
  price: number;
  image: string;
  href: string;
}

const CART_KEY = 'techself-cart';
const WISHLIST_KEY = 'techself-wishlist';

type StoredAuth = { user: { id?: string } | null; token: string | null };

interface StoreValue {
  cart: CartLine[];
  wishlist: ProductId[];
  addToCart: (id: ProductId, qty?: number) => void;
  removeFromCart: (id: ProductId) => void;
  setQty: (id: ProductId, qty: number) => void;
  clearCart: () => void;
  toggleWishlist: (id: ProductId) => void;
  isWishlisted: (id: ProductId) => boolean;
  cartCount: number;
  cartSubtotal: number;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  wishOpen: boolean;
  setWishOpen: (open: boolean) => void;
  cartNotice: CartNotice | null;
  dismissCartNotice: () => void;
  // Live product data for cart lines, keyed by product id (DB hydrated).
  cartProducts: Record<string, CartProduct>;
  cartProductsLoading: boolean;
}

const StoreContext = createContext<StoreValue | null>(null);

function readLocalStorage<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readStoredAuth(): StoredAuth {
  if (typeof window === 'undefined') return { user: null, token: null };
  try {
    const userRaw = window.localStorage.getItem('chitra-customer');
    const token = window.localStorage.getItem('chitra-customer-session');
    const user = userRaw ? (JSON.parse(userRaw) as { id?: string }) : null;
    return { user: user?.id ? user : null, token };
  } catch {
    return { user: null, token: null };
  }
}

function sanitizeLines(value: unknown): CartLine[] {
  if (!Array.isArray(value)) return [];
  const merged = new Map<string, number>();
  for (const entry of value) {
    const record =
      entry && typeof entry === 'object' && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : {};
    const id = String(record.id ?? '').trim();
    const qty = Math.floor(Number(record.qty ?? 0) || 0);
    if (!id || qty <= 0 || merged.size >= 200) continue;
    merged.set(id, Math.min(99, (merged.get(id) ?? 0) + qty));
  }
  return [...merged.entries()].map(([id, qty]) => ({ id, qty }));
}

async function fetchDbCart(token: string | null): Promise<CartLine[] | null> {
  if (!token) return null;
  try {
    const res = await fetch('/api/customer?action=cart', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !Array.isArray((data as Record<string, unknown>).cart)) return null;
    return sanitizeLines((data as { cart: unknown[] }).cart);
  } catch {
    return null;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  // Initialize empty so SSR and the first client render match (avoids
  // hydration mismatch); real values are loaded from localStorage on mount.
  const [cart, setCart] = useState<CartLine[]>([]);
  const [wishlist, setWishlist] = useState<ProductId[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishOpen, setWishOpen] = useState(false);
  const [cartNotice, setCartNotice] = useState<CartNotice | null>(null);
  // Live product details for cart lines (DB only — no static fallback).
  // Keyed by string id; lines without a hydrated row show a loading state.
  const [cartProducts, setCartProducts] = useState<Record<string, CartProduct>>({});
  const [cartProductsLoading, setCartProductsLoading] = useState(false);
  const hydratedRef = useRef(false);
  const cartSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist helper: debounce writes (~600ms) so rapid +/- clicks send one
  // request. Guests write localStorage only; logged-in users write both.
  const persistCart = useCallback((lines: CartLine[]) => {
    try {
      window.localStorage.setItem(CART_KEY, JSON.stringify(lines));
    } catch {
      /* storage unavailable */
    }
    const { token } = readStoredAuth();
    if (!token) return;
    if (cartSaveTimerRef.current) clearTimeout(cartSaveTimerRef.current);
    cartSaveTimerRef.current = setTimeout(() => {
      void fetch('/api/customer?action=cart', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ items: lines }),
      }).catch(() => undefined);
    }, 600);
  }, []);

  // Minimal "added to cart" chime via WebAudio (no audio assets needed).
  const playCartChime = useCallback(() => {
    try {
      const AudioContextCtor =
        typeof window === 'undefined'
          ? null
          : (window.AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      if (!AudioContextCtor) return;
      const context = new AudioContextCtor();
      const playTone = (frequency: number, startAt: number, duration: number) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, context.currentTime + startAt);
        gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + startAt + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + startAt + duration);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(context.currentTime + startAt);
        oscillator.stop(context.currentTime + startAt + duration + 0.05);
      };
      playTone(660, 0, 0.12);
      playTone(880, 0.1, 0.16);
      window.setTimeout(() => void context.close().catch(() => undefined), 600);
    } catch {
      /* audio unavailable — the popup still shows */
    }
  }, []);

  // Load cart + wishlist from localStorage, then merge the DB copy once the
  // customer's session is known (guests keep the localStorage copy only).
  // Merging uses max(qty, dbQty) per line so neither side loses items.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const storedCart = sanitizeLines(readLocalStorage<CartLine[]>(CART_KEY, []));
        const storedWishlist = readLocalStorage<ProductId[]>(WISHLIST_KEY, []);
        const { token } = readStoredAuth();
        const dbCart = token ? await fetchDbCart(token) : null;
        if (cancelled) return;
        const merged = new Map<string, number>();
        for (const line of storedCart) merged.set(String(line.id), line.qty);
        for (const line of dbCart ?? []) {
          const key = String(line.id);
          merged.set(key, Math.max(merged.get(key) ?? 0, line.qty));
        }
        setCart([...merged.entries()].map(([id, qty]) => ({ id, qty })));
        setWishlist(storedWishlist);
      } catch {
        /* keep empty state */
      } finally {
        if (!cancelled) hydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Merge the DB cart when the customer logs in mid-session (the mount
  // effect covers page reloads). The persist effect below then pushes the
  // merged result back so both copies match.
  useEffect(() => {
    const onAuthChange = () => {
      const { token } = readStoredAuth();
      if (!token) return;
      void (async () => {
        const dbCart = await fetchDbCart(token);
        if (!dbCart) return;
        setCart((prev) => {
          const merged = new Map<string, number>();
          for (const line of prev) merged.set(String(line.id), line.qty);
          for (const line of dbCart) {
            const key = String(line.id);
            merged.set(key, Math.max(merged.get(key) ?? 0, line.qty));
          }
          return [...merged.entries()].map(([id, qty]) => ({ id, qty }));
        });
      })();
    };
    window.addEventListener('chitra-auth', onAuthChange);
    return () => window.removeEventListener('chitra-auth', onAuthChange);
  }, []);

  // Persist every cart change: localStorage always, DB (debounced) when
  // logged in. Skipped until hydration finished so the first render never
  // overwrites stored state.
  useEffect(() => {
    if (!hydratedRef.current) return;
    persistCart(cart);
  }, [cart, persistCart]);

  // Hydrate live product details (name/price/image) for cart lines from the
  // database — only ids we don't have yet, one narrow request per batch.
  useEffect(() => {
    const missing = [...new Set(cart.map((line) => String(line.id)))].filter(
      (id) => !cartProducts[id],
    );
    if (missing.length === 0) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for the DB batch fetch triggered by this cart change
    setCartProductsLoading(true);
    void (async () => {
      try {
        const res = await fetch(
          `/api/shop/products?ids=${encodeURIComponent(missing.slice(0, 60).join(','))}`,
        );
        const data = (await res.json().catch(() => ({}))) as { products?: unknown[] };
        const rows = Array.isArray(data.products) ? data.products : [];
        if (cancelled || rows.length === 0) return;
        setCartProducts((prev) => {
          const next = { ...prev };
          for (const row of rows) {
            const record =
              row && typeof row === 'object' && !Array.isArray(row)
                ? (row as Record<string, unknown>)
                : {};
            const id = String(record.id ?? '').trim();
            if (!id) continue;
            next[id] = {
              id,
              name: String(record.name ?? '').trim(),
              price: Number(record.price ?? 0) || 0,
              image: String(record.image ?? '').trim(),
              href: String(record.href ?? '').trim() || `/product/${encodeURIComponent(id)}`,
            };
          }
          return next;
        });
      } catch {
        /* static catalog still renders known ids */
      } finally {
        if (!cancelled) setCartProductsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cart, cartProducts]);

  useEffect(() => {
    try {
      window.localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlist));
    } catch {
      /* storage unavailable */
    }
  }, [wishlist]);

  const addToCart = useCallback(
    (id: ProductId, qty: number = 1) => {
      let totalItems = 0;
      setCart((prev) => {
        const existing = prev.find((line) => String(line.id) === String(id));
        const next = existing
          ? prev.map((line) =>
              String(line.id) === String(id) ? { ...line, qty: line.qty + qty } : line,
            )
          : [...prev, { id, qty }];
        totalItems = next.reduce((sum, line) => sum + line.qty, 0);
        return next;
      });
      // Live-first popup data: hydrated DB row wins, static catalog next,
      // plain label last (never the Meta Quest placeholder when a live row
      // exists — hydration fills cartProducts for Supabase-only ids).
      const key = String(id);
      const live = cartProducts[key];
      const product = getProduct(id);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      setCartNotice({
        id: Date.now(),
        name: live?.name ?? product?.name ?? 'Product',
        image: live?.image ?? product?.image ?? '',
        totalItems,
      });
      playCartChime();
      noticeTimerRef.current = setTimeout(() => setCartNotice(null), 2600);
    },
    [cartProducts, playCartChime],
  );

  const dismissCartNotice = useCallback(() => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setCartNotice(null);
  }, []);

  const removeFromCart = useCallback((id: ProductId) => {
    setCart((prev) => prev.filter((line) => String(line.id) !== String(id)));
  }, []);

  const setQty = useCallback((id: ProductId, qty: number) => {
    if (qty < 1) {
      setCart((prev) => prev.filter((line) => String(line.id) !== String(id)));
      return;
    }
    setCart((prev) =>
      prev.map((line) => (String(line.id) === String(id) ? { ...line, qty } : line)),
    );
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const toggleWishlist = useCallback((id: ProductId) => {
    setWishlist((prev) =>
      prev.some((w) => String(w) === String(id))
        ? prev.filter((w) => String(w) !== String(id))
        : [...prev, id],
    );
  }, []);

  const isWishlisted = useCallback(
    (id: ProductId) => wishlist.some((w) => String(w) === String(id)),
    [wishlist],
  );

  const cartCount = useMemo(
    () => cart.reduce((sum, line) => sum + line.qty, 0),
    [cart],
  );

  const cartSubtotal = useMemo(
    () =>
      cart.reduce((sum, line) => {
        const live = cartProducts[String(line.id)];
        const product = live ?? getProduct(line.id);
        return sum + (product ? product.price * line.qty : 0);
      }, 0),
    [cart, cartProducts],
  );

  const value = useMemo<StoreValue>(
    () => ({
      cart,
      wishlist,
      addToCart,
      removeFromCart,
      setQty,
      clearCart,
      toggleWishlist,
      isWishlisted,
      cartCount,
      cartSubtotal,
      cartOpen,
      setCartOpen,
      wishOpen,
      setWishOpen,
      cartNotice,
      dismissCartNotice,
      cartProducts,
      cartProductsLoading,
    }),
    [
      cart,
      wishlist,
      addToCart,
      removeFromCart,
      setQty,
      clearCart,
      toggleWishlist,
      isWishlisted,
      cartCount,
      cartSubtotal,
      cartOpen,
      wishOpen,
      cartNotice,
      dismissCartNotice,
      cartProducts,
      cartProductsLoading,
    ],
  );

  return (
    <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
  );
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (ctx === null) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return ctx;
}
