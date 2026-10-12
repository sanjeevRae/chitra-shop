'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '../lib/store';
import { getProduct } from '../lib/products';

export default function CartDrawer() {
  const router = useRouter();
  const {
    cart,
    cartOpen,
    setCartOpen,
    setQty,
    removeFromCart,
    cartCount,
    cartSubtotal,
  } = useStore();

  useEffect(() => {
    if (!cartOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [cartOpen]);

  if (!cartOpen) return null;

  const close = () => setCartOpen(false);

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
            Shopping Cart ({cartCount})
          </h2>
          <button
            onClick={close}
            aria-label="Close cart"
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

        {cart.length === 0 ? (
          <div className="flex-1 flex items-center justify-center px-6">
            <p className="text-gray-500 text-base">Your cart is empty.</p>
          </div>
        ) : (
          <>
            <ul className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {cart.map((line) => {
                const product = getProduct(line.id);
                if (!product) return null;
                return (
                  <li key={line.id} className="flex gap-4">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="w-20 h-20 object-cover rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-800 text-base font-medium truncate">
                        {product.name}
                      </p>
                      <p className="text-gray-500 text-sm mt-1">
                        {product.priceStr}
                      </p>
                      <div className="flex items-center justify-between mt-3">
                        <div className="inline-flex items-center border border-gray-200 rounded-lg">
                          <button
                            onClick={() => setQty(line.id, line.qty - 1)}
                            aria-label="Decrease quantity"
                            className="w-8 h-8 inline-flex items-center justify-center text-gray-600 hover:text-gray-900 cursor-pointer"
                          >
                            −
                          </button>
                          <span className="w-8 text-center text-gray-800 text-sm font-medium">
                            {line.qty}
                          </span>
                          <button
                            onClick={() => setQty(line.id, line.qty + 1)}
                            aria-label="Increase quantity"
                            className="w-8 h-8 inline-flex items-center justify-center text-gray-600 hover:text-gray-900 cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                        <button
                          onClick={() => removeFromCart(line.id)}
                          className="text-gray-400 hover:text-red-600 text-sm font-medium cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-gray-100 px-6 py-5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-gray-500 text-base">Subtotal</span>
                <span className="text-gray-800 text-lg font-semibold">
                  ${cartSubtotal.toFixed(2)}
                </span>
              </div>
              <button
                onClick={() => {
                  close();
                  router.push('/cart');
                }}
                className="w-full inline-flex justify-center items-center bg-violet-500 hover:bg-violet-600 transition text-white font-medium rounded-lg py-3 px-4 text-base cursor-pointer"
              >
                Checkout
              </button>
              <button
                onClick={close}
                className="w-full mt-2 inline-flex justify-center items-center text-gray-700 hover:text-gray-900 font-medium rounded-lg py-3 px-4 text-base cursor-pointer"
              >
                Continue shopping
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
