'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MediaPicker from '@/components/admin/MediaPicker';
import RichTextEditor from '@/components/admin/RichTextEditor';

type CatalogProduct = { id: string; name: string; image: string; price?: number };

const FLASH_SELL_PRODUCT_OPTIONS: CatalogProduct[] = [
  { id: '1', name: 'Meta Quest 2 VR Headset', image: '/images/products/image-1.png' },
  { id: '2', name: 'DJI Mini 3 Pro Drone', image: '/images/products/image-2.png' },
  { id: '3', name: 'Razer DeathAdder Mouse', image: '/images/products/image-3.png' },
  { id: '4', name: 'ASUS ROG Zephyrus 14', image: '/images/products/image-4.png' },
  { id: '5', name: 'iPhone 16', image: '/images/products/image-5.png' },
  { id: '6', name: 'Apple Watch Series 9', image: '/images/products/image-6.png' },
  { id: '7', name: 'Logitech G213 Keyboard', image: '/images/products/image-7.png' },
  { id: '8', name: 'JBL 305P MkII Studio', image: '/images/products/image-8.png' },
];

type Field =
  | { key: string; label: string; type?: 'text' | 'number' | 'textarea' | 'checkbox' | 'image' | 'list' | 'datetime' | 'richtext' }
  | { key: string; label: string; type: 'select'; options: string[] }
  | { key: string; label: string; type: 'product-select'; products: { id: string; name: string; image: string }[] }
  | { key: string; label: string; type: 'hero-slides' };
type Config = { key: string; title: string; eyebrow: string; path: string; idField: string; fields: Field[]; newLabel: string; newBlank: () => Item };
type Item = Record<string, string | number | boolean | string[] | { image?: string; eyebrow?: string; title?: string; subtitle?: string; buttonLabel?: string; buttonHref?: string }[] | undefined>;

type HeroSlide = { image: string; eyebrow: string; title: string; subtitle: string; buttonLabel: string; buttonHref: string };

function parseHeroSlides(value: unknown): HeroSlide[] {
  if (!Array.isArray(value)) return [];
  // NOTE: no blank-filter here. Filtering empty drafts made the "+ Add slide"
  // button look broken (a fresh blank slide vanished on re-render). The admin
  // API and the storefront both drop image-less/title-less slides on save/render.
  return (value as Record<string, unknown>[]).map(slide => ({
    image: String(slide?.image ?? ''),
    eyebrow: String(slide?.eyebrow ?? ''),
    title: String(slide?.title ?? ''),
    subtitle: String(slide?.subtitle ?? ''),
    buttonLabel: String(slide?.buttonLabel ?? ''),
    buttonHref: String(slide?.buttonHref ?? '/product'),
  }));
}

const BLANK_HERO_SLIDE: HeroSlide = { image: '', eyebrow: '', title: '', subtitle: '', buttonLabel: '', buttonHref: '/product' };


function ProductSearchPicker({ value, token, onPick }: { value: string; token: string; onPick: (product: CatalogProduct) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const timer = setTimeout(async () => {
      setSearching(true);
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;
      try {
        const res = await fetch(
          `/api/admin/product-lookup?search=${encodeURIComponent(term)}&limit=12`,
          { headers: { 'x-admin-token': token } },
        );
        const data = await res.json().catch(() => ({}));
        if (requestRef.current !== requestId) return;
        setResults(Array.isArray(data.products) ? data.products : []);
      } catch {
        if (requestRef.current === requestId) setResults([]);
      } finally {
        if (requestRef.current === requestId) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, token]);

  const selected = results.find((item) => item.id === value) ?? null;

  return (
    <div className="relative">
      <input
        placeholder="Type a product ID (e.g. 109i75) — or 2+ characters of the name…"
        value={query}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setOpen(true);
          if (next.trim().length < 2) {
            setResults([]);
            setSearching(false);
          }
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="border border-[#ded8d0] bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-[#111] outline-none transition focus:border-[#111111]"
      />
      {open && query.trim().length >= 2 ? (
        <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto border border-[#ded8d0] bg-white shadow-lg">
          {searching ? (
            <p className="px-3 py-2 text-xs font-normal normal-case text-[#777]">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs font-normal normal-case text-[#777]">No products found for &quot;{query.trim()}&quot;.</p>
          ) : (
            results.map((item) => (
              <button
                key={item.id}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onPick(item);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-[#f7f3ee] ${item.id === value ? 'bg-[#f7f3ee]' : ''}`}
              >
                {item.image ? (
                  <img src={item.image} alt="" className="h-10 w-10 shrink-0 border border-[#ded8d0] bg-white object-contain" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-[#ded8d0] bg-[#f7f3ee] text-xs text-[#999]">
                    No img
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium normal-case text-[#111]">{item.id} — {item.name}</span>
                  <span className="block text-xs font-normal normal-case text-[#777]">{item.name}{typeof item.price === 'number' ? ` · Rs. ${item.price.toLocaleString('en-NP')}` : ''}</span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
      {selected ? (
        <p className="mt-1 text-xs font-normal normal-case tracking-normal text-[#2e7d32]">
          Selected product ID: {selected.id} — {selected.name}
        </p>
      ) : value ? (
        <p className="mt-1 text-xs font-normal normal-case tracking-normal text-[#777]">
          Selected product ID: {value} (type an ID above to search and change it)
        </p>
      ) : null}
    </div>
  );
}

const POLICY_IDS = ['refund-policy', 'terms-of-service', 'shipping-policy'] as const;

const configs: Config[] = [
  { key: 'notice', title: 'Notice Banner', eyebrow: 'Top message', path: 'homepage/noticeBanners/items', idField: 'id', newLabel: 'New item', newBlank: () => defaultNoticeItem(), fields: [
    { key: 'id', label: 'ID' }, { key: 'title', label: 'Title' }, { key: 'message', label: 'Banner message', type: 'textarea' }, { key: 'quote', label: 'Quote / highlight' }, { key: 'countdownTo', label: 'Countdown end time', type: 'datetime' }, { key: 'enabled', label: 'Enabled', type: 'checkbox' },
  ]},
  { key: 'hero', title: 'Hero Banners', eyebrow: 'Homepage hero section', path: 'herobanners', idField: 'id', newLabel: 'New item', newBlank: () => ({ enabled: true, buttonHref: '/product', position: 0 }), fields: [
    { key: 'id', label: 'Slot (pick one)', type: 'select', options: ['hero-main', 'hero-side-1', 'hero-side-2', 'hero-wide'] }, { key: 'eyebrow', label: 'Eyebrow badge (e.g. Just Launched)' }, { key: 'title', label: 'Title' }, { key: 'subtitle', label: 'Subtitle / description', type: 'textarea' }, { key: 'image', label: 'Image', type: 'image' }, { key: 'buttonLabel', label: 'Button label (e.g. Discover Collection)' }, { key: 'buttonHref', label: 'Button link (redirect)' }, { key: 'slides', label: 'Offer slides (hero-main only — auto-scrolls every 3.5s)', type: 'hero-slides' }, { key: 'tone', label: 'Tone (main tile: leave blank; side tiles: bg-indigo-500/10, bg-sky-500/10, bg-blue-500/10)' }, { key: 'position', label: 'Order', type: 'number' }, { key: 'enabled', label: 'Enabled', type: 'checkbox' },

  ]},
  { key: 'featured', title: 'Featured Products', eyebrow: 'Flash Sell shelf', path: 'homepage/featuredProducts/items', idField: 'id', newLabel: 'Add featured product', newBlank: () => ({ enabled: true }), fields: [
    { key: 'productId', label: 'Product (select from catalog)', type: 'product-select', products: FLASH_SELL_PRODUCT_OPTIONS },
  ]},
  { key: 'policies', title: 'Policies', eyebrow: 'Refund / Terms / Shipping pages', path: 'policies', idField: 'id', newLabel: 'New policy', newBlank: () => ({ enabled: true }), fields: [
    { key: 'id', label: 'Policy page', type: 'select', options: [...POLICY_IDS] }, { key: 'title', label: 'Page title' }, { key: 'content', label: 'Content', type: 'richtext' }, { key: 'enabled', label: 'Enabled', type: 'checkbox' },
  ]},
  { key: 'collections', title: 'Collections', eyebrow: 'Hot Deals shelf', path: 'collections', idField: 'id', newLabel: 'Add hot deal', newBlank: () => ({ enabled: true }), fields: [{ key: 'id', label: 'ID' }, { key: 'title', label: 'Title' }, { key: 'badge', label: 'Badge (e.g. 30% OFF)' }, { key: 'image', label: 'Image', type: 'image' }, { key: 'linkHref', label: 'Collection link' }, { key: 'enabled', label: 'Enabled', type: 'checkbox' }] },
  { key: 'categories', title: 'Categories', eyebrow: 'Shopping paths', path: 'categories', idField: 'id', newLabel: 'New item', newBlank: () => ({ enabled: true }), fields: [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }, { key: 'text', label: 'Text' }, { key: 'image', label: 'Image', type: 'image' }, { key: 'enabled', label: 'Enabled', type: 'checkbox' }] },
];

function defaultNoticeItem(): Item {
  return {
    id: 'main-notice',
    title: 'Summer Sale',
    message: 'Get 50% Off This Summer Sale. Grab It Fast!',
    quote: '',
    countdownTo: '',
    enabled: true,
  };
}

function textValue(item: Item, keys: string[], fallback = 'Untitled') {
  const value = keys.map(key => item[key]).find(Boolean);
  return String(value || fallback);
}

function imageValue(item: Item) {
  return String(item.image || item.avatar || '');
}

function dateTimeLocalValue(value: Item[string]) {
  if (!value) return '';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function dateTimeStoredValue(value: string) {
  return value ? new Date(value).toISOString() : '';
}

function HeroSlidesEditor({ slides, folder, onChange }: { slides: HeroSlide[]; folder: string; onChange: (slides: HeroSlide[]) => void }) {
  const update = (index: number, patch: Partial<HeroSlide>) => {
    onChange(slides.map((slide, i) => (i === index ? { ...slide, ...patch } : slide)));
  };
  const remove = (index: number) => onChange(slides.filter((_, i) => i !== index));
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= slides.length) return;
    const next = [...slides];
    const [slide] = next.splice(index, 1);
    if (slide) next.splice(target, 0, slide);
    onChange(next);
  };
  return (
    <div className="grid gap-4">
      
      {slides.map((slide, index) => (
        <div key={index} className="grid gap-3 border border-[#ded8d0] bg-white p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#777]">Slide {index + 1}</span>
            <span className="flex gap-2">
              <button type="button" onClick={() => move(index, -1)} className="border border-[#ded8d0] px-2 py-1 text-xs font-semibold">←</button>
              <button type="button" onClick={() => move(index, 1)} className="border border-[#ded8d0] px-2 py-1 text-xs font-semibold">→</button>
              <button type="button" onClick={() => remove(index)} className="border border-[#8f1f35] px-2 py-1 text-xs font-semibold text-[#8f1f35]">Remove</button>
            </span>
          </div>
          <MediaPicker label={`Slide ${index + 1} image`} value={slide.image} folder={folder} helper="Extra hero-main slide image." onChange={url => update(index, { image: url })} />
          <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#777]">Eyebrow<input value={slide.eyebrow} onChange={event => update(index, { eyebrow: event.target.value })} className="border border-[#ded8d0] bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-[#111] outline-none" /></label>
          <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#777]">Title<input value={slide.title} onChange={event => update(index, { title: event.target.value })} className="border border-[#ded8d0] bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-[#111] outline-none" /></label>
          <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#777]">Subtitle<textarea value={slide.subtitle} onChange={event => update(index, { subtitle: event.target.value })} className="border border-[#ded8d0] bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-[#111] outline-none" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#777]">Button label<input value={slide.buttonLabel} onChange={event => update(index, { buttonLabel: event.target.value })} className="border border-[#ded8d0] bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-[#111] outline-none" /></label>
            <label className="grid gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[#777]">Button link<input value={slide.buttonHref} onChange={event => update(index, { buttonHref: event.target.value })} className="border border-[#ded8d0] bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-[#111] outline-none" /></label>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...slides, { ...BLANK_HERO_SLIDE }])} className="border border-dashed border-[#8f1f35] px-4 py-2.5 text-sm font-semibold text-[#8f1f35] transition hover:bg-[#8f1f35] hover:text-white">+ Add slide</button>
    </div>
  );
}

export default function CmsAdmin({ token, initialSection }: { token: string; initialSection?: string }) {
  const [activeKey, setActiveKey] = useState(() =>
    initialSection && configs.some(item => item.key === initialSection) ? initialSection : configs[0].key,
  );
  const config = useMemo(() => configs.find(item => item.key === activeKey) ?? configs[0], [activeKey]);
  const [items, setItems] = useState<Item[]>([]);
  const [form, setForm] = useState<Item>(defaultNoticeItem());
  const [status, setStatus] = useState('');
  // productOptions is only a fallback safety net now — the featured picker
  // searches the live catalog on demand (ProductSearchPicker) and hydrates
  // the selected product below, so the admin never downloads the catalog.

  const load = useCallback(async () => {
    // token='' until the admin page hydrates it from localStorage — skip the
    // pre-hydration call so we don't fire a guaranteed 401 on first paint.
    if (!token) {
      setStatus('Enter your admin token above to load content.');
      return;
    }
    setStatus('Loading current content...');
    const res = await fetch(`/api/admin?action=cms&path=${encodeURIComponent(config.path)}`, { headers: { 'x-admin-token': token } });
    const data = await res.json();
    const nextItems = data.items ?? [];
    setItems(nextItems);
    if (config.key === 'notice' && nextItems.length === 0) setForm(defaultNoticeItem());
    setStatus(res.ok ? '' : data.error || 'Could not load content.');
  }, [config.key, config.path, token]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- copied: resets draft when CMS section changes, then reloads
  useEffect(() => { setForm(config.newBlank()); void load(); }, [config, load]);

  const save = async () => {
    const id = String(form[config.idField] || '').trim();
    if (!id) { setStatus('ID required.'); return; }
    setStatus('Saving changes...');
    const res = await fetch('/api/admin?action=cms', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-admin-token': token }, body: JSON.stringify({ path: config.path, id, data: form }) });
    const data = await res.json().catch(() => ({}));
    setStatus(res.ok ? (data.warning ? `Saved. Note: ${data.warning}` : 'Saved. Preview and storefront will update from Supabase.') : data.error || 'Save failed.');
    if (res.ok) await load();
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this content item?')) return;
    setStatus('Deleting...');
    const res = await fetch(`/api/admin?action=cms&path=${encodeURIComponent(config.path)}&id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: { 'x-admin-token': token } });
    const data = await res.json().catch(() => ({}));
    setStatus(res.ok ? 'Deleted.' : data.error || 'Delete failed.');
    if (res.ok) await load();
  };

  const previewImage = imageValue(form);
  const selectedId = String(form[config.idField] || '');

  return (
    <section className="border border-[#e0dbd4] bg-white shadow-[0_18px_50px_rgba(0,0,0,0.06)]">
      <div className="border-b border-[#eee8e1] p-5 md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8f1f35]">Homepage CMS</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Edit live storefront sections</h2>
            <p className="mt-2 text-sm text-[#666666]">Select a section, edit content, preview it, then save to Supabase Postgres.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {configs.map(item => (
              <button key={item.key} onClick={() => setActiveKey(item.key)} className={`px-4 py-2 text-sm font-medium transition ${item.key === activeKey ? 'bg-[#111111] text-white' : 'border border-[#ded8d0] bg-[#faf8f5] text-[#333333] hover:border-[#111111]'}`}>
                {item.title}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[360px_minmax(0,1fr)_360px]">
        <aside className="border-b border-[#eee8e1] p-5 md:p-6 xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8f1f35]">{config.eyebrow}</p>
              <h3 className="mt-1 text-xl font-semibold">Current {config.title}</h3>
            </div>
            <span className="bg-[#f1ede7] px-3 py-1 text-xs font-semibold text-[#666]">{items.length}</span>
          </div>
          <div className="mt-5 grid max-h-[620px] gap-3 overflow-auto pr-1">
            {items.length === 0 && <p className="border border-dashed border-[#d8d2ca] p-5 text-sm text-[#777]">No saved items yet. A draft is ready in the editor.</p>}
            {items.map(item => {
              const id = String(item.id);
              const itemImage = imageValue(item);
              return (
                <button key={id} onClick={() => setForm(item)} className={`flex items-center gap-3 border p-3 text-left transition ${selectedId === id ? 'border-[#111111] bg-[#f8f5f0]' : 'border-[#ebe6df] hover:border-[#c8beb4]'}`}>
                  {config.key === 'notice' ? (
                    <span className="flex h-16 w-16 items-center justify-center bg-[#111] text-xs font-semibold text-white">Notice</span>
                  ) : itemImage ? (
                    <img src={itemImage} alt="" className="h-16 w-16 bg-[#eee9e2] object-cover" />
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center bg-[#eee9e2] text-xs font-semibold text-[#777]">No image</span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{textValue(item, ['title', 'name', 'id'])}</span>
                    <span className="mt-1 block truncate text-xs text-[#777]">{id}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="border-b border-[#eee8e1] p-5 md:p-6 xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-semibold">Editor</h3>
            <button onClick={() => setForm(config.newBlank())} className="border border-[#ded8d0] px-4 py-2 text-sm font-medium hover:border-[#111]">{config.newLabel}</button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {config.fields
              .filter(field =>
                (field.type !== 'hero-slides' || selectedId === 'hero-main') &&
                (field.key !== 'tone' || selectedId !== 'hero-main'),
              )
              .map(field => (
              <label key={field.key} className={`${field.type === 'textarea' || field.type === 'richtext' || field.type === 'image' || field.type === 'hero-slides' ? 'md:col-span-2' : ''} grid gap-2 text-sm font-medium text-[#333]`}>
                {field.label}
                {field.type === 'richtext' ? (
                  <RichTextEditor value={String(form[field.key] ?? '')} onChange={html => setForm({ ...form, [field.key]: html })} />
                ) : field.type === 'textarea' ? (
                  <textarea value={String(form[field.key] ?? '')} onChange={event => setForm({ ...form, [field.key]: event.target.value })} className="min-h-28 border border-[#ded8d0] bg-[#fbfaf8] px-3 py-2 text-sm font-normal outline-none transition focus:border-[#111111]" />
                ) : field.type === 'checkbox' ? (
                  <span className="flex items-center gap-3 border border-[#ded8d0] bg-[#fbfaf8] px-3 py-2 font-normal">
                    <input type="checkbox" checked={Boolean(form[field.key])} onChange={event => setForm({ ...form, [field.key]: event.target.checked })} />
                    Visible on storefront
                  </span>
                ) : field.type === 'datetime' ? (
                  <input type="datetime-local" value={dateTimeLocalValue(form[field.key])} onChange={event => setForm({ ...form, [field.key]: dateTimeStoredValue(event.target.value) })} className="h-10 border border-[#ded8d0] bg-[#fbfaf8] px-3 py-2 text-sm font-normal outline-none transition focus:border-[#111111]" />
                ) : field.type === 'select' && 'options' in field ? (
                  <select value={String(form[field.key] ?? '')} onChange={event => setForm({ ...form, [field.key]: event.target.value })} className="h-10 border border-[#ded8d0] bg-[#fbfaf8] px-3 py-2 text-sm font-normal outline-none transition focus:border-[#111111]">
                    <option value="">Select a slot...</option>
                    {field.options.map(option => <option key={option} value={option}>{option}</option>)}
                  </select>
                ) : field.type === 'hero-slides' ? (
                  <HeroSlidesEditor
                    slides={parseHeroSlides(form[field.key])}
                    folder={`chitratech-shop/${config.key}`}
                    onChange={slides => setForm(current => ({ ...current, [field.key]: slides }))}
                  />
                ) : field.type === 'product-select' ? ( <ProductSearchPicker value={String(form[field.key] ?? '')} token={token} onPick={(product) => { if (config.key === 'featured') { setForm({ ...form, [field.key]: product.id, id: product.id, name: product.name ?? '', image: product.image ?? '', price: typeof product.price === 'number' ? product.price : form.price, linkHref: product.id ? `/product/${product.id}` : '', enabled: true }); } else { setForm({ ...form, [field.key]: product.id }); } }} /> ) : field.type === 'list' ? (
                  <input type="text" value={Array.isArray(form[field.key]) ? (form[field.key] as string[]).join(', ') : String(form[field.key] ?? '')} onChange={event => setForm({ ...form, [field.key]: event.target.value.split(',').map(item => item.trim()).filter(Boolean) })} className="border border-[#ded8d0] bg-[#fbfaf8] px-3 py-2 text-sm font-normal outline-none transition focus:border-[#111111]" />
                ) : (
                  <input type={field.type === 'number' ? 'number' : 'text'} value={String(form[field.key] ?? '')} onChange={event => setForm({ ...form, [field.key]: field.type === 'number' ? Number(event.target.value) : event.target.value })} className="border border-[#ded8d0] bg-[#fbfaf8] px-3 py-2 text-sm font-normal outline-none transition focus:border-[#111111]" />
                )}
                {field.type === 'image' && (
                  <MediaPicker
                    label={`${field.label} picker`}
                    value={String(form[field.key] || '')}
                    folder={`chitratech-shop/${config.key}`}
                    helper="Drag an image here, upload from device, or paste a URL."
                    onChange={url => setForm(current => ({ ...current, [field.key]: url }))}
                  />
                )}
              </label>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button onClick={save} className="bg-[#111111] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#8f1f35]">Save changes</button>
            {selectedId && <button onClick={() => void remove(selectedId)} className="border border-[#8f1f35] px-5 py-2.5 text-sm font-semibold text-[#8f1f35] transition hover:bg-[#8f1f35] hover:text-white">Delete</button>}
            <p className="text-sm text-[#666]">{status}</p>
          </div>
        </div>

        <aside className="bg-[#f7f3ee] p-5 md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#8f1f35]">Live preview</p>
          <h3 className="mt-1 text-xl font-semibold">Current draft</h3>
          <div className="mt-5 overflow-hidden border border-[#ded8d0] bg-white">
            {config.key === 'notice' ? (
              <div className="bg-[#111] p-5 text-white">
                <p className="text-xs uppercase tracking-[0.18em] text-white/55">{textValue(form, ['title'], 'Notice')}</p>
                <p className="mt-3 text-lg font-semibold">{textValue(form, ['message'], 'Notice message appears here.')}</p>
                {form.quote ? <p className="mt-2 text-sm italic text-white/75">&quot;{String(form.quote)}&quot;</p> : null}
                {form.countdownTo ? <p className="mt-3 text-xs text-white/65">Countdown ends: {dateTimeLocalValue(form.countdownTo)}</p> : null}
              </div>
            ) : (
              <div className="relative aspect-[4/3] bg-[#e8e2db]">
                {previewImage ? <img src={previewImage} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-sm text-[#777]">Image preview</div>}
                {config.key === 'hero' && <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-5 text-white"><p className="text-2xl font-semibold leading-tight">{textValue(form, ['title'], 'Hero title')}</p><p className="mt-2 line-clamp-2 text-sm text-white/80">{textValue(form, ['subtitle', 'description'], 'Hero description appears here.')}</p></div>}
                {config.key === 'hero' && selectedId === 'hero-main' && parseHeroSlides(form.slides).filter(slide => slide.image || slide.title).length > 0 ? <span className="absolute right-3 top-3 z-10 rounded-full bg-black/60 px-2.5 py-1 text-xs text-white">{parseHeroSlides(form.slides).filter(slide => slide.image || slide.title).length + 1} slides auto-rotate</span> : null}
              </div>
            )}
            {config.key !== 'hero' && config.key !== 'notice' && (
              <div className="p-5">
                <p className="text-lg font-semibold">{textValue(form, ['title', 'name'], `${config.title} title`)}</p>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-[#666]">{textValue(form, ['description', 'text'], 'Short content preview appears here.')}</p>
              </div>
            )}
            <div className="border-t border-[#eee8e1] p-4 text-xs text-[#777]">
              <p>ID: {selectedId || 'new item'}</p>
              <p className="mt-1">Collection: {config.path}</p>
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
