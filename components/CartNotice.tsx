// Minimal "Added to cart" popup: item thumbnail + name + live item count,
// with a subtle chime played from the store. Mounted globally so it fires
// from any add-to-cart button (product cards, detail page, drawers).
'use client';

import Link from 'next/link';
import { CheckCircle2, X } from 'lucide-react';
import { useStore } from '../lib/store';

export default function CartNotice() {
  const { cartNotice, dismissCartNotice } = useStore();
  if (!cartNotice) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[60] w-[calc(100%-2.5rem)] max-w-sm"
    >
      <div className="flex items-center gap-3 border border-gray-200 bg-white px-4 py-3 shadow-xl">
        {cartNotice.image ? (
          <img
            src={cartNotice.image}
            alt=""
            className="h-12 w-12 shrink-0 bg-gray-50 object-cover"
          />
        ) : (
          <CheckCircle2 size={24} className="shrink-0 text-green-600" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">Added to cart</p>
          <p className="truncate text-sm text-gray-600">{cartNotice.name}</p>
          <p className="text-xs text-gray-500">
            {cartNotice.totalItems} {cartNotice.totalItems === 1 ? 'item' : 'items'} in cart
          </p>
        </div>
        <Link
          href="/cart"
          onClick={dismissCartNotice}
          className="shrink-0 bg-[#111111] px-3 py-2 text-xs font-semibold text-white hover:bg-[#333333]"
        >
          View cart
        </Link>
        <button
          type="button"
          onClick={dismissCartNotice}
          aria-label="Dismiss"
          className="shrink-0 text-gray-400 hover:text-gray-900 cursor-pointer"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
