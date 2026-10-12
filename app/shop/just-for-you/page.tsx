'use client';

import { useEffect, useState } from 'react';
import ProductPrice from '@/components/ProductPrice';

type JustForYouProduct = {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  href: string;
};

const PAGE_SIZE = 12;

export default function JustForYouPage() {
  const [products, setProducts] = useState<JustForYouProduct[]>([]);
  const [seed, setSeed] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/shop/just-for-you?limit=${PAGE_SIZE}`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setProducts(Array.isArray(data.products) ? data.products : []);
        setSeed(typeof data.seed === 'string' ? data.seed : null);
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
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleViewMore = async () => {
    if (loadingMore || !hasMore || !seed || nextCursor == null) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/shop/just-for-you?limit=${PAGE_SIZE}&seed=${encodeURIComponent(seed)}&cursor=${encodeURIComponent(nextCursor)}`,
      );
      const data = await res.json().catch(() => ({}));
      const incoming: JustForYouProduct[] = Array.isArray(data.products) ? data.products : [];
      setProducts(prev => {
        const seen = new Set(prev.map(item => item.id));
        const fresh = incoming.filter(item => !seen.has(item.id));
        return [...prev, ...fresh];
      });
      setNextCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null);
      setHasMore(data.hasMore === true);
    } catch {
      /* keep existing products on failure */
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <main>
      <section className="py-10 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 lg:px-6">
          <div className="flex flex-col sm:flex-row gap-5 sm:items-end justify-between mb-16">
            <div className="text-left lg:max-w-lg">
              <h1 className="mb-2 text-2xl sm:text-3xl lg:text-5xl font-medium text-gray-800 -tracking-[1.92px]">
                Just For You
              </h1>
              <p className="text-base text-gray-500">
                A fresh random pick on every visit.
              </p>
            </div>
            <div className="flex sm:justify-end">
              <a className="inline-flex items-center justify-center rounded-lg border border-violet-500 px-4 py-2.5 text-violet-600 font-medium transition hover:bg-violet-50" href="/">
                Back to Home
              </a>
            </div>
          </div>
          {loading ? (
            <p className="text-base text-gray-500">Loading just-for-you products…</p>
          ) : products.length === 0 ? (
            <p className="text-base text-gray-500">No products have been added yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-y-8 sm:gap-y-11 gap-x-3 sm:gap-x-6 items-stretch">
                {products.map(item => (
                  <article key={item.id} className="flex h-full flex-col">
                    <div className="bg-gray-50 block mb-3 sm:mb-5 rounded-xl relative group overflow-hidden">
                      <a className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl relative z-10" href={item.href}>
                        <img className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110" alt={item.name} src={item.image} loading="lazy" />
                      </a>
                    </div>
                    <div className="mb-4 flex flex-1 flex-col">
                      <h3 className="flex min-h-10 sm:min-h-12 items-start text-xs sm:text-base font-medium text-gray-900">
                        <a className="line-clamp-2" href={item.href}>
                          {item.name}
                        </a>
                      </h3>
                      {/* Big orange sale price + smaller red-crossed original and black -% (per reference). */}
                      <ProductPrice price={item.price} originalPrice={item.originalPrice} size="sm" />
                    </div>
                  </article>
                ))}
              </div>
              {hasMore ? (
                <div className="mt-12 flex justify-center">
                  <button
                    onClick={handleViewMore}
                    disabled={loadingMore}
                    className="inline-flex items-center justify-center rounded-lg bg-violet-500 px-8 py-2.5 text-white font-medium transition hover:bg-violet-600 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingMore ? 'Loading…' : 'View More'}
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
