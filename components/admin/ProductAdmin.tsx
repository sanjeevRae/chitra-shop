'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Product } from '@/data/products';
import MediaPicker from './MediaPicker';

type Props = { token: string };
type Tab = 'list' | 'edit';

const EMPTY_PRODUCT: Product = {
  id: '',
  sku: '',
  brand: '',
  name: '',
  price: 0,
  originalPrice: undefined,
  category: '',
  image: '',
  images: [],
  description: '',
  information: '',
  sizes: [],
  colors: [],
  specifications: [],
  reviews: [],
  rating: 0,
  reviewCount: 0,
  stock: 0,
  tag: undefined,
  linkHref: undefined,
  enabled: undefined,
  featuredOrder: undefined,
  seoTitle: undefined,
  seoDescription: undefined,
  seoKeywords: [],
  ogImage: undefined,
  canonicalPath: undefined,
  cloudinaryAccount: 'products_1',
};

const CACHE_KEY = 'chitra_admin_products_v1';
const CACHE_MAX_AGE_MS = 5 * 60 * 1000;

// Module-level cache persists across component remounts (in-memory, same page session)
let memoryCache: Product[] | null = null;
let memoryCacheTs = 0;

interface ProductCache {
  items: Product[];
  ts: number;
}

function money(value?: number) {
  return `Rs. ${Number(value || 0).toFixed(2)}`;
}

function loadCached(): Product[] | null {
  // Check in-memory cache first (fastest)
  if (memoryCache && Date.now() - memoryCacheTs < CACHE_MAX_AGE_MS) {
    return memoryCache;
  }

  // Fall back to localStorage
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed: ProductCache = JSON.parse(raw);
    if (parsed.items && Array.isArray(parsed.items)) {
      const age = Date.now() - parsed.ts;
      if (age < CACHE_MAX_AGE_MS) {
        // Populate in-memory cache
        memoryCache = parsed.items;
        memoryCacheTs = parsed.ts;
        return parsed.items;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function saveCached(items: Product[]) {
  // Save to in-memory cache (always works)
  memoryCache = items;
  memoryCacheTs = Date.now();

  // Also try localStorage (may fail if quota exceeded)
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ items, ts: Date.now() }));
  } catch (err) {
    console.warn('Could not cache products to localStorage:', err);
  }
}

function clearCached() {
  memoryCache = null;
  memoryCacheTs = 0;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

export default function ProductAdmin({ token }: Props) {
  const [tab, setTab] = useState<Tab>('list');
  const [items, setItems] = useState<Product[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [cloudinaryAccount, setCloudinaryAccount] = useState<'products_1' | 'products_2' | 'general'>('products_1');
  const [form, setForm] = useState<Product>(EMPTY_PRODUCT);
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const perPage = 100;

  const load = useCallback(async (force = false) => {
    if (!force) {
      const cached = loadCached();
      if (cached) {
        setItems(cached);
        setStatus('');
        return;
      }
    }

    setStatus('Loading products...');
    const allItems: Product[] = [];
    let currentPage = 1;
    for (let guard = 0; guard < 50; guard += 1) {
      const response = await fetch(
        `/api/admin?action=products&page=${currentPage}&perPage=${perPage}`,
        { headers: { 'x-admin-token': token } },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.error || 'Could not load products.');
        return;
      }
      const nextItems: Product[] = data.products ?? [];
      allItems.push(...nextItems);
      const totalCount = typeof data.total === 'number' ? data.total : allItems.length;
      const hasMore = data.hasMore === true || (nextItems.length > 0 && allItems.length < totalCount);
      if (!hasMore || nextItems.length === 0) break;
      currentPage += 1;
      setStatus(`Loading products... ${allItems.length} loaded`);
    }

    saveCached(allItems);

    setItems(allItems);
    setStatus('');
  }, [token, perPage]);

  useEffect(() => { void load(false); }, [load]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((product) =>
      [product.id, product.name, product.category, product.description, product.tag]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    );
  }, [items, query]);

  const openEditor = useCallback((product: Product | null) => {
    if (product) {
      setForm({ ...product, cloudinaryAccount: product.cloudinaryAccount ?? 'products_1' });
      setCloudinaryAccount(product.cloudinaryAccount ?? 'products_1');
    } else {
      setForm({ ...EMPTY_PRODUCT, id: '', name: '', cloudinaryAccount: 'products_1' });
      setCloudinaryAccount('products_1');
    }
    setEditing(product);
    setTab('edit');
    setStatus('');
  }, []);

  const closeEditor = useCallback(() => {
    setTab('list');
    setEditing(null);
    setForm(EMPTY_PRODUCT);
    setGalleryImages([]);
    setStatus('');
  }, []);

  const handleInput = useCallback(
    (key: keyof Product, value: unknown) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleCloudinaryAccount = useCallback(
    (value: 'products_1' | 'products_2' | 'general') => {
      setCloudinaryAccount(value);
      setForm((prev) => ({ ...prev, cloudinaryAccount: value }));
    },
    []
  );

  const addGalleryImage = useCallback((url: string) => {
    setGalleryImages((prev) => [...prev, url]);
    setForm((prev) => ({ ...prev, images: [...(prev.images ?? []), url] }));
  }, []);

  const removeGalleryImage = useCallback((url: string) => {
    setGalleryImages((prev) => prev.filter((u) => u !== url));
    setForm((prev) => ({ ...prev, images: (prev.images ?? []).filter((u) => u !== url) }));
  }, []);

  useEffect(() => {
    setGalleryImages(form.images ?? []);
  }, [form.images]);

  const saveProduct = useCallback(async () => {
    if (!form.name?.trim()) {
      setStatus('Product name is required.');
      return;
    }
    setBusy(true);
    setStatus('Saving...');
    try {
      const response = await fetch('/api/admin?action=products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatus(data.error || 'Save failed.');
        setBusy(false);
        return;
      }
      setStatus('Saved.');
      setBusy(false);
      void load(true);
      setTab('list');
      setEditing(null);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Save failed.');
      setBusy(false);
    }
  }, [form, token, load]);

  const deleteProduct = useCallback(async (id: string) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/admin?action=products&id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'x-admin-token': token },
      });
      const data = await response.json();
      if (!response.ok) {
        setStatus(data.error || 'Delete failed.');
        setBusy(false);
        return;
      }
      setBusy(false);
      void load(true);
      if (editing?.id === id) closeEditor();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Delete failed.');
      setBusy(false);
    }
  }, [token, load, editing, closeEditor]);

  return (
    <section className="border border-[#e0dbd4] bg-white shadow-[0_18px_50px_rgba(0,0,0,0.06)]">
      {tab === 'list' && (
        <>
          <div className="border-b border-[#eee8e1] p-5 md:p-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8f1f35]">
                  Product Admin (Inventory)
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">Manage Products</h1>
                <p className="mt-2 text-sm text-[#666]">
                  Create, edit, and delete products. Images upload to Cloudinary
                  (products_1 / products_2 / general).
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => openEditor(null)}
                  className="bg-[#111] px-5 py-2.5 text-sm font-semibold text-white rounded hover:bg-[#333]"
                >
                  + Add Product
                </button>
                <button
                  type="button"
                  onClick={() => { clearCached(); void load(true); }}
                  className="border border-[#ded8d0] px-4 py-2.5 text-sm font-semibold hover:bg-[#faf8f5]"
                >
                  Refresh
                </button>
                <Link
                  href={`/admin?token=${encodeURIComponent(token)}`}
                  className="border border-[#ded8d0] px-4 py-2 text-sm font-semibold hover:border-[#111]"
                >
                  Back to admin
                </Link>
              </div>
            </div>
          </div>

          <div className="p-5 md:p-7">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products by title, ID, category..."
                className="h-11 w-full border border-[#ded8d0] bg-[#fbfaf8] px-4 text-sm outline-none focus:border-[#111] sm:max-w-md"
              />
              <p className="text-sm text-[#666]">{status || `${items.length} products`}</p>
            </div>

            <div className="overflow-x-auto border border-[#eee8e1]">
              <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
                <thead className="bg-[#111] text-white">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Image</th>
                    <th className="px-4 py-3 font-semibold">Title</th>
                    <th className="px-4 py-3 font-semibold">Category</th>
                    <th className="px-4 py-3 font-semibold">Cloudinary</th>
                    <th className="px-4 py-3 font-semibold">Cost</th>
                    <th className="px-4 py-3 font-semibold">Qty</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((product) => {
                    const stock = Number(product.stock || 0);
                    const acct = product.cloudinaryAccount ?? 'general';
                    return (
                      <tr key={product.id} className="border-b border-[#eee8e1] last:border-b-0 hover:bg-[#faf8f5]">
                        <td className="px-4 py-3">
                          {product.image ? (
                            <img src={product.image} alt="" className="h-12 w-12 bg-[#eee9e2] object-cover rounded" />
                          ) : (
                            <span className="flex h-12 w-12 items-center justify-center bg-[#eee9e2] text-[10px] font-semibold uppercase tracking-[0.08em] text-[#777] rounded">
                              No image
                            </span>
                          )}
                        </td>
                        <td className="max-w-[240px] px-4 py-3">
                          <p className="font-semibold text-[#111]">{product.name}</p>
                          <p className="mt-1 text-xs text-[#777]">ID: {product.id}</p>
                          {product.sku && <p className="text-xs text-[#777]">SKU: {product.sku}</p>}
                        </td>
                        <td className="px-4 py-3">{product.category}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs font-bold rounded-full border ${acct === 'products_1' ? 'bg-[#dcfce7] text-[#166534] border-[#86efac]' : acct === 'products_2' ? 'bg-[#dbeafe] text-[#1d4ed8] border-[#93c5fd]' : 'bg-[#fef3c7] text-[#92400e] border-[#fcd34d]'}`}>
                            {acct}
                          </span>
                        </td>
                        <td className="px-4 py-3">{money(product.price)}</td>
                        <td className="px-4 py-3">{stock}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 text-xs font-semibold ${stock > 5 ? 'bg-[#dcfce7] text-[#166534]' : stock > 0 ? 'bg-[#fef3c7] text-[#92400e]' : 'bg-[#fee2e2] text-[#991b1b]'}`}>
                            {stock > 5 ? 'Active' : stock > 0 ? 'Low stock' : 'Out'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => openEditor(product)}
                            className="text-xs font-semibold text-[#111] underline underline-offset-4 hover:text-[#8f1f35] mr-3"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteProduct(product.id)}
                            className="text-xs font-semibold text-[#8f1f35] hover:text-[#991b1b] underline underline-offset-4"
                          >
                            {busy ? 'Deleting\u2026' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-[#777]">
                        No products found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      {tab === 'edit' && (
        <>
          <div className="border-b border-[#eee8e1] p-5 md:p-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8f1f35]">
                  Product Editor
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                  {editing ? 'Edit Product' : 'Add New Product'}
                </h1>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={closeEditor}
                  className="border border-[#ded8d0] px-4 py-2.5 text-sm font-semibold hover:bg-[#faf8f5]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveProduct}
                  disabled={busy}
                  className="bg-[#111] px-5 py-2.5 text-sm font-semibold text-white rounded hover:bg-[#333] disabled:opacity-60"
                >
                  {busy ? 'Saving\u2026' : 'Save Product'}
                </button>
              </div>
            </div>
          </div>

          {status && (
            <div className="p-4 md:p-7 bg-[#fdf2f2] border border-[#fee2e2] text-[#991b1b] text-sm">
              {status}
            </div>
          )}

          <div className="p-5 md:p-7 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="col-span-1 md:col-span-2">
                <label className="block text-sm font-medium mb-1 text-[#333]">Product Name *</label>
                <input
                  value={form.name}
                  onChange={(e) => handleInput('name', e.target.value)}
                  placeholder="e.g. Meta Quest 2 VR Headset"
                  className="w-full h-11 border border-[#ded8d0] bg-[#fbfaf8] px-4 text-sm outline-none focus:border-[#111]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-[#333]">SKU</label>
                <input
                  value={form.sku ?? ''}
                  onChange={(e) => handleInput('sku', e.target.value)}
                  placeholder="e.g. MQ2-001"
                  className="w-full h-11 border border-[#ded8d0] bg-[#fbfaf8] px-4 text-sm outline-none focus:border-[#111]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-[#333]">Brand</label>
                <input
                  value={form.brand ?? ''}
                  onChange={(e) => handleInput('brand', e.target.value)}
                  placeholder="e.g. Meta"
                  className="w-full h-11 border border-[#ded8d0] bg-[#fbfaf8] px-4 text-sm outline-none focus:border-[#111]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-[#333]">Category</label>
                <input
                  value={form.category}
                  onChange={(e) => handleInput('category', e.target.value)}
                  placeholder="e.g. Electronics"
                  className="w-full h-11 border border-[#ded8d0] bg-[#fbfaf8] px-4 text-sm outline-none focus:border-[#111]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-[#333]">Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.price ?? 0}
                  onChange={(e) => handleInput('price', Number(e.target.value) || 0)}
                  className="w-full h-11 border border-[#ded8d0] bg-[#fbfaf8] px-4 text-sm outline-none focus:border-[#111]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-[#333]">Original Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.originalPrice ?? 0}
                  onChange={(e) => handleInput('originalPrice', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="0.00"
                  className="w-full h-11 border border-[#ded8d0] bg-[#fbfaf8] px-4 text-sm outline-none focus:border-[#111]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-[#333]">Stock</label>
                <input
                  type="number"
                  value={form.stock ?? 0}
                  onChange={(e) => handleInput('stock', Number(e.target.value) || 0)}
                  className="w-full h-11 border border-[#ded8d0] bg-[#fbfaf8] px-4 text-sm outline-none focus:border-[#111]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1 text-[#333]">Sizes (comma-separated)</label>
                <input
                  value={form.sizes?.join(', ') ?? ''}
                  onChange={(e) =>
                    handleInput(
                      'sizes',
                      e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                    )
                  }
                  placeholder="XS, S, M, L, XL"
                  className="w-full h-11 border border-[#ded8d0] bg-[#fbfaf8] px-4 text-sm outline-none focus:border-[#111]"
                />
              </div>
              <div className="col-span-1 md:col-span-2">
                <label className="block text-sm font-medium mb-1 text-[#333]">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => handleInput('description', e.target.value)}
                  rows={3}
                  className="w-full h-32 border border-[#ded8d0] bg-[#fbfaf8] px-4 text-sm outline-none focus:border-[#111]"
                />
              </div>

              <div className="col-span-1 md:col-span-2">
                <label className="block text-sm font-medium mb-1 text-[#333]">Information / Details</label>
                <textarea
                  value={form.information ?? ''}
                  onChange={(e) => handleInput('information', e.target.value)}
                  rows={2}
                  className="w-full h-24 border border-[#ded8d0] bg-[#fbfaf8] px-4 text-sm outline-none focus:border-[#111]"
                />
              </div>
            </div>
            <div className="border border-[#e0dbd4] rounded p-4 bg-[#faf8f5]">
              <div className="flex items-center justify-between gap-4 mb-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#8f1f35]">
                    Cloudinary Account
                  </p>
                  <p className="text-sm text-[#666]">Images for this product upload to this account.</p>
                </div>
                <select
                  value={cloudinaryAccount}
                  onChange={(e) => handleCloudinaryAccount(e.target.value as any)}
                  className="border rounded px-3 py-2 bg-white text-sm font-medium">
                  <option value="products_1">products_1 (gntooplg) \u2014 Primary product images</option>
                  <option value="products_2">products_2 (wd55wmrq) \u2014 Secondary product images</option>
                  <option value="general">general (fsyjkhhl) \u2014 Banners / general</option>
                </select>
              </div>

              <div className="grid gap-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-[#333]">Main Image</label>
                  <MediaPicker
                    label="Main product image"
                    value={form.image}
                    folder="products"
                    account={cloudinaryAccount}
                    onChange={(url) => handleInput('image', url)}
                    helper="Uploads to the selected Cloudinary account."
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium text-[#333]">Gallery Images</label>
                  <div className="grid gap-3">
                    {galleryImages.map((url, idx) => (
                      <div key={idx} className="relative group">
                        <img
                          src={url}
                          alt=""
                          className="h-24 w-24 object-cover rounded border border-[#ded8d0]"
                        />
                        <button
                          type="button"
                          onClick={() => removeGalleryImage(url)}
                          className="absolute -top-2 -right-2 bg-[#fee2e2] text-[#991b1b] text-xs font-bold rounded-full p-1 hover:bg-[#991b1b] hover:text-white"
                          aria-label="Remove gallery image"
                        >
                          \u00d7
                        </button>
                      </div>
                    ))}
                    <MediaPicker
                      label="Add gallery image"
                      value=""
                      folder="products/gallery"
                      account={cloudinaryAccount}
                      onChange={addGalleryImage}
                      helper="Additional product images."
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium mb-1 text-[#333]">SEO Title</label>
                <input
                  value={form.seoTitle ?? ''}
                  onChange={(e) => handleInput('seoTitle', e.target.value || undefined)}
                  placeholder="Meta title"
                  className="w-full h-11 border border-[#ded8d0] bg-[#fbfaf8] px-4 text-sm outline-none focus:border-[#111]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-[#333]">SEO Description</label>
                <input
                  value={form.seoDescription ?? ''}
                  onChange={(e) => handleInput('seoDescription', e.target.value || undefined)}
                  placeholder="Meta description"
                  className="w-full h-11 border border-[#ded8d0] bg-[#fbfaf8] px-4 text-sm outline-none focus:border-[#111]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-[#333]">Link Href</label>
                <input
                  value={form.linkHref ?? ''}
                  onChange={(e) => handleInput('linkHref', e.target.value || undefined)}
                  placeholder="/product/xxx"
                  className="w-full h-11 border border-[#ded8d0] bg-[#fbfaf8] px-4 text-sm outline-none focus:border-[#111]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-[#333]">Tag</label>
                <input
                  value={form.tag ?? ''}
                  onChange={(e) => handleInput('tag', e.target.value || undefined)}
                  placeholder="Best Seller, New, etc."
                  className="w-full h-11 border border-[#ded8d0] bg-[#fbfaf8] px-4 text-sm outline-none focus:border-[#111]"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.enabled ?? true}
                onChange={(e) => handleInput('enabled', e.target.checked)}
                className="rounded border-[#ded8d0] text-[#111] focus:ring-[#111]"
              />
              <label className="text-sm font-medium text-[#333]">
                Enabled (visible on storefront)
              </label>
            </div>
          </div>
        </>
      )}
    </section>
  );
}