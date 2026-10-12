'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '../lib/store';
import { useCustomerAuth } from '../lib/customer-context';
import { MIN_SEARCH_LENGTH, SEARCH_DEBOUNCE_MS, fetchSearchSuggestions, type SearchSuggestion } from '../lib/product-search';

const NOTICE_PATH = 'homepage/noticeBanners/items';

function isNoticeEnabled(item: { enabled?: boolean }): boolean {
  return item.enabled !== false;
}

function formatCountdown(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${pad(days)} days, ${pad(hours)} hrs, ${pad(minutes)} min`;
}

// Mirrors the homepage visibility rule: honor the enabled flag when present
// (boolean / 'false' string / 0), default to visible otherwise.
function featuredItemEnabled(item: { enabled?: unknown }): boolean {
  const flag = item.enabled;
  if (typeof flag === 'boolean') return flag;
  if (typeof flag === 'string') return flag.trim().toLowerCase() !== 'false';
  if (typeof flag === 'number') return flag !== 0;
  return true;
}

export default function Header() {
  const router = useRouter();
  const { cartCount } = useStore();
  const { user, openLogin, logout } = useCustomerAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const searchRequestRef = useRef(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Clicking outside the account menu (or pressing Escape) closes it.
  // Both the desktop and mobile icon buttons share this state, so the check
  // uses a data attribute instead of a single ref.
  useEffect(() => {
    if (!accountOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest?.('[data-account-menu]')) setAccountOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setAccountOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [accountOpen]);

  const handleAccountClick = () => {
    if (!user) openLogin();
    else setAccountOpen((current) => !current);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
      setAccountOpen(false);
      setMobileOpen(false);
      router.push('/');
    }
  };
  const [noticeMessage, setNoticeMessage] = useState('');
  const [countdownTo, setCountdownTo] = useState('');
  const [nowTick, setNowTick] = useState(() => Date.now());

  // Promo tile inside the desktop Categories menu: show the first enabled
  // featured product instead of the static menu-image.jpg. Falls back to the
  // static image while loading or when no featured product has an image.
  const [menuFeature, setMenuFeature] = useState<{ image: string; name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadMenuFeature = async () => {
      try {
        const res = await fetch(`/api/storefront?action=featured&path=${encodeURIComponent('homepage/featuredProducts/items')}`);
        const data = await res.json().catch(() => ({}));
        const items: Array<{ id?: string; productId?: string; name?: string; image?: string; enabled?: unknown }> =
          Array.isArray(data.items) ? data.items : [];
        const first = items.find(item =>
          Boolean(String(item?.image ?? '').trim()) && featuredItemEnabled(item ?? {}),
        );
        if (cancelled || !first) return;
        setMenuFeature({
          image: String(first.image ?? ''),
          name: String(first.name ?? 'Featured product'),
        });
      } catch {
        // Keep the static fallback if the storefront request fails.
      }
    };
    void loadMenuFeature();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadNotice = async () => {
      try {
        const res = await fetch(`/api/storefront?action=notice&path=${encodeURIComponent(NOTICE_PATH)}`);
        const data = await res.json().catch(() => ({}));
        const items = Array.isArray(data.items) ? data.items : [];
        const active = items.find((item: { enabled?: boolean }) =>
          isNoticeEnabled(item ?? {}),
        );
        const message = String(active?.message ?? active?.title ?? '').trim();
        if (!cancelled) {
          setNoticeMessage(message);
          setCountdownTo(String(active?.countdownTo ?? ''));
        }
      } catch {
        /* keep the banner hidden when the notice cannot be loaded */
      }
    };
    void loadNotice();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!countdownTo) return;
    const target = new Date(countdownTo).getTime();
    if (Number.isNaN(target)) return;
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [countdownTo]);

  const countdownTarget = countdownTo ? new Date(countdownTo).getTime() : Number.NaN;
  const countdownText = !countdownTo || Number.isNaN(countdownTarget) ? '' : formatCountdown(countdownTarget - nowTick);

  const submitSearch = () => {
    setSearchOpen(false);
    setSuggestions([]);
    setMobileOpen(false);
    const q = searchTerm.trim();
    router.push(q ? '/product?search=' + encodeURIComponent(q) : '/product');
  };

  const handleSearchKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      submitSearch();
    } else if (e.key === 'Escape') {
      setSearchOpen(false);
    }
  };

  useEffect(() => {
    const query = searchTerm.trim();
    if (query.length < MIN_SEARCH_LENGTH) {
      const clearTimer = setTimeout(() => {
        setSuggestions([]);
        setSearching(false);
        setSearchOpen(false);
      }, 0);
      return () => clearTimeout(clearTimer);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- debounced autocomplete marks loading before scheduling the DB request
    setSearching(true);
    const requestId = (searchRequestRef.current += 1);
    const timer = setTimeout(() => {
      void (async () => {
        const results = await fetchSearchSuggestions(query);
        if (searchRequestRef.current !== requestId) return;
        setSuggestions(results ?? []);
        setSearching(false);
        setSearchOpen(true);
      })();
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, []);

  return (
<header>
  <div className="bg-gray-100 py-3">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative flex sm:flex-row gap-2 justify-center flex-col items-center">
      {noticeMessage ? (
        <p className="text-gray-900 text-sm font-medium order-1 sm:order-2 text-center" suppressHydrationWarning>
          {noticeMessage}
          {countdownText ? (
            <span className="block sm:inline text-center mt-1 sm:mt-0 sm:ml-2 font-semibold tabular-nums">
              Ends in {countdownText}
            </span>
          ) : null}
        </p>
      ) : null}
      <div className="hidden sm:block order-3 sm:absolute sm:right-4 lg:right-6 xl:right-8">
        <button
          type="button"
          onClick={openLogin}
          className="flex gap-2 text-sm items-center font-medium text-gray-900 cursor-pointer"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path fillRule="evenodd" clipRule="evenodd" d="M10.3289 3.875C11.6009 3.87514 12.6316 4.90664 12.6316 6.17871C12.6315 7.45067 11.6008 8.48131 10.3289 8.48145C9.05679 8.48145 8.0253 7.45075 8.02516 6.17871C8.02516 4.90655 9.05671 3.875 10.3289 3.875ZM10.3289 9.98145C12.4293 9.98131 14.1315 8.2791 14.1316 6.17871C14.1316 4.07821 12.4293 2.37514 10.3289 2.375C8.22828 2.375 6.52516 4.07812 6.52516 6.17871C6.5253 8.27918 8.22836 9.98145 10.3289 9.98145ZM15.9504 16.7449V17.033C15.9504 17.4472 16.2862 17.783 16.7004 17.783C17.1145 17.7828 17.4504 17.4471 17.4504 17.033V16.7449C17.4504 13.5889 14.8915 11.03 11.7356 11.03H8.9231C5.76714 11.03 3.20825 13.5889 3.20825 16.7449V17.033C3.20825 17.4472 3.54404 17.783 3.95825 17.783C4.37247 17.783 4.70825 17.4472 4.70825 17.033V16.7449C4.70825 14.4174 6.59557 12.53 8.9231 12.53H11.7356C14.0631 12.53 15.9504 14.4174 15.9504 16.7449Z" fill="currentColor" />
          </svg>
          Sign In / Register
        </button>
      </div>
    </div>
  </div>
  <nav className="bg-white py-4 lg:py-0 border-b border-gray-100 sticky top-0 z-40">
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="flex justify-between items-center">

        <div className="flex items-center">
          <a href="/">
            <img
              alt="Chitra Shop Logo"
              src="/images/logo/header-logo.png"
              className="h-11 w-auto object-contain"
            />
          </a>
          <div ref={searchBoxRef} className="relative ml-6 hidden min-w-0 flex-1 lg:block">
            <div className="flex">
              <input placeholder="Search products.." value={searchTerm} onFocus={() => { if (suggestions.length > 0) setSearchOpen(true); }} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={handleSearchKey} className="h-11 w-full min-w-0 flex-1 rounded-l-lg border border-r-0 border-gray-300 bg-white px-4 text-base text-gray-800 placeholder:text-gray-400 focus:border-violet-300 focus:outline-0 ring-3 ring-transparent focus:ring-violet-500/30" type="text" />
              <button type="button" onClick={submitSearch} aria-label="Search" className="inline-flex h-11 w-14 shrink-0 cursor-pointer items-center justify-center rounded-r-lg bg-black text-white transition hover:bg-gray-800">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M9.4375 2.3125C13.3726 2.3125 16.5634 5.5019 16.5635 9.43652C16.5635 11.1342 15.9681 12.6921 14.9766 13.916L17.4688 16.4082C17.7609 16.7011 17.7604 17.1761 17.4678 17.4688C17.175 17.7612 16.7 17.7612 16.4072 17.4688L13.915 14.9756C12.6911 15.9656 11.1343 16.5605 9.4375 16.5605C5.50258 16.5603 2.3125 13.3711 2.3125 9.43652C2.31258 5.50205 5.50263 2.31273 9.4375 2.3125ZM9.4375 3.8125C6.33077 3.81273 3.81258 6.33076 3.8125 9.43652C3.8125 12.5424 6.33073 15.0603 9.4375 15.0605C12.5445 15.0605 15.0635 12.5425 15.0635 9.43652C15.0634 6.33062 12.5444 3.8125 9.4375 3.8125Z" fill="currentColor" /></svg>
              </button>
            </div>
            {searchOpen && (searching || suggestions.length > 0) ? (
              <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                {searching ? (
                  <p className="px-4 py-3 text-sm text-gray-500">Searching...</p>
                ) : suggestions.length > 0 ? (
                  <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto">
                    {suggestions.map((item) => (
                      <li key={item.id}>
                        <a href={item.href} onClick={() => setSearchOpen(false)} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-gray-50">
                          {item.image ? (
                            <img alt="" src={item.image} loading="lazy" className="h-10 w-10 rounded-md object-cover" />
                          ) : null}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-gray-900">{item.name}</span>
                            <span className="block text-xs text-gray-500">Rs. {item.price}</span>
                          </span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 py-3 text-sm text-gray-500">No products found</p>
                )}
                <button type="button" onClick={submitSearch} className="block w-full cursor-pointer border-t border-gray-100 px-4 py-2.5 text-left text-sm font-medium text-violet-600 transition-colors hover:bg-violet-50">
                  View all results
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <div className="hidden lg:flex items-center">
          <a className="text-gray-800 hover:text-violet-500 py-7 px-3.5 text-base font-medium transition-colors" href="/">
            Home
          </a>
          <a className="text-gray-800 hover:text-violet-500 py-7 px-3.5 text-base font-medium transition-colors" href="/product">
            Shop
          </a>
          <div className="group px-3.5 py-7">
            <a className="inline-flex items-center text-gray-800 transition-all cursor-pointer group-hover:text-violet-500 text-base font-medium" href="/product">
              Products
              <svg className="transition-transform duration-300 group-hover:rotate-180" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M4.79175 7.39575L10.0001 12.6041L15.2084 7.39575" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <div className="absolute left-0 right-0 border-t mt-7 w-full py-7 border-gray-100 bg-white z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300">
  <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div className="flex flex-col xl:flex-row divide-y xl:divide-y-0 xl:divide-x divide-gray-100 gap-7">
      <div className="xl:w-2/3 flex divide-x divide-gray-100 pb-7">
        <div className="pr-7 w-1/3">
          <h3 className="text-gray-800 text-xl mb-3 font-medium">
            Mobile &amp; Accessories
          </h3>
          <div className="space-y-3">
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=charger%20cable">
              Charger &amp; Cable
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=mobile%20repair%20parts">
              Mobile Repair &amp; Parts
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=watch">
              Watch
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=earphone">
              Earphone
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=mobile%20accessories">
              Mobile Accessories
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=power%20bank">
              Power Bank
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=phone">
              Phone
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=tablet%20accessories">
              Tablet Accessories
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=batteries">
              Batteries
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=tools%20testers">
              Tools &amp; Testers
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=car%20electronics">
              Car Electronics
            </a>
          </div>
        </div>
        <div className="px-7 w-1/3">
          <h3 className="text-gray-800 text-xl mb-3 font-medium">
            Computers &amp; Electronics
          </h3>
          <div className="space-y-3">
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=computer%20accessories">
              Computer Accessories
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=computer%20components">
              Computer Components
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=laptop">
              Laptop
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=storage%20devices">
              Storage Devices
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=printer%20supplies">
              Printer &amp; Supplies
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=networking">
              Networking
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=speaker">
              Speaker
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=audio%20equipment">
              Audio Equipment
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=camera">
              Camera
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=cctv%20security">
              CCTV &amp; Security
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=drones">
              Drones
            </a>
          </div>
        </div>
        <div className="px-7 w-1/3">
          <h3 className="text-gray-800 text-xl mb-3 font-medium">
            Home &amp; Lifestyle
          </h3>
          <div className="space-y-3">
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=lighting">
              Lighting
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=home%20appliances">
              Home Appliances
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=smart%20home">
              Smart Home
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=personal%20care">
              Personal Care
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=fashion">
              Fashion
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=sports%20outdoors">
              Sports &amp; Outdoors
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=tv">
              TV
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=projector">
              Projector
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=gaming">
              Gaming
            </a>
            <a className="block text-gray-500 text-base transition-colors hover:text-gray-800" href="/product?search=auto%20parts">
              Auto Parts
            </a>
          </div>
        </div>
      </div>

                  <div className="xl:w-1/3">
                    <div className="pl-7 relative">
                      <img
                        className="rounded-lg w-full"
                        alt={menuFeature ? menuFeature.name : ''}
                        src={menuFeature?.image || '/images/logo/menu-image.jpg'}
                      />
                      <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
                        <a className="bg-white py-2.5 px-3.5 rounded-lg hover:bg-gray-100 text-gray-800 border border-gray-300 font-medium text-sm" href="/product">
                          Best Seller
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <a className="text-gray-800 hover:text-violet-500 py-7 px-3.5 text-base font-medium transition-colors" href="/product">
            Sale
            <span className="bg-violet-50 text-violet-700 inline-flex items-center justify-center h-5 rounded-full px-2 py-1 text-xs font-medium z-10 ml-1">
              20% OFF
            </span>
          </a>
        </div>
        <div className="lg:flex items-center hidden">
          <div className="flex items-center gap-5">
            <button onClick={() => router.push('/cart')} title="Shopping cart" aria-label="Open shopping cart" className="flex items-center gap-1.5 text-gray-900 hover:text-black cursor-pointer">
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="19" viewBox="0 0 21 18" fill="none">
                <path d="M0.75 0.75H1.93055C2.67828 0.75 3.31181 1.30068 3.41594 2.04112L3.56788 3.12161M3.56788 3.12161L4.67 10.9589C4.77412 11.6993 5.40766 12.25 6.15538 12.25L15.5169 12.25C16.1139 12.25 16.6541 11.896 16.8923 11.3486L19.5596 5.22023C19.9908 4.2295 19.2648 3.12161 18.1843 3.12161H3.56788Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6.2168 16.25H6.2268M14.7539 16.25H14.7639" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="text-sm font-medium text-gray-700">({cartCount})</span>
            </button>
            <div data-account-menu className="relative">
              <button
                onClick={handleAccountClick}
                title={user ? `Account (${user.name || 'Customer'})` : 'Login / Register'}
                aria-label={user ? 'Open your profile' : 'Login or register'}
                aria-expanded={user ? accountOpen : undefined}
                aria-haspopup={user ? 'menu' : undefined}
                className="flex size-11 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900 cursor-pointer"
              >
                {user?.photo ? (
                  <img src={user.photo} alt={user.name || 'Customer'} className="h-full w-full object-cover" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12ZM12 14C7.58172 14 4 17.5817 4 22H20C20 17.5817 16.4183 14 12 14Z" fill="currentColor" />
                  </svg>
                )}
              </button>
              {user && accountOpen && (
                <div role="menu" className="absolute right-0 top-12 z-50 w-60 border border-gray-200 bg-white py-2 shadow-lg">
                  <div className="border-b border-gray-100 px-4 pb-3 pt-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{user.name || 'Customer'}</p>
                    {user.email && <p className="truncate text-xs text-gray-500">{user.email}</p>}
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountOpen(false);
                      router.push('/profile');
                    }}
                    className="block w-full px-4 py-2.5 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 cursor-pointer"
                  >
                    View Profile
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAccountOpen(false);
                      router.push('/orders');
                    }}
                    className="block w-full px-4 py-2.5 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 cursor-pointer"
                  >
                    Orders
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => void handleLogout()}
                    disabled={loggingOut}
                    className="block w-full px-4 py-2.5 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60 cursor-pointer"
                  >
                    {loggingOut ? 'Logging out...' : 'Logout'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex lg:hidden items-center gap-4">
          <button onClick={() => router.push('/cart')} title="Shopping cart" aria-label="Open shopping cart" className="flex items-center gap-1.5 text-gray-900 hover:text-black cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" width="21" height="18" viewBox="0 0 21 18" fill="none">
              <path d="M0.75 0.75H1.93055C2.67828 0.75 3.31181 1.30068 3.41594 2.04112L3.56788 3.12161M3.56788 3.12161L4.67 10.9589C4.77412 11.6993 5.40766 12.25 6.15538 12.25L15.5169 12.25C16.1139 12.25 16.6541 11.896 16.8923 11.3486L19.5596 5.22023C19.9908 4.2295 19.2648 3.12161 18.1843 3.12161H3.56788Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6.2168 16.25H6.2268M14.7539 16.25H14.7639" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-sm font-medium text-gray-700">({cartCount})</span>
          </button>
          <div data-account-menu className="relative">
            <button
              onClick={handleAccountClick}
              title={user ? `Account (${user.name || 'Customer'})` : 'Login / Register'}
              aria-label={user ? 'Open your profile' : 'Login or register'}
              aria-expanded={user ? accountOpen : undefined}
              aria-haspopup={user ? 'menu' : undefined}
              className="flex size-10 items-center justify-center overflow-hidden rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 hover:text-gray-900 cursor-pointer"
            >
              {user?.photo ? (
                <img src={user.photo} alt={user.name || 'Customer'} className="h-full w-full object-cover" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none">
                  <path d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12ZM12 14C7.58172 14 4 17.5817 4 22H20C20 17.5817 16.4183 14 12 14Z" fill="currentColor" />
                </svg>
              )}
            </button>
            {user && accountOpen && (
              <div role="menu" className="absolute right-0 top-11 z-50 w-60 border border-gray-200 bg-white py-2 shadow-lg">
                <div className="border-b border-gray-100 px-4 pb-3 pt-1">
                  <p className="truncate text-sm font-semibold text-gray-900">{user.name || 'Customer'}</p>
                  {user.email && <p className="truncate text-xs text-gray-500">{user.email}</p>}
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAccountOpen(false);
                    router.push('/profile');
                  }}
                  className="block w-full px-4 py-2.5 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 cursor-pointer"
                >
                  View Profile
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setAccountOpen(false);
                    router.push('/orders');
                  }}
                  className="block w-full px-4 py-2.5 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 cursor-pointer"
                >
                  Orders
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void handleLogout()}
                  disabled={loggingOut}
                  className="block w-full px-4 py-2.5 text-left text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60 cursor-pointer"
                >
                  {loggingOut ? 'Logging out...' : 'Logout'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
     
      {/* Mobile search: full-width rounded input with attached search button. */}
      <div className="mt-3 lg:hidden">
        <div className="flex">
          <input placeholder="Search products.." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} onKeyDown={handleSearchKey} className="h-11 w-full min-w-0 flex-1 rounded-l-lg border border-r-0 border-gray-300 bg-white px-4 text-base text-gray-800 placeholder:text-gray-400 focus:border-violet-300 focus:outline-0 ring-3 ring-transparent focus:ring-violet-500/30" type="text" />
          <button type="button" onClick={submitSearch} aria-label="Search" className="inline-flex h-11 w-14 shrink-0 cursor-pointer items-center justify-center rounded-r-lg bg-black text-white transition hover:bg-gray-800">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M9.4375 2.3125C13.3726 2.3125 16.5634 5.5019 16.5635 9.43652C16.5635 11.1342 15.9681 12.6921 14.9766 13.916L17.4688 16.4082C17.7609 16.7011 17.7604 17.1761 17.4678 17.4688C17.175 17.7612 16.7 17.7612 16.4072 17.4688L13.915 14.9756C12.6911 15.9656 11.1343 16.5605 9.4375 16.5605C5.50258 16.5603 2.3125 13.3711 2.3125 9.43652C2.31258 5.50205 5.50263 2.31273 9.4375 2.3125ZM9.4375 3.8125C6.33077 3.81273 3.81258 6.33076 3.8125 9.43652C3.8125 12.5424 6.33073 15.0603 9.4375 15.0605C12.5445 15.0605 15.0635 12.5425 15.0635 9.43652C15.0634 6.33062 12.5444 3.8125 9.4375 3.8125Z" fill="currentColor" /></svg>
          </button>
        </div>
      </div>
      <div className="border-t border-gray-100 py-2.5 lg:hidden">
        
      </div>
    </div>

      {mobileOpen && (
        <div className="lg:hidden border-t border-gray-100 bg-white">
          <div className="px-4 py-4">
            <div className="relative mb-2">
              <input
                placeholder="Search products.."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleSearchKey}
                className="px-4 py-2.5 pl-10 w-full border focus:border-violet-300 h-11 placeholder:text-gray-400 placeholder:text-base text-gray-800 border-gray-300 rounded-lg focus:outline-0 text-base ring-3 ring-transparent focus:ring-violet-500/30"
                type="text"
              />
              <span onClick={submitSearch} className="absolute top-1/2 left-3 -translate-y-1/2 cursor-pointer">
<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M9.4375 2.3125C13.3726 2.3125 16.5634 5.5019 16.5635 9.43652C16.5635 11.1342 15.9681 12.6921 14.9766 13.916L17.4688 16.4082C17.7609 16.7011 17.7604 17.1761 17.4678 17.4688C17.175 17.7612 16.7 17.7612 16.4072 17.4688L13.915 14.9756C12.6911 15.9656 11.1343 16.5605 9.4375 16.5605C5.50258 16.5603 2.3125 13.3711 2.3125 9.43652C2.31258 5.50205 5.50263 2.31273 9.4375 2.3125ZM9.4375 3.8125C6.33077 3.81273 3.81258 6.33076 3.8125 9.43652C3.8125 12.5424 6.33073 15.0603 9.4375 15.0605C12.5445 15.0605 15.0635 12.5425 15.0635 9.43652C15.0634 6.33062 12.5444 3.8125 9.4375 3.8125Z" fill="#6B7280" />
              </svg>
              </span>
            </div>
            <a className="block py-2.5 text-gray-800 text-base font-medium" href="/">
              Home
            </a>
            <a className="block py-2.5 text-gray-800 text-base font-medium" href="/product">
              Shop
            </a>
            <a className="block py-2.5 text-gray-800 text-base font-medium" href="/product">
              Products
            </a>
            <a className="block py-2.5 text-gray-800 text-base font-medium" href="/product">
              Sale
              <span className="bg-violet-50 text-violet-700 inline-flex items-center justify-center h-5 rounded-full px-2 py-1 text-xs font-medium z-10 ml-1">
                20% OFF
              </span>
            </a>
            {user ? (
              <>
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    router.push('/profile');
                  }}
                  className="block py-2.5 text-gray-800 text-base font-medium cursor-pointer"
                >
                  View Profile
                </button>
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    router.push('/orders');
                  }}
                  className="block py-2.5 text-gray-800 text-base font-medium cursor-pointer"
                >
                  Orders
                </button>
                <button
                  onClick={() => void handleLogout()}
                  disabled={loggingOut}
                  className="block py-2.5 text-gray-800 text-base font-medium disabled:opacity-60 cursor-pointer"
                >
                  {loggingOut ? 'Logging out...' : 'Logout'}
                </button>
              </>
            ) : (
              <button
                onClick={openLogin}
                className="block py-2.5 text-gray-800 text-base font-medium cursor-pointer"
              >
                Login / Register
              </button>
            )}
          </div>
        </div>
      )}
  </nav>
</header>
  );
}
