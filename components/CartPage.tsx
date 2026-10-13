'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { MapPin, Minus, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useStore } from '../lib/store';
import { useCustomerAuth } from '../lib/customer-context';
import { getProduct } from '../lib/products';
import { PIXEL_CURRENCY, trackMetaEvent } from '../lib/meta-pixel';
import { firePendingPurchase, rememberPurchase } from '../lib/meta-purchase';

// Full-page cart + COD checkout, ported from SAUD views/Cart.tsx onto
// Chitra's own plumbing: useStore cart lines (localStorage), the session-
// authenticated /api/customer?action=checkout API, and Rs. pricing (no decimals).

type DeliveryOption = {
  id: string;
  label: string;
  detail: string;
  fee: number;
  eta: string;
  unavailable?: boolean;
};

const deliveryOptions: DeliveryOption[] = [
  { id: 'standard', label: 'Standard delivery', detail: 'Doorstep delivery for regular orders.', fee: 100, eta: '3-7 working days' },
  { id: 'priority', label: 'Priority delivery', detail: 'Not available right now.', fee: 0, eta: '1-2 working days', unavailable: true },
];

const VOUCHER_CODE = 'CHITRA10';
const VOUCHER_RATE = 0.1;

type PlacedOrder = {
  id: string;
  items?: { id?: string; name?: string; price?: number; image?: string; quantity?: number }[];
  subtotal?: number;
  discount?: number;
  deliveryFee?: number;
  total?: number;
  status?: string;
};

function money(value?: number) {
  const rounded = Math.round(Number(value || 0));
  return `Rs. ${rounded.toLocaleString('en-NP')}`;
}

export default function CartPage() {
  const {
    cart,
    cartSubtotal,
    setQty,
    removeFromCart,
    clearCart,
    cartProducts,
    cartProductsLoading,
  } = useStore();
  const { user, openLogin, authHeaders } = useCustomerAuth();
  const [step, setStep] = useState<'cart' | 'checkout'>('cart');
  const [voucherCode, setVoucherCode] = useState('');
  const [appliedVoucher, setAppliedVoucher] = useState('');
  const [selectedDelivery, setSelectedDelivery] = useState(deliveryOptions[0].id);
  const [shippingAddress, setShippingAddress] = useState({
    fullName: '',
    phone: '',
    email: '',
    city: '',
    area: '',
    address: '',
    landmark: '',
  });
  const [formError, setFormError] = useState('');
  const [checkoutStatus, setCheckoutStatus] = useState('');
  const [placedOrder, setPlacedOrder] = useState<PlacedOrder | null>(null);
  // Meta InitiateCheckout once-guard: stepping back to the cart and clicking
  // through again must not re-count the same initiation. Keyed by cart
  // composition so a genuinely changed cart still records a new initiation.
  const initiatedSigRef = useRef<string>('');

  // Prefill the address from the account once it loads (or becomes available).
  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time prefill from the loaded account (SAUD parity)
    setShippingAddress((current) => ({
      fullName: current.fullName || user.name || '',
      phone: current.phone || user.phone || '',
      email: current.email || user.email || '',
      city: current.city || user.city || '',
      area: current.area || user.area || '',
      address: current.address || user.address || '',
      landmark: current.landmark || user.landmark || '',
    }));
  }, [user]);

  const totalItems = useMemo(() => cart.reduce((sum, line) => sum + line.qty, 0), [cart]);
  const delivery = deliveryOptions.find((option) => option.id === selectedDelivery) ?? deliveryOptions[0];

  // DB-hydrated line data first (real name/price/image), static catalog as a
  // secondary source for local-only demo ids. Never the Meta Quest placeholder
  // for unknown ids — those return null and render a loading/unavailable row.
  const resolveProduct = (id: string | number) =>
    cartProducts[String(id)] ?? getProduct(id) ?? null;
  const discount = useMemo(
    () =>
      appliedVoucher.trim().toUpperCase() === VOUCHER_CODE
        ? Math.round(cartSubtotal * VOUCHER_RATE * 100) / 100
        : 0,
    [cartSubtotal, appliedVoucher],
  );
  const total = Math.max(0, cartSubtotal - discount + delivery.fee);

  const updateAddress = (field: keyof typeof shippingAddress, value: string) => {
    setShippingAddress((current) => ({ ...current, [field]: value }));
  };

  const proceedToCheckout = () => {
    setFormError('');
    // Persisted orders require an account (orders are keyed by customer id).
    if (!user) {
      openLogin();
      setFormError('Please log in or create an account to check out.');
      return;
    }
    if (!cart.length) return;
    // Meta InitiateCheckout: validation above passed, so the customer is
    // genuinely beginning checkout (never on a failed attempt). Every line
    // must resolve to a real product — an unresolved line means cart pricing
    // is still hydrating, so hold the event rather than send value 0.
    const contents = cart.flatMap((line) => {
      const product = resolveProduct(line.id);
      if (!product) return [];
      const itemPrice = Number(product.price ?? 0) || 0;
      if (itemPrice <= 0) return [];
      return [{ id: String(line.id), quantity: line.qty, item_price: itemPrice }];
    });
    if (contents.length !== cart.length) return;
    if (contents.length > 0) {
      // Once per distinct cart composition (also prevents queueing a duplicate
      // while the pixel is still loading — the queue itself has no dedupe).
      const signature = contents.map((item) => `${item.id}x${item.quantity}`).join('|');
      if (initiatedSigRef.current !== signature) {
        initiatedSigRef.current = signature;
        trackMetaEvent('InitiateCheckout', {
          content_ids: contents.map((item) => item.id),
          content_type: 'product',
          contents,
          num_items: totalItems,
          value: Math.round(cartSubtotal * 100) / 100,
          currency: PIXEL_CURRENCY,
        });
      }
    }
    setStep('checkout');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const placeOrder = async () => {
    setFormError('');
    const requiredFields: Array<keyof typeof shippingAddress> = ['fullName', 'phone', 'city', 'area', 'address'];
    if (requiredFields.some((field) => !shippingAddress[field].trim())) {
      setFormError('Fill in name, phone, city, area, and address.');
      return;
    }
    if (!user) {
      openLogin();
      setFormError('Please log in or create an account to place your order.');
      return;
    }
    setCheckoutStatus('Placing your order...');
    try {
      const items = cart.flatMap((line) => {
        const product = resolveProduct(line.id);
        if (!product) return [];
        return [
          {
            id: String(line.id),
            name: product.name,
            price: product.price,
            image: product.image,
            quantity: line.qty,
          },
        ];
      });
      if (!items.length) {
        setFormError('Your cart items are still loading. Please try again.');
        return;
      }
      const response = await fetch('/api/customer?action=checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          items,
          subtotal: cartSubtotal,
          discount,
          deliveryFee: delivery.fee,
          deliveryLabel: delivery.label,
          shippingAddress,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFormError(data.error || 'Could not place your order. Please try again.');
        return;
      }
      // Backend confirmed the order: record COD payment info, then fire
      // Purchase for the inline order confirmation (deduped by order id, so a
      // later visit to /thank-you never double-counts the same order).
      const confirmed = (data.order ?? {}) as {
        id?: unknown;
        total?: unknown;
        items?: { id?: unknown; price?: unknown; quantity?: unknown }[];
      };
      const orderId = String(confirmed.id ?? '');
      const orderTotal = Number(confirmed.total ?? 0) || 0;
      const purchaseContents = (Array.isArray(confirmed.items) ? confirmed.items : []).map((item) => ({
        id: String(item.id ?? ''),
        quantity: Math.max(1, Math.floor(Number(item.quantity ?? 1)) || 1),
        item_price: Number(item.price ?? 0) || 0,
      }));
      if (orderId) {
        trackMetaEvent('AddPaymentInfo', {
          content_ids: purchaseContents.map((item) => item.id),
          content_type: 'product',
          contents: purchaseContents,
          num_items: purchaseContents.reduce((sum, item) => sum + item.quantity, 0),
          value: orderTotal,
          currency: PIXEL_CURRENCY,
          payment_type: 'Cash on Delivery',
        });
        rememberPurchase({
          orderId,
          total: orderTotal,
          contents: purchaseContents,
          numItems: purchaseContents.reduce((sum, item) => sum + item.quantity, 0),
        });
        void firePendingPurchase();
      }
      setPlacedOrder(data.order as PlacedOrder);
      setStep('cart');
      clearCart();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setFormError('Could not place your order. Please try again.');
    } finally {
      setCheckoutStatus('');
    }
  };

  return (
    <main className="min-h-screen bg-[#f4f4f4] text-[#111111]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#666]">Shopping cart</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              {step === 'cart' ? 'Review your cart' : 'Checkout'}
            </h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/profile"
              className="inline-flex border border-[#111] px-4 py-2 text-sm font-semibold text-[#111] transition hover:bg-[#111] hover:text-white"
            >
              Check your order status
            </Link>
            <Link href="/product" className="inline-flex px-1 py-2 text-sm font-semibold underline underline-offset-4">
              Continue shopping
            </Link>
          </div>
        </div>

        {placedOrder ? (
          <div className="grid gap-6 lg:grid-cols-[1fr_390px]">
            <section className="bg-white p-5 shadow-sm sm:p-6">
              <div className="border-b border-[#ededed] pb-5">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#111111]">Order placed</p>
                <h2 className="mt-2 text-2xl font-semibold">Your order is being processed</h2>
                <p className="mt-2 text-sm text-[#666]">
                  Order ID: <span className="font-semibold text-[#111]">{placedOrder.id}</span>
                </p>
              </div>
              <div className="mt-5 grid gap-3">
                {(placedOrder.items ?? []).map((item) => (
                  <div
                    key={`${placedOrder.id}-${item.id}`}
                    className="grid gap-4 border border-[#ededed] p-3 sm:grid-cols-[72px_1fr_auto] sm:items-center"
                  >
                    {item.image ? (
                      <img src={item.image} alt={item.name || 'Product'} className="h-[72px] w-[72px] bg-[#f3f3f3] object-cover" />
                    ) : (
                      <span className="h-[72px] w-[72px] bg-[#f3f3f3]" />
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold">{item.name || 'Product'}</p>
                    </div>
                    <p className="text-sm font-semibold">
                      Qty {item.quantity || 0} / {money(item.price)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
            <aside className="h-fit bg-white p-5 shadow-sm sm:p-6">
              <h2 className="text-xl font-semibold">Order status</h2>
              <span className="mt-4 inline-flex bg-[#111] px-3 py-1.5 text-xs font-semibold text-white">
                {placedOrder.status === 'pending_cod' ? 'Pending COD' : placedOrder.status || 'Pending'}
              </span>
              <div className="mt-5 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-[#666]">Subtotal</span>
                  <span>{money(placedOrder.subtotal)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#666]">Discount</span>
                  <span>- {money(placedOrder.discount)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#666]">Delivery</span>
                  <span>{money(placedOrder.deliveryFee)}</span>
                </div>
                <div className="border-t border-[#ededed] pt-3 text-lg font-semibold">
                  <div className="flex justify-between gap-4">
                    <span>Total</span>
                    <span>{money(placedOrder.total)}</span>
                  </div>
                </div>
              </div>
              <div className="mt-6 grid gap-3">
                <Link href="/profile" className="inline-flex justify-center bg-[#111] px-5 py-3 text-sm font-semibold text-white">
                  Track or edit order
                </Link>
                <button onClick={() => setPlacedOrder(null)} className="border border-[#dedede] px-5 py-3 text-sm font-semibold cursor-pointer">
                  Continue shopping
                </button>
              </div>
            </aside>
          </div>
        ) : cart.length === 0 ? (
          <div className="bg-white px-6 py-16 text-center shadow-sm">
            <h2 className="text-xl font-semibold">Your cart is empty</h2>
            <p className="mt-2 text-sm text-[#666]">Add products before checkout.</p>
            <Link href="/product" className="mt-6 inline-flex rounded-full bg-[#111] px-6 py-3 text-sm font-semibold text-white">
              Shop products
            </Link>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_390px]">
            <section className="space-y-4">
              {step === 'checkout' && (
                <div className="bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex items-center justify-between gap-4 border-b border-[#ededed] pb-4">
                    <h2 className="text-lg font-semibold">Shipping Address</h2>
                    <button onClick={() => setStep('cart')} className="text-sm font-semibold underline underline-offset-4 cursor-pointer">
                      Edit cart
                    </button>
                  </div>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <input value={shippingAddress.fullName} onChange={(event) => updateAddress('fullName', event.target.value)} placeholder="Full name" className="h-12 border border-[#dedede] px-4 text-sm outline-none focus:border-[#111]" />
                    <input value={shippingAddress.phone} onChange={(event) => updateAddress('phone', event.target.value)} placeholder="Phone number" className="h-12 border border-[#dedede] px-4 text-sm outline-none focus:border-[#111]" />
                    <input value={shippingAddress.email} onChange={(event) => updateAddress('email', event.target.value)} placeholder="Email address" className="h-12 border border-[#dedede] px-4 text-sm outline-none focus:border-[#111]" />
                    <input value={shippingAddress.city} onChange={(event) => updateAddress('city', event.target.value)} placeholder="City" className="h-12 border border-[#dedede] px-4 text-sm outline-none focus:border-[#111]" />
                    <input value={shippingAddress.area} onChange={(event) => updateAddress('area', event.target.value)} placeholder="Area / locality" className="h-12 border border-[#dedede] px-4 text-sm outline-none focus:border-[#111]" />
                    <input value={shippingAddress.landmark} onChange={(event) => updateAddress('landmark', event.target.value)} placeholder="Landmark optional" className="h-12 border border-[#dedede] px-4 text-sm outline-none focus:border-[#111]" />
                    <textarea value={shippingAddress.address} onChange={(event) => updateAddress('address', event.target.value)} placeholder="Full delivery address" className="min-h-24 border border-[#dedede] px-4 py-3 text-sm outline-none focus:border-[#111] sm:col-span-2" />
                  </div>
                </div>
              )}
              {step === 'checkout' && (
                <div className="bg-white p-5 shadow-sm sm:p-6">
                  <h2 className="text-lg font-semibold">Delivery Method</h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    {deliveryOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        disabled={option.unavailable === true}
                        onClick={() => setSelectedDelivery(option.id)}
                        aria-disabled={option.unavailable === true}
                        className={`min-h-36 border p-4 text-left transition ${
                          option.unavailable
                            ? 'cursor-not-allowed border-[#dedede] bg-[#f5f5f5] opacity-70'
                            : selectedDelivery === option.id
                              ? 'border-[#111] bg-[#fafafa] cursor-pointer'
                              : 'border-[#dedede] bg-white hover:border-[#999] cursor-pointer'
                        }`}
                      >
                        <span className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold">{option.label}</span>
                          <span className="text-sm font-semibold">
                            {option.unavailable ? 'Not available' : money(option.fee)}
                          </span>
                        </span>
                        <span className="mt-3 block text-xs leading-5 text-[#666]">{option.detail}</span>
                        <span className="mt-3 block text-xs font-semibold text-[#111]">{option.eta}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="bg-white shadow-sm">
                <div className="flex items-center justify-between border-b border-[#ededed] px-5 py-4 sm:px-6">
                  <p className="text-sm font-semibold">Items ({totalItems})</p>
                  <p className="text-sm text-[#666]">Cash on Delivery available</p>
                </div>
                {cart.map((line) => {
                  const key = String(line.id);
                  const product = resolveProduct(line.id);
                  if (!product) {
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-4 border-b border-[#ededed] px-5 py-5 last:border-b-0 sm:px-6"
                      >
                        <p className="text-sm text-[#666]">
                          {cartProductsLoading ? 'Loading product…' : 'Product unavailable'}
                        </p>
                        <button
                          onClick={() => removeFromCart(line.id)}
                          className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8f1f35] cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  }
                  const badge: string =
                    'badge' in product && typeof product.badge === 'string' ? product.badge : '';
                  return (
                    <div
                      key={key}
                      className="grid gap-4 border-b border-[#ededed] px-5 py-5 last:border-b-0 sm:grid-cols-[120px_1fr_auto] sm:px-6"
                    >
                      <img src={product.image} alt={product.name} className="h-28 w-28 bg-[#f3f3f3] object-cover" />
                      <div className="min-w-0">
                        <h2 className="text-base font-semibold leading-6 sm:text-lg">{product.name}</h2>
                        <p className="mt-1 text-sm text-[#666]">{badge}</p>
                        <p className="mt-3 text-lg font-semibold">{money(product.price)}</p>
                        <div className="mt-4 flex items-center gap-3">
                          <button onClick={() => setQty(line.id, line.qty - 1)} className="grid h-9 w-9 place-items-center border border-[#dedede] hover:border-[#111] cursor-pointer" aria-label="Decrease quantity">
                            <Minus size={15} />
                          </button>
                          <span className="min-w-8 text-center text-sm font-semibold">{line.qty}</span>
                          <button onClick={() => setQty(line.id, line.qty + 1)} className="grid h-9 w-9 place-items-center border border-[#dedede] hover:border-[#111] cursor-pointer" aria-label="Increase quantity">
                            <Plus size={15} />
                          </button>
                          <button onClick={() => removeFromCart(line.id)} className="ml-2 grid h-9 w-9 place-items-center border border-[#dedede] text-[#666] hover:border-[#111] hover:text-[#111] cursor-pointer" aria-label="Remove item">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-xs uppercase tracking-[0.14em] text-[#777]">Line total</p>
                        <p className="mt-2 text-lg font-semibold">{money(product.price * line.qty)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
            <aside className="h-fit bg-white p-5 shadow-sm sm:p-6 lg:sticky lg:top-6">
              <h2 className="text-xl font-semibold">Order Summary</h2>

              <div className="mt-5 flex gap-2">
                <input
                  value={voucherCode}
                  onChange={(event) => setVoucherCode(event.target.value)}
                  placeholder="Enter voucher code"
                  className="h-12 min-w-0 flex-1 border border-[#dedede] px-4 text-sm outline-none focus:border-[#111]"
                />
                <button
                  onClick={() => setAppliedVoucher(voucherCode.trim())}
                  className="h-12 bg-[#111] px-5 text-sm font-semibold text-white cursor-pointer"
                >
                  Apply
                </button>
              </div>
              {appliedVoucher && !discount && (
                <p className="mt-2 text-xs text-[#8f1f35]">Voucher not applied. Try {VOUCHER_CODE}.</p>
              )}

              <div className="mt-6 space-y-4 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-[#666]">Subtotal ({totalItems} items)</span>
                  <span>{money(cartSubtotal)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#666]">Voucher discount</span>
                  <span>{discount ? `- ${money(discount)}` : money(0)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-[#666]">Delivery fee</span>
                  <span>{money(delivery.fee)}</span>
                </div>
                <div className="border-t border-[#ededed] pt-4">
                  <div className="flex justify-between gap-4 text-lg font-semibold">
                    <span>Total</span>
                    <span>{money(total)}</span>
                  </div>
                  <p className="mt-1 text-right text-xs text-[#777]">All available charges shown before order placement.</p>
                </div>
              </div>

              {step === 'cart' ? (
                <button
                  onClick={proceedToCheckout}
                  className="mt-7 h-12 w-full bg-[#111] text-sm font-semibold uppercase tracking-[0.04em] text-white cursor-pointer"
                >
                  Proceed to checkout ({totalItems})
                </button>
              ) : (
                <button
                  onClick={() => void placeOrder()}
                  className="mt-7 h-12 w-full bg-[#111] text-sm font-semibold uppercase tracking-[0.04em] text-white cursor-pointer"
                >
                  Place COD order
                </button>
              )}

              {formError && <p className="mt-3 text-sm font-semibold text-[#8f1f35]">{formError}</p>}
              {checkoutStatus && <p className="mt-3 text-sm text-[#666]">{checkoutStatus}</p>}

              <div className="mt-5 space-y-3 border-t border-[#ededed] pt-5 text-sm text-[#666]">
                <p className="flex gap-2">
                  <ShieldCheck size={17} className="mt-0.5 text-[#111]" /> Secure checkout with Cash on Delivery.
                </p>
                <p className="flex gap-2">
                  <MapPin size={17} className="mt-0.5 text-[#111]" /> Delivery details are confirmed before order placement.
                </p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </main>
  );
}
