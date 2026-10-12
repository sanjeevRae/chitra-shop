'use client';

import { useEffect, useState } from 'react';

import ProductPrice from '@/components/ProductPrice';

type HeroSlide = {
  image: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  buttonLabel: string;
  buttonHref: string;
};

type HeroBanner = {
  id: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  image: string;
  buttonLabel: string;
  buttonHref: string;
  slides: HeroSlide[];
  tone: string;
};

type CategoryItem = {
  id?: string;
  name?: string;
  text?: string;
  image?: string;
  enabled?: unknown;
};

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

type JustForYouProduct = { id: string; name: string; price: number; originalPrice?: number; image: string; href: string };

type CollectionItem = {
  id?: string;
  title?: string;
  badge?: string;
  discount?: string;
  image?: string;
  linkHref?: string;
  href?: string;
  enabled?: unknown;
};

type HotDeal = {
  id: string;
  badge: string;
  title: string;
  image: string;
  href: string;
  tone: string;
};

function isFlaggedOn(flag: unknown): boolean {
  if (typeof flag === 'boolean') return flag;
  if (typeof flag === 'string') return flag.trim().toLowerCase() !== 'false';
  if (typeof flag === 'number') return flag !== 0;
  return true;
}

function isRowVisible(item: { enabled?: unknown }): boolean {
  return !('enabled' in item) || isFlaggedOn(item.enabled);
}

function pickHeroBanners(items: Record<string, unknown>[]): HeroBanner[] {
  const parseSlides = (value: unknown): HeroSlide[] => {
    if (!Array.isArray(value)) return [];
    return (value as Record<string, unknown>[])
      .map(slide => ({
        image: String(slide?.image ?? ''),
        eyebrow: String(slide?.eyebrow ?? ''),
        title: String(slide?.title ?? ''),
        subtitle: String(slide?.subtitle ?? ''),
        buttonLabel: String(slide?.buttonLabel ?? ''),
        buttonHref: String(slide?.buttonHref ?? '/product'),
      }))
      .filter(slide => slide.image || slide.title);
  };
  return items
    .filter(item => isRowVisible((item ?? {}) as { enabled?: unknown }))
    .map((item, index) => ({
      id: String(item?.id ?? `hero-${index}`),
      eyebrow: String(item?.eyebrow ?? ''),
      title: String(item?.title ?? ''),
      subtitle: String(item?.subtitle ?? item?.description ?? ''),
      image: String(item?.image ?? ''),
      buttonLabel: String(item?.buttonLabel ?? item?.primaryLabel ?? ''),
      buttonHref: String(item?.buttonHref ?? item?.primaryHref ?? '/product'),
      slides: parseSlides(item?.slides),
      tone: String(item?.tone ?? ''),
    }))
    .filter(item => item.id && (item.title || item.image || item.slides.length > 0));
}

function HeroMainCarousel({ frames }: { frames: HeroSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = frames.length;
  const safeIndex = count === 0 ? 0 : Math.min(index, count - 1);
  useEffect(() => {
    if (index >= count) {
      const timer = setTimeout(() => setIndex(0), 0);
      return () => clearTimeout(timer);
    }
  }, [index, count]);
  // Auto-scroll every 3.5s, but pause while the visitor hovers (to read/click a
  // slide) and never auto-advance when the OS asks for reduced motion.
  useEffect(() => {
    if (count <= 1 || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = setInterval(() => setIndex(current => (current + 1) % count), 3500);
    return () => clearInterval(timer);
  }, [count, paused]);
  const frame = frames[safeIndex] ?? { image: '', eyebrow: '', title: '', subtitle: '', buttonLabel: '', buttonHref: '/product' };
  return (
    <div className="relative aspect-[581/600] overflow-hidden rounded-xl" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="flex h-full w-full transition-transform duration-500 ease-out" style={{ transform: `translateX(-${safeIndex * 100}%)` }}>
        {frames.map((slide, i) => (
          slide.image
            ? <img key={i} className="h-full w-full shrink-0 object-cover" alt={slide.title || 'Hero image'} src={slide.image} />
            : <div key={i} className="h-full w-full shrink-0 bg-linear-to-br from-slate-700 to-slate-900" aria-hidden />
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-b from-transparent to-black">
      </div>
      <div id="promotion-1" className="absolute bottom-0 left-0 z-10 w-full p-5 sm:p-6 lg:p-10">
        {frame.eyebrow ? (
          <span className="mb-3 inline-flex rounded-full bg-white px-2.5 py-1 text-sm font-medium">
            {frame.eyebrow}
          </span>
        ) : null}
        <h3 className="mb-3 text-2xl sm:text-3xl lg:text-4xl font-medium text-white">
          {frame.title}
        </h3>
        {frame.subtitle ? (
          <p className="mb-8 max-w-xs text-sm sm:text-base leading-6 text-white/80">
            {frame.subtitle}
          </p>
        ) : null}
        {frame.buttonLabel ? (
          <a className="inline-flex items-center justify-center rounded-lg bg-teal-600 px-4 py-2.5 text-white font-medium transition hover:bg-teal-700" href={frame.buttonHref || '/product'}>
            {frame.buttonLabel}
          </a>
        ) : null}
      </div>
      {count > 1 ? (
        <>
          <button type="button" aria-label="Previous hero slide" onClick={() => setIndex((safeIndex - 1 + count) % count)} className="absolute left-3 top-1/2 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60">‹</button>
          <button type="button" aria-label="Next hero slide" onClick={() => setIndex((safeIndex + 1) % count)} className="absolute right-3 top-1/2 z-20 flex size-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60">›</button>
          <div className="absolute bottom-3 right-4 z-20 flex gap-1.5">
            {frames.map((_, i) => (
              <button key={i} type="button" aria-label={`Go to hero slide ${i + 1}`} onClick={() => setIndex(i)} className={`h-1.5 rounded-full transition-all ${i === safeIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/50 hover:bg-white/80'}`} />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function pickCategories(items: CategoryItem[]): { id: string; name: string; image: string; href: string }[] {
  return items
    .filter(item => Boolean(String(item?.image ?? '').trim()))
    .filter(item => isRowVisible(item ?? {}))
    .map((item, index) => {
      const id = String(item?.id ?? `category-${index}`);
      return {
        id,
        name: String(item?.name ?? `Category ${index + 1}`),
        image: String(item?.image ?? ''),
        href: `/product?category=${encodeURIComponent(id)}`,
      };
    });
}

function pickFlashSell(items: FeaturedItem[]): { id: string; name: string; price: number; originalPrice?: number; image: string; href: string }[] {
  return items
    .filter(item => Boolean(String(item?.image ?? '').trim()))
    .filter(item => isRowVisible(item ?? {}))
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

const HOT_DEAL_TONES = ['bg-pink-500/10', 'bg-blue-500/10', 'bg-yellow-500/10'];

function pickHotDeals(items: CollectionItem[]): HotDeal[] {
  return items
    .filter(item => Boolean(String(item?.image ?? '').trim()))
    .filter(item => isRowVisible(item ?? {}))
    .map((item, index) => ({
      id: String(item?.id ?? `collection-${index}`),
      badge: String(item?.badge ?? item?.discount ?? '').trim(),
      title: String(item?.title ?? '').trim(),
      image: String(item?.image ?? ''),
      href: String(item?.linkHref ?? item?.href ?? '/shop'),
      tone: HOT_DEAL_TONES[index % HOT_DEAL_TONES.length],
    }))
    .filter(item => item.title);
}

const HERO_SLOT_IDS = new Set(['hero-main', 'hero-side-1', 'hero-side-2', 'hero-wide']);

// Resolve the four homepage tiles by their fixed slot id (not array order, so
// position ties can't shuffle the layout). Falls back to display order only for
// legacy rows that predate the id-based slots, and tolerates missing/disabled
// tiles — a hidden side tile no longer hides the whole hero section.
function resolveHeroSlots(banners: HeroBanner[]) {
  if (banners.some(banner => HERO_SLOT_IDS.has(banner.id))) {
    const byId = new Map<string, HeroBanner>(banners.map(banner => [banner.id, banner]));
    return {
      main: byId.get('hero-main'),
      side1: byId.get('hero-side-1'),
      side2: byId.get('hero-side-2'),
      wide: byId.get('hero-wide'),
    };
  }
  const [main, side1, side2, wide] = banners;
  return { main, side1, side2, wide };
}

export default function Home() {
  const [heroBanners, setHeroBanners] = useState<HeroBanner[]>([]);
  const [categories, setCategories] = useState<{ id: string; name: string; image: string; href: string }[]>([]);
  const [visibleCategoryRows, setVisibleCategoryRows] = useState(2);
  const [categoryCols, setCategoryCols] = useState(7);

  useEffect(() => {
    const updateCategoryCols = () => {
      setCategoryCols(window.innerWidth < 1024 ? 4 : 7);
    };
    updateCategoryCols();
    window.addEventListener('resize', updateCategoryCols);
    return () => window.removeEventListener('resize', updateCategoryCols);
  }, []);
  const [flashSell, setFlashSell] = useState<{ id: string; name: string; price: number; originalPrice?: number; image: string; href: string }[]>([]);
  const [hotDeals, setHotDeals] = useState<HotDeal[]>([]);
  const [justForYou, setJustForYou] = useState<JustForYouProduct[]>([]);
  const [justForYouLoading, setJustForYouLoading] = useState(true);
  const [justForYouCols, setJustForYouCols] = useState(5);

  useEffect(() => {
    const updateJustForYouCols = () => {
      const width = window.innerWidth;
      if (width < 640) setJustForYouCols(2);
      else if (width < 1024) setJustForYouCols(2);
      else setJustForYouCols(5);
    };
    updateJustForYouCols();
    window.addEventListener('resize', updateJustForYouCols);
    return () => window.removeEventListener('resize', updateJustForYouCols);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadHeroBanners = async () => {
      try {
        const res = await fetch(`/api/storefront?action=hero&path=${encodeURIComponent('herobanners')}`);
        const data = await res.json().catch(() => ({}));
        const next = pickHeroBanners(Array.isArray(data.items) ? data.items : []);
        if (!cancelled) setHeroBanners(next);
      } catch {
        if (!cancelled) setHeroBanners([]);
      }
    };
    void loadHeroBanners();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadCategories = async () => {
      try {
        const res = await fetch(`/api/storefront?action=categories&path=${encodeURIComponent('categories')}`);
        const data = await res.json().catch(() => ({}));
        const next = pickCategories(Array.isArray(data.items) ? data.items : []);
        if (!cancelled) setCategories(next);
      } catch {
        if (!cancelled) setCategories([]);
      }
    };
    void loadCategories();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadFlashSell = async () => {
      try {
        const res = await fetch(`/api/storefront?action=featured&path=${encodeURIComponent('homepage/featuredProducts/items')}`);
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
        if (!cancelled) setFlashSell(next);
      } catch {
        if (!cancelled) setFlashSell([]);
      }
    };
    void loadFlashSell();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadHotDeals = async () => {
      try {
        const res = await fetch(`/api/storefront?action=collections&path=${encodeURIComponent('collections')}`);
        const data = await res.json().catch(() => ({}));
        const next = pickHotDeals(Array.isArray(data.items) ? data.items : []);
        if (!cancelled) setHotDeals(next);
      } catch {
        if (!cancelled) setHotDeals([]);
      }
    };
    void loadHotDeals();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadJustForYou = async () => {
      try {
        const res = await fetch('/api/shop/just-for-you?limit=12');
        const data = await res.json().catch(() => ({}));
        if (!cancelled && Array.isArray(data.products)) setJustForYou(data.products);
      } catch {
        if (!cancelled) setJustForYou([]);
      } finally {
        if (!cancelled) setJustForYouLoading(false);
      }
    };
    void loadJustForYou();
    return () => {
      cancelled = true;
    };
  }, []);

  const heroSlots = resolveHeroSlots(heroBanners);
  const heroFrames = heroSlots.main
    ? [
        { image: heroSlots.main.image, eyebrow: heroSlots.main.eyebrow, title: heroSlots.main.title, subtitle: heroSlots.main.subtitle, buttonLabel: heroSlots.main.buttonLabel, buttonHref: heroSlots.main.buttonHref },
        ...heroSlots.main.slides,
      ].filter(frame => frame.image || frame.title)
    : [];
  const hasHeroTile = Boolean(heroSlots.main || heroSlots.side1 || heroSlots.side2 || heroSlots.wide);

  return (
    <main>
      {hasHeroTile && (
      <section className="py-10">
        <div className="max-w-7xl mx-auto px-4 xl:px-0">
          <div className="grid gap-2.5 grid-cols-1 md:grid-cols-2 xl:grid-cols-[581px_339px_339px]">
            {(() => {
              const { main, side1, side2, wide } = heroSlots;
              return (
                <>
                  {main && heroFrames.length > 0 && <HeroMainCarousel frames={heroFrames} />}
                  {(side1 || side2) && (
            <div id="promotion-2" className="hidden gap-2.5 md:grid md:auto-rows-fr xl:max-h-[600px]">
              {side1 && (
              <a className={`flex min-h-0 flex-col items-center justify-center overflow-hidden rounded-xl ${side1.tone || 'bg-indigo-500/10'} p-4 text-center`} href={side1.buttonHref || '/product'}>
                {side1.eyebrow ? (
                <span className="mb-2 inline-flex shrink-0 rounded bg-white px-3 py-1 text-sm text-gray-700">
                  {side1.eyebrow}
                </span>
                ) : null}
                <p className="mb-2 shrink-0 text-base font-normal text-gray-700">
                  {side1.title}
                </p>
                {side1.image ? (
                <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-lg">
                  <img className="absolute inset-0 h-full w-full object-contain" alt={side1.title} src={side1.image} />
                </div>
                ) : null}
              </a>
              )}
              {side2 && (
              <a className={`flex min-h-0 flex-col items-center justify-center overflow-hidden rounded-xl ${side2.tone || 'bg-sky-500/10'} p-4 text-center`} href={side2.buttonHref || '/product'}>
                {side2.eyebrow ? (
                <span className="mb-2 inline-flex shrink-0 rounded bg-white px-3 py-1 text-sm text-gray-700">
                  {side2.eyebrow}
                </span>
                ) : null}
                <p className="mb-2 shrink-0 text-base font-normal text-gray-700">
                  {side2.title}
                </p>
                {side2.image ? (
                <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-lg">
                  <img className="absolute inset-0 h-full w-full object-contain" alt={side2.title} src={side2.image} />
                </div>
                ) : null}
              </a>
              )}
            </div>
                  )}
                  {wide && (
            <div id="promotion-3" className={`hidden rounded-xl ${wide.tone || 'bg-blue-500/10'} p-4 md:col-span-2 md:block xl:col-span-1 xl:max-h-[600px] xl:overflow-hidden`}>
              <a className="flex h-full min-h-0 flex-col items-center justify-center overflow-hidden text-center" href={wide.buttonHref || '/product'}>
                {wide.eyebrow ? (
                <span className="mb-2 inline-flex shrink-0 rounded bg-white px-3 py-1 text-sm text-gray-700">
                  {wide.eyebrow}
                </span>
                ) : null}
                <p className="mb-3 shrink-0 text-base font-normal text-gray-700">
                  {wide.title}
                </p>
                {wide.image ? (
                <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-lg">
                  <img className="absolute inset-0 h-full w-full object-contain" alt={wide.title} src={wide.image} />
                </div>
                ) : null}
              </a>
            </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      </section>
      )}
      
       {flashSell.length > 0 && (
      <section className="py-10 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 lg:px-6">
          <div className="flex flex-col sm:flex-row gap-5 sm:items-end justify-between mb-16">
            <div className="text-left lg:max-w-lg">
              <h2 className="mb-2 text-2xl sm:text-3xl lg:text-5xl font-medium text-gray-800 -tracking-[1.92px]">
                Flash Sell
              </h2>
            </div>
            <div className="flex sm:justify-end">
              <a className="inline-flex items-center justify-center rounded-lg bg-teal-600 px-4 py-2.5 text-white font-medium transition hover:bg-teal-700" href="/shop/flash-sell">
                Explore All
              </a>
            </div>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-2 lg:grid-cols-5 gap-y-8 sm:gap-y-11 gap-x-3 sm:gap-x-6 items-stretch">
            {flashSell.slice(0, 5).map((item, index) => (
              <article key={item.id} className={`flex h-full flex-col ${index >= 3 ? 'hidden sm:flex' : ''}`}>
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
                  {/* Big orange sale price + smaller red-crossed original and black -% (per reference). */}
                  <ProductPrice price={item.price} originalPrice={item.originalPrice} size="sm" />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      )}

      {categories.length > 0 && (
      <section className="py-10 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 lg:px-6">
          <div className="flex flex-col sm:flex-row gap-5 sm:items-end justify-between mb-16">
            <div className="text-left lg:max-w-lg">
              <h2 className="mb-2 text-2xl sm:text-3xl lg:text-5xl font-medium text-gray-800 -tracking-[1.92px]">
                Shop by Category
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-4 lg:grid-cols-7 gap-y-11 gap-x-6 items-stretch rounded-[18px] bg-gray-50 p-4 sm:p-6">
            {categories.slice(0, visibleCategoryRows * categoryCols).map(category => (
              <article key={category.id} className="flex h-full flex-col items-center gap-5 text-center group">
                <a className="flex aspect-square w-full items-center justify-center overflow-hidden bg-white rounded-[18px]" href={category.href}>
                  <img className="h-full w-full object-cover" alt={category.name} src={category.image} />
                </a>
                <h3 className="flex min-h-12 items-start justify-center text-gray-800 font-medium text-base group-hover:text-teal-600 transition-colors">
                  <a className="line-clamp-2" href={category.href}>
                    {category.name}
                  </a>
                </h3>
              </article>
            ))}
          </div>
          {categories.length > visibleCategoryRows * categoryCols ? (
            <div className="mt-10 flex justify-center">
              <button
                onClick={() => setVisibleCategoryRows(rows => rows + 2)}
                className="inline-flex items-center justify-center rounded-lg bg-teal-600 px-4 py-2.5 text-white font-medium transition hover:bg-teal-700"
              >
                Show more
              </button>
            </div>
          ) : visibleCategoryRows > 2 ? (
            <div className="mt-10 flex justify-center">
              <button
                onClick={() => setVisibleCategoryRows(2)}
                className="inline-flex items-center justify-center rounded-lg border border-teal-600 px-4 py-2.5 text-teal-700 font-medium transition hover:bg-teal-50"
              >
                Show less
              </button>
            </div>
          ) : null}
        </div>
      </section>
      )}
    

  <section className="py-10 lg:py-20">
  <div className="max-w-7xl mx-auto px-4 lg:px-6">
    <div className="mb-16">
      <div className="text-left lg:max-w-lg">
        <h2 className="mb-2 text-2xl sm:text-3xl lg:text-5xl font-medium text-gray-800 -tracking-[1.92px]">
          Just For You
        </h2>
      </div>
    </div>

    {justForYouLoading ? (
      <p className="text-base text-gray-500">
        Loading just-for-you products…
      </p>
    ) : justForYou.length === 0 ? (
      <p className="text-base text-gray-500">
        No products have been added yet.
      </p>
    ) : (
      <>
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-y-11 gap-x-6 items-stretch">
          {justForYou.slice(0, justForYouCols < 5 ? justForYouCols * 5 : justForYou.length).map(item => (
            <article key={item.id} className="flex h-full flex-col">
              <div className="bg-gray-50 block mb-5 rounded-xl relative group overflow-hidden">
                <a
                  className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl relative z-10"
                  href={item.href}
                >
                  <img
                    className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                    alt={item.name}
                    src={item.image}
                    loading="lazy"
                  />
                </a>
              </div>

              <div className="mb-4 flex flex-1 flex-col">
                <h3 className="flex min-h-12 items-start text-base font-medium text-gray-900">
                  <a className="line-clamp-2" href={item.href}>
                    {item.name}
                  </a>
                </h3>

                <ProductPrice
                  price={item.price}
                  originalPrice={item.originalPrice}
                  size="sm"
                />
              </div>
            </article>
          ))}
        </div>
        <div className="mt-12 flex justify-center">
          <a
            className="inline-flex items-center justify-center rounded-lg bg-teal-600 px-8 py-2.5 text-white font-medium transition hover:bg-teal-700"
            href="/shop/just-for-you/"
          >
            Explore All
          </a>
        </div>
      </>
    )}
  </div>
</section>

      {hotDeals.length > 0 && (
      <section className="py-10 lg:py-20">
        <div className="max-w-7xl mx-auto px-4 lg:px-6">
          <div className="flex flex-col sm:flex-row gap-5 sm:items-end justify-between mb-16">
            <div className="text-left lg:max-w-lg">
              <h2 className="mb-2 text-2xl sm:text-3xl lg:text-5xl font-medium text-gray-800 -tracking-[1.92px]">
                Hot Deals
              </h2>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {hotDeals.map(deal => (
              <article key={deal.id} className={`p-5 ${deal.tone} rounded-xl flex flex-col gap-8`}>
                <div className="p-2">
                  {deal.badge ? (
                    <span className="text-red-500 px-3 py-1 inline-flex items-center justify-center h-8 mb-3 font-semibold bg-white rounded text-base">
                      {deal.badge}
                    </span>
                  ) : null}
                  <h3 className="text-3xl text-gray-700 font-semibold mb-4 leading-9">
                    {deal.title}
                  </h3>
                  <a className="text-gray-800 font-medium text-base border-b border-gray-500 pb-1" href={deal.href}>
                    Shop Now
                  </a>
                </div>
                <div className="mt-auto aspect-[4/3] overflow-hidden rounded-xl">
                  <img className="h-full w-full object-cover" alt={deal.title} src={deal.image} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
      )}
    </main>
  );
}
