'use client';

import { useEffect } from 'react';
import { useStore } from '../lib/store';
import { getProduct } from '../lib/products';

export default function WishlistDrawer() {
  const {
    wishlist,
    wishOpen,
    setWishOpen,
    toggleWishlist,
    addToCart,
    setCartOpen,
  } = useStore();

  useEffect(() => {
    if (!wishOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [wishOpen]);

  if (!wishOpen) return null;

  const close = () => setWishOpen(false);

  const items = wishlist
    .map((id) => getProduct(id))
    .filter((p): p is NonNullable<typeof p> => p !== undefined);

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/50 cursor-pointer"
        onClick={close}
        aria-hidden="true"
      />
      <aside className="absolute right-0 top-0 max-w-md w-full h-full bg-white flex flex-col shadow-xl">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-xl font-semibold text-gray-800">
            Wishlist ({wishlist.length})
          </h2>
          <button
            onClick={close}
            aria-label="Close wishlist"
            className="text-gray-500 hover:text-gray-900 cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
            >
              <path
                d="M6 6L18 18M18 6L6 18"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex-1 flex items-center justify-center px-6">
            <p className="text-gray-500 text-base">Your wishlist is empty.</p>
          </div>
        ) : (
          <ul className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
            {items.map((product) => (
              <li key={product.id} className="flex gap-4">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-20 h-20 object-cover rounded"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-gray-800 text-base font-medium truncate">
                      {product.name}
                    </p>
                    <button
                      onClick={() => toggleWishlist(product.id)}
                      aria-label="Remove from wishlist"
                      className="text-gray-400 hover:text-red-600 shrink-0 cursor-pointer"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <path
                          d="M6 6L18 18M18 6L6 18"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </div>
                  <p className="text-gray-500 text-sm mt-1">{product.priceStr}</p>
                  <button
                    onClick={() => {
                      addToCart(product.id);
                      toggleWishlist(product.id);
                      close();
                      setCartOpen(true);
                    }}
                    className="mt-3 inline-flex justify-center items-center bg-violet-500 hover:bg-violet-600 transition text-white font-medium rounded-lg py-2 px-4 text-sm cursor-pointer"
                  >
                    Add to cart
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
