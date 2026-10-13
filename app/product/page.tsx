'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ProductPrice from '@/components/ProductPrice';

type ShopProduct = {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  href: string;
};

const COLUMNS = 6;
const FIRST_LOAD_ROWS = 7;
const NEXT_LOAD_ROWS = 4;
const FIRST_LOAD_LIMIT = COLUMNS * FIRST_LOAD_ROWS;
const NEXT_LOAD_LIMIT = COLUMNS * NEXT_LOAD_ROWS;

export default function ProductCatalogPage() {
  return (
    <Suspense fallback={<p className="mx-auto max-w-7xl px-4 py-10 text-base text-gray-500 lg:px-6">Loading products…</p>}>
      <ProductCatalogRouter />
    </Suspense>
  );
}

function ProductCatalogRouter() {
  const searchParams = useSearchParams();
  const category = String(searchParams.get('category') ?? '').trim();
  const search = String(searchParams.get('search') ?? '').trim();
  // Remount the list when the filters change: fresh state, no in-effect resets.
  return <ProductCatalog key={`${category}|${search}`} category={category} search={search} />;
}

function ProductCatalog({ category, search }: { category: string; search: string }) {
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef({ loadingMore: false, hasMore: true, nextCursor: null as string | null, category: '', search: '' });

  // Keep the observer callback reading fresh state without re-subscribing.
  useEffect(() => {
    stateRef.current = { loadingMore, hasMore, nextCursor, category, search };
  }, [loadingMore, hasMore, nextCursor, category, search]);

  const loadMore = useCallback(async (limit: number) => {
    const state = stateRef.current;
    if (state.loadingMore || !state.hasMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (state.category) params.set('category', state.category);
      if (state.search) params.set('search', state.search);
      if (state.nextCursor) params.set('cursor', state.nextCursor);
      const res = await fetch(`/api/shop/products?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      const incoming: ShopProduct[] = Array.isArray(data.products) ? data.products : [];
      setProducts(prev => {
        const seen = new Set(prev.map(item => item.id));
        const fresh = incoming.filter(item => item.id && !seen.has(item.id));
        return [...prev, ...fresh];
      });
      setNextCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null);
      setHasMore(data.hasMore === true);
    } catch {
      /* keep existing products on failure */
    } finally {
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadFirst = async () => {
      // Display name (e.g. "Battery") loads alongside products; the URL slug
      // (e.g. "batteries") stays as-is for filtering.
      if (category) {
        fetch('/api/storefront?action=categories')
          .then(res => res.json().catch(() => ({})))
          .then(data => {
            if (cancelled) return;
            const items: { id?: string; name?: string }[] = Array.isArray(data.items) ? data.items : [];
            const match = items.find(item => String(item?.id ?? '') === category);
            const name = String(match?.name ?? '').trim();
            if (name) setCategoryName(name);
          })
          .catch(() => {});
      }
      try {
        const params = new URLSearchParams({ limit: String(FIRST_LOAD_LIMIT) });
        if (category) params.set('category', category);
        if (search) params.set('search', search);
        const res = await fetch(`/api/shop/products?${params.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setProducts(Array.isArray(data.products) ? data.products : []);
        setNextCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null);
        setHasMore(data.hasMore === true);
      } catch {
        if (!cancelled) {
          setProducts([]);
          setHasMore(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadFirst();
    return () => {
      cancelled = true;
    };
    // Runs once per mount; the parent remounts (key=category) on filter change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) void loadMore(NEXT_LOAD_LIMIT);
      },
      { rootMargin: '600px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, loading]);

  return (
    <main>
      <section className="py-10 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 lg:px-6">
          <div className="flex flex-col sm:flex-row gap-5 sm:items-end justify-between mb-16">
            <div className="text-left lg:max-w-lg">
              <h1 className="mb-2 text-2xl sm:text-3xl lg:text-5xl font-medium text-gray-800 -tracking-[1.92px]">
                {search ? `Results for “${search}”` : categoryName || category || 'Shop All Products'}
              </h1>
              <p className="text-base text-gray-500">
                {search
                  ? `Matched products for ${search} — scroll for more.`
                  : category
                    ? `Every product in ${categoryName || category} — scroll for more.`
                    : 'Every product in one place — scroll for more.'}
              </p>
            </div>
          </div>
          {loading ? (
            <p className="text-base text-gray-500">Loading products…</p>
          ) : products.length === 0 ? (
            <p className="text-base text-gray-500">
              {search
                ? `No products found for ${search}.`
                : category
                  ? `No products have been added to ${categoryName || category} yet.`
                  : 'No products have been added yet.'}
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-y-11 gap-x-6 items-stretch">
                {products.map(item => (
                  <article key={item.id} className="flex h-full flex-col">
                    <div className="bg-gray-50 block mb-5 rounded-xl relative group overflow-hidden">
                      <a className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl relative z-10" href={item.href}>
                        <img className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110" alt={item.name} src={item.image} loading="lazy" />
                      </a>
                    </div>
                    <div className="mb-4 flex flex-1 flex-col">
                      <h3 className="flex min-h-12 items-start text-base font-medium text-gray-900">
                        <a className="line-clamp-2" href={item.href}>
                          {item.name}
                        </a>
                      </h3>
                      <ProductPrice price={item.price} originalPrice={item.originalPrice} size="sm" />
                    </div>
                  </article>
                ))}
              </div>
              {hasMore ? (
                <div ref={sentinelRef} className="mt-12 flex min-h-10 items-center justify-center">
                  {loadingMore ? <p className="text-base text-gray-500">Loading more products…</p> : null}
                </div>
              ) : (
                <p className="mt-12 text-center text-base text-gray-500">You have reached the end.</p>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
