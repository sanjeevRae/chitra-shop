'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { useCustomerAuth } from '@/lib/customer-context';
import { getProduct, getProductWithPlaceholder } from '@/lib/products';
import { PIXEL_CURRENCY, trackMetaEvent } from '@/lib/meta-pixel';
import { rememberPurchase, type PendingPurchase } from '@/lib/meta-purchase';

const TAXES = 20.0;
const SHIPPING = 5.99;
const DISCOUNT = 5.0;

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, cartSubtotal, clearCart, cartProducts } = useStore();
  const { user, openLogin, authHeaders } = useCustomerAuth();
  const [placing, setPlacing] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  const itemCount = cart.reduce((sum, item) => sum + item.qty, 0);
  const total = cartSubtotal + TAXES + SHIPPING - DISCOUNT;

  // Meta InitiateCheckout: fires once per visit when the cart is non-empty
  // (the cart hydrates from localStorage async, so this waits for it). Gated
  // on login would under-report; checkout beginning = cart review here.
  const initiatedRef = useRef(false);
  useEffect(() => {
    // Same price resolution as the store's cartSubtotal (DB row, then static
    // catalog). Lines with no price yet mean the cart is still hydrating —
    // hold the event (ref not yet set) so the next render can retry with
    // real prices instead of permanently skipping this visit.
    if (initiatedRef.current || cart.length === 0) return;
    const contents = cart.flatMap((line) => {
      const live = cartProducts[String(line.id)];
      const product = live ?? getProduct(line.id);
      const itemPrice = Number(product?.price ?? 0) || 0;
      if (!product || itemPrice <= 0) return [];
      return [{ id: String(line.id), quantity: line.qty, item_price: itemPrice }];
    });
    if (contents.length !== cart.length) return;
    if (contents.length === 0) return;
    initiatedRef.current = true;
    trackMetaEvent('InitiateCheckout', {
      content_ids: contents.map((item) => item.id),
      content_type: 'product',
      contents,
      num_items: itemCount,
      value: Math.round(total * 100) / 100,
      currency: PIXEL_CURRENCY,
    });
  }, [cart, cartProducts, itemCount, total]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCheckoutError('');
    // Guest checkout is preserved for browsing, but persisted orders require
    // an account (SAUD parity: orders are keyed by customer id).
    if (!user) {
      openLogin();
      setCheckoutError('Please log in or create an account to place your order.');
      return;
    }
    if (cart.length === 0) {
      setCheckoutError('Your cart is empty.');
      return;
    }
    const form = new FormData(e.currentTarget);
    const shippingAddress = {
      fullName: String(form.get('fullName') ?? ''),
      email: String(form.get('email') ?? ''),
      phone: String(form.get('phone') ?? ''),
      city: String(form.get('city') ?? ''),
      zipCode: String(form.get('zipCode') ?? ''),
      address: String(form.get('address') ?? ''),
      area: user.area ?? '',
      landmark: user.landmark ?? '',
    };
    if (!shippingAddress.fullName.trim() || !shippingAddress.phone.trim() || !shippingAddress.city.trim() || !shippingAddress.address.trim()) {
      setCheckoutError('Fill in name, phone, city, and address.');
      return;
    }
    setPlacing(true);
    try {
      const items = cart.map((line) => {
        const product = getProductWithPlaceholder(line.id);
        return {
          id: String(line.id),
          name: product.name,
          price: product.price,
          image: product.image,
          quantity: line.qty,
        };
      });
      const response = await fetch('/api/customer?action=checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          items,
          subtotal: cartSubtotal,
          discount: DISCOUNT,
          deliveryFee: SHIPPING,
          deliveryLabel: 'Standard delivery',
          shippingAddress,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setCheckoutError(data.error || 'Could not place your order. Please try again.');
        return;
      }
      // Backend confirmed the order (HTTP ok + persisted row). Fire
      // AddPaymentInfo for the submitted COD payment, then stash the
      // backend-computed order so /thank-you can fire Purchase (deduped).
      const order = (data.order ?? {}) as {
        id?: unknown;
        total?: unknown;
        items?: { id?: unknown; price?: unknown; quantity?: unknown }[];
      };
      const confirmedItems = Array.isArray(order.items) ? order.items : [];
      const purchaseContents = confirmedItems.map((item) => ({
        id: String(item.id ?? ''),
        quantity: Math.max(1, Math.floor(Number(item.quantity ?? 1)) || 1),
        item_price: Number(item.price ?? 0) || 0,
      }));
      const orderId = String(order.id ?? '');
      const orderTotal = Number(order.total ?? 0) || 0;
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
        const pending: PendingPurchase = {
          orderId,
          total: orderTotal,
          contents: purchaseContents,
          numItems: purchaseContents.reduce((sum, item) => sum + item.quantity, 0),
        };
        rememberPurchase(pending);
      }
      clearCart();
      router.push('/thank-you');
    } catch {
      setCheckoutError('Could not place your order. Please try again.');
    } finally {
      setPlacing(false);
    }
  };

  return (
    <main>
      <section className="lg:pt-20 pt-14 pb-20">
        <div className="mx-auto max-w-7xl px-4 lg:px-6">
          <nav className="flex mb-7" aria-label="Breadcrumb">
            <ol className="inline-flex items-center space-x-1 md:space-x-2 text-sm">
              <li className="inline-flex items-center">
                <Link className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-900" href="/">
                  Home
                </Link>
              </li>
              <li>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M5.83333 12.6667L10 8.50008L5.83333 4.33341" stroke="#6B7280" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </li>
              <li>
                <Link className="text-gray-500 hover:text-gray-900" href="/shop">
                  Shop
                </Link>
              </li>
              <li>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M5.83333 12.6667L10 8.50008L5.83333 4.33341" stroke="#6B7280" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </li>
              <li className="inline-flex items-center">
                <button className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-900">
                  Product
                </button>
              </li>
              <li>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M5.83333 12.6667L10 8.50008L5.83333 4.33341" stroke="#6B7280" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </li>
              <li aria-current="page">
                <span className="font-medium text-gray-900">
                  Checkout
                </span>
              </li>
            </ol>
          </nav>
          <div className="flex flex-col lg:flex-row gap-11">
            <div className="lg:w-7/12">
              <div className="space-y-10">
                <div>
                  <h2 className="mb-5 text-3xl text-gray-900 font-semibold">
                    Fill up this information
                  </h2>
                  {!user && (
                    <p className="mb-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-gray-700">
                      You are checking out as a guest.{' '}
                      <button
                        type="button"
                        onClick={openLogin}
                        className="font-semibold text-violet-600 hover:text-violet-700 cursor-pointer"
                      >
                        Log in or create an account
                      </button>{' '}
                      to place your order and track it in your profile.
                    </p>
                  )}
                  {checkoutError && (
                    <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                      {checkoutError}
                    </p>
                  )}
                  <form id="checkout-form" onSubmit={(e) => { void handleSubmit(e); }}>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="col-span-full">
                        <label htmlFor="fullName" className="mb-2 inline-block font-medium text-gray-500">
                          Full Name
                        </label>
                        <input id="fullName" className="w-full px-4 py-2.5 border focus:border-violet-300 h-11 placeholder:text-gray-400 placeholder:text-base text-gray-800 border-gray-300 rounded-lg focus:outline-0 text-base ring-3 ring-transparent focus:ring-violet-500/30" placeholder="Jakob Curtis" type="text" defaultValue={user?.name ?? 'Jakob Curtis'} name="fullName" />
                      </div>
                      <div className="col-span-full">
                        <label htmlFor="address" className="mb-2 inline-block font-medium text-gray-500">
                          Address
                        </label>
                        <input id="address" className="w-full px-4 py-2.5 border focus:border-violet-300 h-11 placeholder:text-gray-400 placeholder:text-base text-gray-800 border-gray-300 rounded-lg focus:outline-0 text-base ring-3 ring-transparent focus:ring-violet-500/30" placeholder="30 N Gould St Ste R Sheridan, WY 82801" type="text" defaultValue={user?.address || '30 N Gould St, Sheridan, WY 82801'} name="address" />
                      </div>
                      <div>
                        <label htmlFor="country" className="mb-2 inline-block font-medium text-gray-500">
                          Country
                        </label>
                        <select id="country" name="country" className="w-full px-4 py-2.5 border focus:border-violet-300 h-11 placeholder:text-gray-400 placeholder:text-base text-gray-800 border-gray-300 rounded-lg focus:outline-0 text-base ring-3 ring-transparent focus:ring-violet-500/30">
                          <option>
                            United States
                          </option>
                          <option>
                            United Kingdom
                          </option>
                          <option>
                            Canada
                          </option>
                          <option>
                            Australia
                          </option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="state" className="mb-2 inline-block font-medium text-gray-500">
                          State
                        </label>
                        <select id="state" name="state" className="w-full px-4 py-2.5 border focus:border-violet-300 h-11 placeholder:text-gray-400 placeholder:text-base text-gray-800 border-gray-300 rounded-lg focus:outline-0 text-base ring-3 ring-transparent focus:ring-violet-500/30">
                          <option>
                            Wyoming
                          </option>
                          <option>
                            California
                          </option>
                          <option>
                            Texas
                          </option>
                          <option>
                            New York
                          </option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="city" className="mb-2 inline-block font-medium text-gray-500">
                          City
                        </label>
                        <input id="city" className="w-full px-4 py-2.5 border focus:border-violet-300 h-11 placeholder:text-gray-400 placeholder:text-base text-gray-800 border-gray-300 rounded-lg focus:outline-0 text-base ring-3 ring-transparent focus:ring-violet-500/30" placeholder="Sheridan" type="text" defaultValue="Sheridan" name="city" />
                      </div>
                      <div>
                        <label htmlFor="zipCode" className="mb-2 inline-block font-medium text-gray-500">
                          Zip code
                        </label>
                        <input id="zipCode" className="w-full px-4 py-2.5 border focus:border-violet-300 h-11 placeholder:text-gray-400 placeholder:text-base text-gray-800 border-gray-300 rounded-lg focus:outline-0 text-base ring-3 ring-transparent focus:ring-violet-500/30" placeholder="10110" type="text" defaultValue="82801" name="zipCode" />
                      </div>
                      <div className="col-span-full">
                        <label htmlFor="additionalInfo" className="mb-2 inline-block font-medium text-gray-500">
                          Additional Information
                        </label>
                        <textarea id="additionalInfo" className="w-full px-4 py-2.5 border focus:border-violet-300 h-45 placeholder:text-gray-400 placeholder:text-base text-gray-800 border-gray-300 rounded-lg focus:outline-0 text-base ring-3 resize-none ring-transparent focus:ring-violet-500/30" placeholder="Enter your message here..." defaultValue="" />
                      </div>
                      <div className="flex items-center">
                        <input id="checkbox1" className="w-4 h-4 text-violet-500 bg-white checked:bg-violet-500 border-gray-300 rounded focus:ring-0" type="checkbox" />
                        <label htmlFor="checkbox1" className="ml-2 text-sm shrink-0 text-gray-700 cursor-pointer">
                          Use shipping address as billing address
                        </label>
                      </div>
                    </div>
                  </form>
                </div>
                <div>
                  <h2 className="text-gray-800 text-xl font-semibold mb-5">
                    Delivery With
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div className="rounded-lg cursor-pointer transition-all flex py-4 px-7 border-2 ring-1 ring-gray-200 items-center border-violet-500">
                      <div className="pr-6">
                        <svg xmlns="http://www.w3.org/2000/svg" width="65" height="18" viewBox="0 0 65 18" fill="none">
                          <g clipPath="url(#clip0_fedex)">
                            <path d="M64.5354 15.6595C64.5354 14.6591 63.826 13.9265 62.8488 13.9265C61.8731 13.9265 61.1629 14.6591 61.1629 15.6595C61.1629 16.6582 61.8731 17.3895 62.8488 17.3895C63.826 17.3895 64.5354 16.657 64.5354 15.6595ZM62.4056 15.7483V16.8802H62.0399V14.3843H62.9486C63.481 14.3843 63.7254 14.6169 63.7254 15.0702C63.7254 15.3494 63.5366 15.5706 63.2935 15.6026V15.6132C63.5046 15.6469 63.5821 15.8352 63.6255 16.1797C63.6588 16.403 63.703 16.7901 63.7826 16.881H63.35C63.2493 16.6465 63.2595 16.3145 63.1819 16.0365C63.1178 15.825 63.005 15.7479 62.7627 15.7479H62.4076V15.7491L62.4056 15.7483ZM62.8589 15.4257C63.214 15.4257 63.3155 15.2366 63.3155 15.0698C63.3155 14.8725 63.214 14.7167 62.8589 14.7167H62.4056V15.4265H62.8589V15.4257ZM60.7607 15.6595C60.7607 14.4269 61.7392 13.5938 62.8471 13.5938C63.9583 13.5938 64.9355 14.4269 64.9355 15.6595C64.9355 16.8895 63.9587 17.7235 62.8471 17.7235C61.7392 17.7235 60.7607 16.8895 60.7607 15.6595Z" fill="#FF5A00" />
                            <path d="M53.5298 17.3632L51.1244 14.6656L48.7401 17.3632H43.7231L48.6264 11.8544L43.7231 6.34396H48.8967L51.3265 9.02086L53.6645 6.34396H58.6571L53.7781 11.8313L58.7249 17.3632H53.5298ZM34.0894 17.3632V0.00439453H43.7231V3.87364H38.17V6.34396H43.7231V10.0671H38.17V13.4842H43.7231V17.3632H34.0894Z" fill="#FF5A00" />
                            <path d="M30.0238 0.00439453V7.10856H29.9788C29.079 6.07449 27.9544 5.71411 26.6505 5.71411C23.9785 5.71411 21.9655 7.53185 21.2589 9.93319C20.453 7.28673 18.3747 5.6646 15.2936 5.6646C12.7908 5.6646 10.8151 6.78755 9.7831 8.61787V6.34356H4.61071V3.87405H10.2559V0.00520731H0V17.3632H4.61071V10.0671H9.20641C9.06485 10.6282 8.99408 11.2048 8.99578 11.7834C8.99578 15.4026 11.7616 17.946 15.2927 17.946C18.261 17.946 20.2188 16.5512 21.2533 14.0118H17.3016C16.7676 14.776 16.3617 15.0017 15.2931 15.0017C14.0545 15.0017 12.9856 13.9205 12.9856 12.6405H21.0317C21.3807 15.5159 23.6209 17.9951 26.6955 17.9951C28.0218 17.9951 29.2361 17.343 29.9783 16.2411H30.023V17.3657H34.0883V0.00520731H30.0238V0.00439453ZM13.1138 10.1191C13.3707 9.016 14.2258 8.29523 15.2931 8.29523C16.4684 8.29523 17.2801 8.99368 17.4932 10.1191H13.1138ZM27.5567 14.7217C26.0588 14.7217 25.1278 13.326 25.1278 11.8682C25.1278 10.3098 25.9378 8.81267 27.5567 8.81267C29.2365 8.81267 29.9057 10.3106 29.9057 11.8682C29.9057 13.3446 29.1971 14.7217 27.5567 14.7217Z" fill="#29007C" />
                          </g>
                          <defs>
                            <clipPath id="clip0_fedex">
                              <rect width="64.9351" height="18" fill="white" />
                            </clipPath>
                          </defs>
                        </svg>
                      </div>
                      <div className="pl-6 border-l border-gray-200">
                        <h3 className="text-base font-semibold">
                          $5.99
                        </h3>
                        <p className="text-xs text-gray-500">
                          3-5 days
                        </p>
                      </div>
                    </div>
                    <div className="rounded-lg cursor-pointer transition-all flex py-4 px-7 border-2 ring-1 ring-gray-200 items-center border-transparent">
                      <div className="pr-6">
                        <svg xmlns="http://www.w3.org/2000/svg" width="65" height="20" viewBox="0 0 65 20" fill="none">
                          <g clipPath="url(#clip0_dhl)">
                            <path d="M64.6828 0.00341797V14.2778H0V0.00341797H64.6828Z" fill="#FFCC00" />
                            <path d="M11.3752 2.56689L9.30859 5.37451H20.5716C21.1409 5.37451 21.1334 5.59084 20.8551 5.9678C20.5725 6.35047 20.0996 7.01598 19.8117 7.4047C19.6657 7.60197 19.4016 7.96136 20.2768 7.96136H24.8827C24.8827 7.96136 25.6251 6.95117 26.2472 6.10654C27.0939 4.95773 26.3207 2.56701 23.2941 2.56701L11.3752 2.56689Z" fill="#D2002E" />
                            <path d="M8.47238 11.7138L12.6232 6.07379H17.7741C18.3434 6.07379 18.336 6.29011 18.0577 6.66708C17.7751 7.04975 17.2945 7.70818 17.0066 8.0969C16.8604 8.29417 16.5964 8.65414 17.4715 8.65414H24.3722C23.7983 9.44036 21.9367 11.7137 18.5941 11.7137L8.47238 11.7138ZM32.2444 8.65345L29.9934 11.7136H24.0558C24.0558 11.7136 26.3055 8.65414 26.3074 8.65414L32.2444 8.65345ZM41.3406 7.96136H26.8175L30.789 2.56689H36.725L34.4486 5.66009H37.0982L39.3755 2.56689H45.3108L41.3406 7.96136ZM40.8309 8.65425L38.5789 11.7138H32.6434C32.6434 11.7138 34.8931 8.65425 34.895 8.65425H40.8309ZM0 9.86068H8.74734L8.26952 10.5107H0V9.86068ZM0 8.65425H9.63602L9.15728 9.30333H0V8.65425ZM0 11.0678H7.85912L7.38358 11.7138H0V11.0678ZM64.6831 10.5107H55.9694L56.4477 9.86079H64.6831V10.5107ZM64.6831 11.7138L55.0836 11.7147L55.5591 11.0678H64.6831V11.7138ZM57.3352 8.65425H64.6831V9.30367L56.8574 9.30424L57.3352 8.65425ZM53.5313 2.56689L49.5605 7.96125H43.2706C43.2706 7.96125 47.2425 2.56689 47.2445 2.56689H53.5313ZM42.7617 8.65425C42.7617 8.65425 42.3278 9.2472 42.1172 9.5322C41.3716 10.5399 42.0307 11.7138 44.4637 11.7138H53.9966L56.2484 8.65425H42.7617Z" fill="#D2002E" />
                            <path d="M0 16.5986H64.6831V16.922H0V16.5986ZM0 18.1075H64.6831V18.4309H0V18.1075ZM0 19.6161H64.6831V19.9394H0V19.6161Z" fill="#FFCC00" />
                          </g>
                          <defs>
                            <clipPath id="clip0_dhl">
                              <rect width="64.6831" height="20" fill="white" />
                            </clipPath>
                          </defs>
                        </svg>
                      </div>
                      <div className="pl-6 border-l border-gray-200">
                        <h3 className="text-base font-semibold">
                          $5.99
                        </h3>
                        <p className="text-xs text-gray-500">
                          3-5 days
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-800 mb-4">
                    Select payment
                  </h2>
                  <div className="border border-gray-300 rounded-2xl p-5">
                    <div className="flex flex-col sm:flex-row gap-3 mb-3">
                      <button className="flex items-center cursor-pointer gap-2 sm:w-1/2 border text-base text-gray-800 rounded-lg p-3 border-violet-500 border-2">
                        <div className="border border-gray-200 rounded-lg w-10 h-10 flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M2.75 9H21.25M2.75 10.5H21.25M4.25 5.25H19.75C20.5784 5.25 21.25 5.92157 21.25 6.75V17.25C21.25 18.0784 20.5784 18.75 19.75 18.75H4.25C3.42157 18.75 2.75 18.0784 2.75 17.25V6.75C2.75 5.92157 3.42157 5.25 4.25 5.25Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        Credit or debit card
                      </button>
                      <button className="flex items-center cursor-pointer gap-2 sm:w-1/2 border text-base text-gray-800 rounded-lg p-3 border-gray-200">
                        <div className="border border-gray-200 rounded-lg w-10 h-10 flex items-center justify-center">
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none">
                            <path d="M2.54993 14.7498L2.54993 5.69751M15.4501 14.7498L15.4501 5.69751M13.2002 14.7498L13.2002 5.69751M4.7998 14.7498L4.7998 5.69751M17 16.9998V16.2498C17 15.4213 16.3284 14.7498 15.5 14.7498H2.5C1.67157 14.7498 1 15.4213 1 16.2498V16.9998H17ZM2.05259 3.17082L8.55259 1.13957C8.84392 1.04853 9.15608 1.04853 9.44741 1.13957L15.9474 3.17082C16.5736 3.36651 17 3.94646 17 4.60254V5.69729H1V4.60254C1 3.94646 1.42637 3.36651 2.05259 3.17082Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                        Bank Transfer
                      </button>
                    </div>
                    <div>
                      <label className="block mb-3 text-sm font-medium text-gray-800">
                        Card Information
                      </label>
                      <div className="relative border rounded-lg border-gray-200 overflow-hidden">
                        <div className="border-b border-gray-200">
                          <input placeholder="4645 75345 4546 1345" className="w-full border-0 px-4 bg-transparent py-2.5 text-sm placeholder-gray-400 focus:outline-none focus:ring-0" type="text" />
                          <div className="absolute right-3 top-2.5 flex gap-1">
                            <img className="h-5" alt="Visa" src="/images/payment/visa.png" />
                            <img className="h-5" alt="Mastercard" src="/images/payment/mastercard.png" />
                            <img className="h-5" alt="Amex" src="/images/payment/ae-1.png" />
                          </div>
                        </div>
                        <div className="flex divide-x divide-gray-300">
                          <div className="w-1/2">
                            <input placeholder="MM/YY" className="w-full border-0 px-4 py-2.5 text-sm bg-transparent placeholder-gray-400 focus:outline-none focus:ring-0" type="text" />
                          </div>
                          <div className="w-1/2">
                            <input placeholder="CVC" className="w-full border-0 px-4 py-2.5 text-sm bg-transparent placeholder-gray-400 focus:outline-none focus:ring-0" type="text" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="lg:w-5/12">
              <div className="space-y-9 border p-8 border-gray-200 rounded-2xl">
                <div>
                  <h3 className="text-2xl font-semibold text-gray-900">
                    Price Summary
                  </h3>
                  <p className="text-base text-gray-500">
                    You have {itemCount} items in your cart
                  </p>
                </div>
                <div className="space-y-4">
                  {cart.length === 0 ? null : (
                    cart.map((item) => {
                      const product = getProductWithPlaceholder(item.id);
                      if (!product) return null;
                      return (
                        <div key={item.id} className="flex items-center gap-4">
                          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                            <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                          </div>
                          <div className="flex-1">
                            <p className="text-base font-medium text-gray-800">{product.name}</p>
                            <p className="text-sm text-gray-500">Qty: {item.qty}</p>
                          </div>
                          <span className="text-base font-semibold text-gray-900">
                            {money(product.price * item.qty)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
                <div>
                  <label htmlFor="promoCode" className="font-medium text-sm text-gray-500 block mb-2">
                    Have a promo code?
                  </label>
                  <div className="flex gap-4">
                    <input id="promoCode" placeholder="Enter code here" className="w-full px-4 py-2.5 border focus:border-violet-300 h-11 placeholder:text-gray-400 placeholder:text-base text-gray-800 border-gray-300 rounded-lg focus:outline-0 text-base ring-3 ring-transparent focus:ring-violet-500/30" type="text" />
                    <button className="py-2.5 px-5 bg-violet-500 inline-flex items-center justify-center text-white font-medium text-base rounded-lg hover:bg-violet-600">
                      Apply
                    </button>
                  </div>
                </div>
                <div>
                  <ul className="space-y-3 border-b border-gray-300 pb-5">
                    <li className="flex justify-between text-base text-gray-700">
                      <span>
                        Subtotal
                      </span>
                      <span>
                        {money(cartSubtotal)}
                      </span>
                    </li>
                    <li className="flex justify-between text-base text-gray-700">
                      <span>
                        Taxes
                      </span>
                      <span>
                        {money(TAXES)}
                      </span>
                    </li>
                    <li className="flex justify-between text-base text-gray-700">
                      <span>
                        Shipping
                      </span>
                      <span>
                        {money(SHIPPING)}
                      </span>
                    </li>
                    <li className="flex justify-between text-base text-gray-700">
                      <span>
                        Discount
                      </span>
                      <span className="text-green-600">
                        -{money(DISCOUNT)}
                      </span>
                    </li>
                  </ul>
                  <div className="flex justify-between font-semibold text-black pt-5">
                    <span className="font-medium text-lg text-gray-800">
                      Total Amount
                    </span>
                    <span className="font-medium text-lg text-gray-800">
                      {money(total)}
                    </span>
                  </div>
                </div>
                <div>
                  <button
                    type="submit"
                    form="checkout-form"
                    disabled={placing}
                    className="w-full bg-violet-500 py-3 px-5 rounded-lg text-white cursor-pointer font-medium text-center block hover:bg-violet-600 focus:bg-violet-600 focus:outline-0 transition duration-300 disabled:opacity-60"
                  >
                    {placing ? 'Placing your order...' : user ? 'Place order' : 'Proceed to checkout'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
