'use client';

import { useEffect, useState } from 'react';
import ProductPrice from '@/components/ProductPrice';

type FeaturedItem = {
  id?: string;
  productId?: string;
  name?: string;
  price?: number | string;
  originalPrice?: number | string;
  image?: string;
  linkHref?: string;
  enabled?: unknown;
};

type FlashSellProduct = {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  image: string;
  href: string;
};

const FEATURED_PATH = 'homepage/featuredProducts/items';

function isFlaggedOn(flag: unknown): boolean {
  if (typeof flag === 'boolean') return flag;
  if (typeof flag === 'string') return flag.trim().toLowerCase() !== 'false';
  if (typeof flag === 'number') return flag !== 0;
  return true;
}

function pickFlashSell(items: FeaturedItem[]): FlashSellProduct[] {
  return items
    .filter(item => Boolean(String(item?.image ?? '').trim()))
    .filter(item => !('enabled' in (item ?? {})) || isFlaggedOn(item?.enabled))
    .map((item, index) => {
      const productId = String(item?.productId ?? item?.id ?? index + 1);
      const original = Number(item?.originalPrice ?? 0);
      return {
        id: productId,
        name: String(item?.name ?? `Product ${index + 1}`),
        price: Number(item?.price ?? 0),
        originalPrice: Number.isFinite(original) && original > 0 ? original : undefined,
        image: String(item?.image ?? ''),
        href: String(item?.linkHref || `/product/${productId}`),
      };
    });
}

export default function FlashSellPage() {
  const [products, setProducts] = useState<FlashSellProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/storefront?action=featured&path=${encodeURIComponent(FEATURED_PATH)}`);
        const data = await res.json().catch(() => ({}));
        let next = pickFlashSell(Array.isArray(data.items) ? data.items : []);
        // Featured rows saved before the picker snapshotted price carry
        // price=0. Hydrate live prices from the product table in one narrow
        // lookup so old rows heal without a re-save.
        const missing = next.filter((item) => !(item.price > 0)).map((item) => item.id);
        if (missing.length > 0) {
          try {
            const priceRes = await fetch(`/api/shop/products?ids=${encodeURIComponent(missing.join(','))}`);
            const priceData = await priceRes.json().catch(() => ({}));
            const byId = new Map<string, { id?: string; price?: number; originalPrice?: number; image?: string; name?: string }>(
              (Array.isArray(priceData.products) ? priceData.products : []).map(
                (row: { id?: string; price?: number; originalPrice?: number; image?: string; name?: string }) => [
                  String(row?.id ?? ''),
                  row,
                ],
              ),
            );
            next = next.map((item) => {
              const live = byId.get(item.id);
              if (!live) return item;
              return {
                ...item,
                price: item.price > 0 ? item.price : Number(live.price ?? 0),
                originalPrice: item.originalPrice ?? (typeof live.originalPrice === 'number' ? live.originalPrice : undefined),
                image: item.image || String(live.image ?? ''),
                name: item.name || String(live.name ?? item.id),
              };
            });
          } catch {
            /* keep the snapshot values */
          }
        }
        if (!cancelled) setProducts(next);
      } catch {
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <section className="py-10 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 lg:px-6">
          <div className="flex flex-col sm:flex-row gap-5 sm:items-end justify-between mb-16">
            <div className="text-left lg:max-w-lg">
              <h1 className="mb-2 text-2xl sm:text-3xl lg:text-5xl font-medium text-gray-800 -tracking-[1.92px]">
                Flash Sell
              </h1>
              <p className="text-base text-gray-500">
                Every flash-sell product in one place.
              </p>
            </div>
            <div className="flex sm:justify-end">
              <a className="inline-flex items-center justify-center rounded-lg border border-teal-500 px-4 py-2.5 text-teal-600 font-medium transition hover:bg-teal-50" href="/">
                Back to Home
              </a>
            </div>
          </div>
          {loading ? (
            <p className="text-base text-gray-500">Loading flash-sell products…</p>
          ) : products.length === 0 ? (
            <p className="text-base text-gray-500">No flash-sell products have been added yet.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-y-8 sm:gap-y-11 gap-x-3 sm:gap-x-6 items-stretch">
              {products.map(item => (
                <article key={item.id} className="flex h-full flex-col">
                  <div className="bg-gray-50 block mb-3 sm:mb-5 rounded-xl relative group overflow-hidden">
                    <a className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl relative z-10" href={item.href}>
                      <img className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110" alt={item.name} src={item.image} loading="lazy" />
                    </a>
                  </div>
                  <div className="mb-4">
                    <h3 className="flex min-h-10 sm:min-h-12 items-start text-xs sm:text-base font-medium text-gray-900">
                      <a className="line-clamp-2" href={item.href}>
                        {item.name}
                      </a>
                    </h3>
                    <ProductPrice price={item.price} originalPrice={item.originalPrice} size="sm" />
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
