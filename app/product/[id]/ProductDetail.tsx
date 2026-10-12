'use client';

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import type { Product } from '@/lib/products';
import { useStore } from '@/lib/store';
import ProductPrice from '@/components/ProductPrice';

const FULL_STAR_PATH =
  'M10 14.7176L15.8779 17.9337L14.6376 11.4552L19.447 6.94132L12.9011 6.1118L10 0.166687L7.09886 6.1118L0.552988 6.94132L5.36244 11.4552L4.12215 17.9337L10 14.7176Z';
const HALF_STAR_LEFT_PATH =
  'M10 14.7176L4.12215 17.9337L5.36244 11.4552L0.552988 6.94132L7.09886 6.1118L10 0.166687';
const HALF_STAR_RIGHT_PATH =
  'M10 14.7176L15.8779 17.9337L14.6376 11.4552L19.447 6.94132L12.9011 6.1118L10 0.166687';

function FullStar() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d={FULL_STAR_PATH} fill="#FBBF24" />
    </svg>
  );
}

function HalfStar() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d={HALF_STAR_LEFT_PATH} fill="#FBBF24" />
      <path d={HALF_STAR_RIGHT_PATH} fill="#E5E7EB" />
    </svg>
  );
}

function EmptyStar() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d={FULL_STAR_PATH} fill="#E5E7EB" />
    </svg>
  );
}

function RatingStars({ rating }: { rating: number }) {
  const halves = Math.round(rating * 2) / 2;
  const full = Math.floor(halves);
  const half = halves - full >= 0.5;
  return (
    <div className="flex items-center">
      {[0, 1, 2, 3, 4].map((i) =>
        i < full ? (
          <FullStar key={i} />
        ) : i === full && half ? (
          <HalfStar key={i} />
        ) : (
          <EmptyStar key={i} />
        ),
      )}
    </div>
  );
}

const TESTIMONIAL_STAR_PATH =
  'M10.0002 2.375C10.2854 2.37513 10.5464 2.53691 10.6728 2.79248L12.7322 6.96484L17.3366 7.63379C17.6189 7.67486 17.8538 7.87412 17.9421 8.14526C18.03 8.41652 17.9558 8.71396 17.7517 8.91309L14.4192 12.1602L15.2065 16.7476C15.2547 17.0288 15.1394 17.3134 14.9087 17.4812C14.6779 17.6489 14.3715 17.6711 14.1189 17.5386L10.0002 15.373L5.88157 17.5386C5.62898 17.6714 5.3227 17.6488 5.09177 17.4812C4.86114 17.3134 4.74454 17.0287 4.7927 16.7476L5.57883 12.1602L2.24753 8.91309C2.04375 8.71392 1.97041 8.41635 2.05832 8.14526C2.14665 7.87404 2.3815 7.67486 2.66379 7.63379L7.26706 6.96484L9.32761 2.79248L9.38132 2.70093C9.51978 2.49887 9.75079 2.37507 10.0002 2.375Z';

function TestimonialStars() {
  return (
    <div className="flex items-center mb-5">
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d={TESTIMONIAL_STAR_PATH} fill="#FACC15" />
        </svg>
      ))}
    </div>
  );
}

const BADGE_COLOR_CLASSES: Record<string, string> = {
  green: 'text-green-700 bg-green-50',
  violet: 'text-violet-700 bg-violet-50',
  blue: 'text-blue-700 bg-blue-50',
};

type TabId = 'spec' | 'info' | 'review';

const TABS: { id: TabId; label: string }[] = [
  { id: 'spec', label: 'Specification' },
  { id: 'info', label: 'Information' },
  { id: 'review', label: 'Review' },
];

// Desktop-only Amazon-style magnifier (>= 1024px). ZOOM_PREVIEW is the
// magnified preview panel size in px; the lens covers exactly the region the
// panel shows. Adaptive zoom (>= ZOOM_MIN_FACTOR) guarantees the panel always
// fills for any image aspect ratio.
const ZOOM_PREVIEW = 640;
const ZOOM_MIN_FACTOR = 2;

export default function ProductDetail({ product }: { product: Product }) {
  const { addToCart, toggleWishlist, isWishlisted } = useStore();
  const [qty, setQty] = useState(1);
  const [activeSlide, setActiveSlide] = useState(0);
  const [tab, setTab] = useState<TabId>('spec');
  const [colorIdx, setColorIdx] = useState(0);
  const [sizeIdx, setSizeIdx] = useState(0);

  // Desktop zoom magnifier (Amazon-style). The lens and preview panel are
  // static markup mutated directly through refs on mousemove — no React
  // re-renders (smooth) and no hydration risk (initial styles are static).
  const frameRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const hideZoom = () => {
    if (lensRef.current) lensRef.current.style.display = 'none';
    if (previewRef.current) previewRef.current.style.display = 'none';
  };

  const isDesktopZoom = () =>
    typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

  const updateZoom = (e: ReactMouseEvent<HTMLImageElement>) => {
    // No zoom/magnifier on mobile or tablet — keep existing behavior there.
    if (!isDesktopZoom()) {
      hideZoom();
      return;
    }
    const img = e.currentTarget;
    const frame = frameRef.current;
    const lens = lensRef.current;
    const preview = previewRef.current;
    if (!frame || !lens || !preview) return;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!nw || !nh) return;
    const rect = img.getBoundingClientRect();
    const cs = getComputedStyle(img);
    const pl = parseFloat(cs.paddingLeft) || 0;
    const pr = parseFloat(cs.paddingRight) || 0;
    const pt = parseFloat(cs.paddingTop) || 0;
    const pb = parseFloat(cs.paddingBottom) || 0;
    const cw = rect.width - pl - pr;
    const ch = rect.height - pt - pb;
    if (cw <= 0 || ch <= 0) return;
    // object-contain: where the picture is actually painted inside the box
    // (accounts for letterboxing so the magnified region is exact).
    const scale = Math.min(cw / nw, ch / nh);
    const pw = nw * scale;
    const ph = nh * scale;
    const ox = rect.left + pl + (cw - pw) / 2;
    const oy = rect.top + pt + (ch - ph) / 2;
    const zoom = Math.max(ZOOM_MIN_FACTOR, ZOOM_PREVIEW / pw, ZOOM_PREVIEW / ph);
    const bgW = pw * zoom;
    const bgH = ph * zoom;
    const lensW = Math.min(ZOOM_PREVIEW / zoom, pw);
    const lensH = Math.min(ZOOM_PREVIEW / zoom, ph);
    // Clamp inside the painted image: the lens never leaves the picture and
    // the preview panel stays fully covered (no background gaps).
    const clamp = (raw: number, lensLen: number, size: number) => {
      const half = lensLen / 2 / size;
      return Math.min(Math.max(raw, half), 1 - half);
    };
    const nx = clamp((e.clientX - ox) / pw, lensW, pw);
    const ny = clamp((e.clientY - oy) / ph, lensH, ph);
    const fr = frame.getBoundingClientRect();
    lens.style.display = 'block';
    lens.style.width = `${lensW}px`;
    lens.style.height = `${lensH}px`;
    lens.style.left = `${ox + nx * pw - lensW / 2 - fr.left}px`;
    lens.style.top = `${oy + ny * ph - lensH / 2 - fr.top}px`;
    preview.style.display = 'block';
    preview.style.backgroundImage = `url("${img.currentSrc || img.src}")`;
    preview.style.backgroundSize = `${bgW}px ${bgH}px`;
    preview.style.backgroundPosition = `${ZOOM_PREVIEW / 2 - nx * bgW}px ${
      ZOOM_PREVIEW / 2 - ny * bgH
    }px`;
  };

  // Switching gallery images invalidates the current zoom position.
  useEffect(() => {
    if (lensRef.current) lensRef.current.style.display = 'none';
    if (previewRef.current) previewRef.current.style.display = 'none';
  }, [activeSlide]);

  const wishlisted = isWishlisted(product.id);

  // Database-driven: colors/sizes/stock/specifications/information/reviews.
  // Empty Color, Size, or Stock sections are hidden entirely.
  const colors = (product.colors ?? []).map(item => String(item).trim()).filter(Boolean);
  const sizes = (product.sizes ?? []).map(item => String(item).trim()).filter(Boolean);
  const galleryImages = [product.image, ...(product.images ?? [])]
    .map(item => String(item ?? '').trim())
    .filter(Boolean);
  const gallery = (
    galleryImages.length > 0
      ? galleryImages.slice(0, 4)
      : ['/images/product-slider/lg-1.png']
  ).map((image, index) => ({
    large: image,
    thumb: image,
    largeAlt: index === 0 ? product.name : `Product Image ${index + 1}`,
    thumbAlt: index === 0 ? product.name : `Thumbnail ${index + 1}`,
  }));
  const specifications = (product.specifications ?? []).filter(
    item => String(item?.label ?? '').trim() || String(item?.value ?? '').trim(),
  );
  const information = String(product.information ?? product.description ?? '').trim();
  const reviews = (product.reviews ?? []).filter(item => String(item?.text ?? '').trim());
  const visibleTabs = TABS.filter(current => {
    if (current.id === 'spec') return specifications.length > 0;
    if (current.id === 'info') return Boolean(information);
    return reviews.length > 0;
  });
  const activeTab = visibleTabs.some(current => current.id === tab) ? tab : visibleTabs[0]?.id;

  const badgeClasses = product.badge
    ? BADGE_COLOR_CLASSES[product.badgeColor ?? 'green'] ?? BADGE_COLOR_CLASSES.green
    : null;

  return (
    <main>
      <section className="lg:pt-20 pt-14 pb-20">
        <div className="max-w-7xl px-4 lg:px-6 mx-auto">
          <nav className="flex mb-7" aria-label="Breadcrumb">
            <ol className="inline-flex items-center space-x-1 md:space-x-2 text-sm">
              <li className="inline-flex items-center">
                <a className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-900" href="/">
                  Home
                </a>
              </li>
              <li>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M5.83333 12.6667L10 8.50008L5.83333 4.33341" stroke="#6B7280" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </li>
              <li>
                <a className="text-gray-500 hover:text-gray-900" href="/product">
                  Product
                </a>
              </li>
              <li>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M5.83333 12.6667L10 8.50008L5.83333 4.33341" stroke="#6B7280" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </li>
              <li className="inline-flex items-center">
                <span className="inline-flex items-center gap-1 font-medium text-gray-900">
                  {product.name}
                </span>
              </li>
            </ol>
          </nav>
          <div className="flex flex-col lg:flex-row gap-12">
            <div className="relative w-full lg:w-1/2">
              <div ref={frameRef} className="relative bg-gray-50 rounded-3xl overflow-hidden mb-4">
                <div className="swiper swiper-initialized swiper-horizontal productMainSwiper swiper-backface-hidden">
                  <div
                    className="swiper-wrapper"
                    style={{
                      transform: `translate3d(${-480 * activeSlide}px, 0px, 0px)`,
                      transitionDuration: '0ms',
                      alignItems: 'flex-start',
                      // One slide wide and centered in the frame: the active
                      // image always sits in the middle of the box.
                      width: '480px',
                      margin: '0 auto',
                    }}
                  >
                    {gallery.map((g, i) => (
                      <div
                        key={g.large}
                        className={
                          'swiper-slide' + (i === activeSlide ? ' swiper-slide-active' : '') + (i === (activeSlide + 1) % gallery.length ? ' swiper-slide-next' : '')
                        }
                        style={{
                          width: '480px',
                          // Only the active slide is painted: the frame can be
                          // wider than a slide, which otherwise let the next
                          // image peek in beside the current one.
                          visibility: i === activeSlide ? 'visible' : 'hidden',
                        }}
                      >
                        <img
                          alt={g.largeAlt}
                          className="aspect-square w-full cursor-zoom-in object-contain p-6"
                          src={g.large}
                          onMouseEnter={updateZoom}
                          onMouseMove={updateZoom}
                          onMouseLeave={hideZoom}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div
                  ref={lensRef}
                  aria-hidden="true"
                  className="pointer-events-none absolute z-30 border border-black/40 bg-black/10"
                  style={{ display: 'none' }}
                />
              </div>
              <div
                ref={previewRef}
                aria-hidden="true"
                className="pointer-events-none absolute left-full top-0 z-50 ml-2 border border-gray-200 bg-white shadow-xl"
                style={{
                  display: 'none',
                  width: ZOOM_PREVIEW,
                  height: ZOOM_PREVIEW,
                  backgroundRepeat: 'no-repeat',
                }}
              />
              <div className="swiper swiper-initialized swiper-horizontal swiper-watch-progress productThumbSwiper swiper-backface-hidden swiper-thumbs">
                <div className="swiper-wrapper" style={{ display: 'flex' }}>
                  {gallery.map((g, i) => (
                    <div
                      key={g.thumb}
                      onClick={() => setActiveSlide(i)}
                      className={
                        'swiper-slide swiper-slide-visible swiper-slide-fully-visible cursor-pointer' +
                        (i === activeSlide ? ' swiper-slide-active swiper-slide-thumb-active' : '') +
                        (i === (activeSlide + 1) % gallery.length ? ' swiper-slide-next' : '')
                      }
                      style={{ width: '100px', marginRight: '16px' }}
                    >
                      <div className="bg-gray-50 rounded-xl overflow-hidden transition-all duration-300">
                        <img alt={g.thumbAlt} className="aspect-square w-full object-contain p-2" src={g.thumb} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="w-full lg:w-1/2">
              <div className="space-y-10">
                <div>
                  <h3 className="mb-2.5 font-semibold text-gray-800 text-3xl sm:text-4xl sm:leading-10">
                    {product.name}
                  </h3>
                  <div className="flex items-center">
                    <RatingStars rating={product.rating} />
                    <p className="ml-2">
                      {product.rating} ({product.reviewCount} review{product.reviewCount === 1 ? '' : 's'})
                    </p>
                  </div>
                  <div className="my-5">
                    {/* Big orange sale price + smaller red-crossed original and black -% (per reference). */}
                    <ProductPrice price={product.price} originalPrice={product.originalPrice} size="lg" />
                    {product.badge && badgeClasses && (
                      <span className={`mt-3 px-2 py-0.5 text-xs inline-block leading-4 font-medium rounded-full ${badgeClasses}`}>
                        {product.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-gray-500 text-base leading-6">
                    {product.description}
                  </p>
                </div>
                <div className="space-y-6">
                  {colors.length > 0 ? (
                    <div>
                      <h4 className="font-medium text-gray-800 text-base mb-4">
                        Color:
                      </h4>
                      <div className="flex items-center gap-2">
                        {colors.map((color, i) => (
                          <div
                            key={`${color}-${i}`}
                            role="button"
                            tabIndex={0}
                            title={color}
                            aria-label={`Color ${color}`}
                            onClick={() => setColorIdx(i)}
                            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setColorIdx(i); }}
                            className={
                              'relative w-7 h-7 ring-2 ring-offset-2 ring-offset-white rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 ' +
                              (i === colorIdx ? 'ring-[#313131]/30' : 'ring-transparent')
                            }
                            style={{ backgroundColor: color }}
                          >
                            {i === colorIdx && (
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M10.0517 3.26953L4.59172 8.72953L1.94922 6.08706" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {sizes.length > 0 ? (
                    <div>
                      <h4 className="font-medium text-gray-800 text-base mb-4">
                        Size:
                      </h4>
                      <div className="flex gap-2">
                        {sizes.map((size, i) => (
                          <button
                            key={`${size}-${i}`}
                            onClick={() => setSizeIdx(i)}
                            className={
                              'px-3.5 py-2 h-9 text-sm leading-5 inline-flex items-center justify-center font-medium border rounded-lg cursor-pointer transition ' +
                              (i === sizeIdx
                                ? 'bg-violet-50 text-violet-500 border-violet-500'
                                : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100')
                            }
                          >
                            {size}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div>
                  {typeof product.stock === 'number' && Number.isFinite(product.stock) && product.stock > 0 ? (
                    <p className="text-gray-900 text-base mb-6">
                      Hurry up! Only{" "}
                      <span className="text-red-500">
                        ({product.stock} items)
                      </span>
                      {" "}left in stock
                    </p>
                  ) : null}
                  <div className="flex gap-4">
                    <div className="flex w-[146px] divide-gray-200 divide-x h-11 rounded-lg border border-gray-200 overflow-hidden">
                      <button
                        onClick={() => setQty((q) => Math.max(1, q - 1))}
                        className="w-11 h-11 flex items-center justify-center hover:bg-gray-100 transition"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <path d="M5 9.25C4.59 9.25 4.25 9.59 4.25 10C4.25 10.41 4.59 10.75 5 10.75H15C15.41 10.75 15.75 10.41 15.75 10C15.75 9.59 15.41 9.25 15 9.25H5Z" fill="#6B7280" />
                        </svg>
                      </button>
                      <div className="flex-1 flex items-center justify-center">
                        {qty}
                      </div>
                      <button
                        onClick={() => setQty((q) => q + 1)}
                        className="w-11 h-11 flex items-center justify-center hover:bg-gray-100 transition"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <path d="M10 4.25C10.41 4.25 10.75 4.59 10.75 5V9.25H15C15.41 9.25 15.75 9.59 15.75 10C15.75 10.41 15.41 10.75 15 10.75H10.75V15C10.75 15.41 10.41 15.75 10 15.75C9.59 15.75 9.25 15.41 9.25 15V10.75H5C4.59 10.75 4.25 10.41 4.25 10C4.25 9.59 4.59 9.25 5 9.25H9.25V5C9.25 4.59 9.59 4.25 10 4.25Z" fill="#6B7280" />
                        </svg>
                      </button>
                    </div>
                    <button
                      onClick={() => addToCart(product.id, qty)}
                      className="inline-flex grow justify-center text-base leading-5 cursor-pointer focus:ring-3 focus:ring-violet-500/20 items-center bg-violet-500 transition hover:bg-violet-600 py-2.5 px-3.5 rounded-lg text-white font-medium"
                    >
                      Add to Cart
                    </button>
                    <button
                      onClick={() => toggleWishlist(product.id)}
                      className="inline-flex text-sm justify-center leading-5 w-11 h-11 cursor-pointer focus:ring-3 items-center transition rounded-lg border font-medium bg-white border-gray-300 text-gray-800 hover:bg-gray-100 focus:ring-gray-500/20"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M3.51311 4.41851C1.88463 6.04699 1.88463 8.68728 3.51311 10.3158L9.11618 15.9189C9.60433 16.4071 10.3958 16.4071 10.884 15.9189L16.487 10.3158C18.1155 8.68737 18.1155 6.04707 16.487 4.41859C14.8586 2.79011 12.2183 2.79011 10.5898 4.41859L10.0001 5.00826L9.41037 4.4185C7.78188 2.79002 5.14159 2.79002 3.51311 4.41851Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill={wishlisted ? 'currentColor' : 'none'} />
                      </svg>
                    </button>
                  </div>
                  <div className="flex-col flex items-center mt-11">
                    <div className="flex flex-wrap items-center justify-center gap-4">
                      <img alt="eSewa" className="h-5 w-auto object-contain" src="/images/payment/esewa-logo.png" />
                      <img alt="Khalti" className="h-6 w-auto object-contain" src="/images/payment/khalti-logo.png" />
                      <img alt="Fonepay" className="h-6 w-auto object-contain" src="/images/payment/fonepay-logo.png" />
                      <img alt="Cash on Delivery" className="h-6 w-auto object-contain" src="/images/payment/cod-logo.png" />
                    </div>
                    <div className="flex text-center justify-center flex-col sm:flex-row gap-1 items-center mt-3">
                      <svg xmlns="http://www.w3.org/2000/svg" width="29" height="28" viewBox="0 0 29 28" fill="none">
                        <path d="M6.07178 8.18676C6.07177 7.50195 6.4712 6.88006 7.09397 6.59526L13.7719 3.54133C14.2341 3.32997 14.7654 3.32997 15.2276 3.54133L21.9056 6.59527C22.5283 6.88007 22.9277 7.50193 22.9278 8.18672L22.9278 14.5626C22.9279 16.2022 22.4254 17.8057 21.3948 19.0808C19.5488 21.3648 16.4535 24.7918 14.4999 24.7918C12.5463 24.7918 9.45087 21.3647 7.6049 19.0807C6.57437 17.8057 6.07189 16.2022 6.07187 14.5628L6.07178 8.18676Z" fill="#16A34A" />
                        <path d="M17.9728 10.785L13.2923 15.4655L11.0271 13.2003M14.4999 24.7918C16.4535 24.7918 19.5488 21.3648 21.3948 19.0808C22.4254 17.8057 22.9279 16.2022 22.9278 14.5626L22.9278 8.18672C22.9277 7.50193 22.5283 6.88007 21.9056 6.59527L15.2276 3.54133C14.7654 3.32997 14.2341 3.32997 13.7719 3.54133L7.09397 6.59526C6.4712 6.88006 6.07177 7.50195 6.07178 8.18676L6.07187 14.5628C6.07189 16.2022 6.57437 17.8057 7.6049 19.0807C9.45087 21.3647 12.5463 24.7918 14.4999 24.7918Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <p className="text-gray-500 -tracking-tight text-base">
                        Secure checkout with encrypted payment processing
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-11">
            <div className="flex border-b border-gray-200">
              {visibleTabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={
                    'px-6 py-3 text-base font-medium cursor-pointer transition-colors relative ' +
                    (activeTab === t.id ? 'text-violet-600' : 'text-gray-500 hover:text-gray-800')
                  }
                >
                  {t.label}
                  {activeTab === t.id && (
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-violet-600 rounded-t">
                    </span>
                  )}
                </button>
              ))}
            </div>
            {visibleTabs.length === 0 ? (
              <div className="py-8">
                <p className="text-gray-500 text-base leading-6">
                  Details for this product have not been added yet.
                </p>
              </div>
            ) : null}
            {activeTab === 'spec' && specifications.length > 0 && (
              <div className="py-8">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <tbody className="divide-y divide-gray-100">
                      {specifications.map((row, index) => (
                        <tr key={`${row.label}-${index}`}>
                          <td className="py-3 pr-8 font-medium text-gray-800 whitespace-nowrap w-1/3">
                            {row.label}
                          </td>
                          <td className="py-3 text-gray-500">
                            {row.value}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {activeTab === 'info' && information ? (
              <div className="py-8">
                <p className="text-gray-500 text-base leading-6">
                  {information}
                </p>
              </div>
            ) : null}
            {activeTab === 'review' && reviews.length > 0 && (
              <div className="py-8">
                <div className="flex items-center gap-4 mb-8">
                  <span className="text-5xl font-bold text-gray-800">
                    {product.rating}
                  </span>
                  <div>
                    <RatingStars rating={product.rating} />
                    <p className="text-gray-500 text-base mt-1">
                      Based on {product.reviewCount} reviews
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {reviews.map((r) => (
                    <article key={`${r.name}-${r.text.slice(0, 24)}`} className="p-6 bg-gray-50 rounded-xl flex flex-col justify-between">
                      {typeof r.rating === 'number' && r.rating > 0 ? (
                        <RatingStars rating={r.rating} />
                      ) : (
                        <TestimonialStars />
                      )}
                      <p className="text-base text-gray-700 leading-6 mb-7">
                        {r.text}
                      </p>
                      <div className="flex items-center gap-2">
                        {r.avatar ? (
                          <div>
                            <img className="size-10 rounded-full" alt="" src={r.avatar} />
                          </div>
                        ) : null}
                        <div>
                          <p className="font-medium text-gray-900">
                            {r.name}
                          </p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
