'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCcw, ShoppingBag, Star, XCircle } from 'lucide-react';
import { useCustomerAuth } from '../lib/customer-context';
import { getProductWithPlaceholder } from '../lib/products';

// Orders dashboard — the order section moved out of /profile (per user
// request). Session-scoped: GET/PATCH /api/customer?action=orders resolve the
// customer from the Authorization token, never a userId param.

type OrderItem = {
  id?: string;
  productId?: string;
  name?: string;
  price?: number;
  image?: string;
  category?: string;
  quantity?: number;
  qty?: number;
};

type CustomerOrder = {
  id: string;
  items?: OrderItem[];
  subtotal?: number;
  discount?: number;
  deliveryFee?: number;
  deliveryLabel?: string;
  total?: number;
  status?: string;
  shippingAddress?: Record<string, string>;
  createdAt?: string;
  updatedAt?: string;
};

type ReviewDraft = { rating: number; text: string };

type ProductReview = {
  id: string;
  productId?: string;
  productName?: string;
  userPhoto?: string;
  rating?: number;
  text?: string;
  createdAt?: string;
  updatedAt?: string;
};

function money(value?: number) {
  const rounded = Math.round(Number(value || 0));
  return `Rs. ${rounded.toLocaleString('en-NP')}`;
}

function formatDate(value?: string) {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const statusLabels: Record<string, string> = {
  pending_cod: 'Pending COD',
  processing: 'Processing',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

function itemId(item: OrderItem): string {
  return String(item.id ?? item.productId ?? '');
}

function itemQty(item: OrderItem): number {
  return Number(item.quantity ?? item.qty ?? 0);
}

const inputClass =
  'h-11 w-full border border-gray-300 bg-white px-4 text-base text-gray-800 placeholder:text-gray-400 outline-0 ring-3 ring-transparent focus:border-gray-900 focus:ring-gray-900/10';

export default function OrdersPage() {
  const { user, openLogin, authHeaders } = useCustomerAuth();
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [ordersStatus, setOrdersStatus] = useState('');
  const [reviews, setReviews] = useState<ProductReview[]>([]);
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, ReviewDraft>>({});
  const [reviewStatus, setReviewStatus] = useState('');
  const [editingOrderId, setEditingOrderId] = useState('');
  const [orderDrafts, setOrderDrafts] = useState<Record<string, Record<string, string>>>({});
  const [orderActionStatus, setOrderActionStatus] = useState('');

  // Session-scoped server-side: the token travels in the Authorization header.
  const loadOrdersAndReviews = useCallback(async () => {
    if (!user) return;
    setOrdersStatus('Loading your orders...');
    const headers = authHeaders();
    const [ordersResponse, reviewsResponse] = await Promise.all([
      fetch('/api/customer?action=orders', { headers }),
      fetch('/api/customer?action=reviews', { headers }),
    ]);
    const ordersData = await ordersResponse.json().catch(() => ({}));
    const reviewsData = await reviewsResponse.json().catch(() => ({}));
    setOrders(Array.isArray(ordersData.orders) ? ordersData.orders : []);
    setReviews(Array.isArray(reviewsData.reviews) ? reviewsData.reviews : []);
    setOrdersStatus(ordersResponse.ok ? '' : ordersData.error || 'Could not load orders.');
    if (!reviewsResponse.ok) setReviewStatus(reviewsData.error || 'Could not load reviews.');
  }, [user, authHeaders]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- session-scoped fetch on login (SAUD parity)
    void loadOrdersAndReviews();
  }, [loadOrdersAndReviews]);

  const reviewsByProduct = useMemo(() => {
    const map: Record<string, ProductReview> = {};
    for (const review of reviews) {
      const key = String(review.productId || '');
      if (key) map[key] = review;
    }
    return map;
  }, [reviews]);

  const updateReviewDraft = (key: string, update: Partial<ReviewDraft>) => {
    setReviewDrafts((current) => ({
      ...current,
      [key]: { ...(current[key] ?? { rating: 5, text: '' }), ...update },
    }));
  };

  const submitReview = async (item: OrderItem) => {
    if (!user) return;
    const key = itemId(item);
    if (!key) return;
    const draft = reviewDrafts[key] ?? { rating: 5, text: '' };
    setReviewStatus('Saving review...');
    const response = await fetch('/api/customer?action=reviews', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ productId: key, productName: item.name, rating: draft.rating, text: draft.text }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setReviewStatus(data.error || 'Could not save review.');
      return;
    }
    setReviews((current) => {
      const next = current.filter((review) => String(review.productId) !== key);
      return [data.review, ...next];
    });
    setReviewDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setReviewStatus('Review saved.');
  };

  const deleteReview = async (item: OrderItem) => {
    if (!user) return;
    const key = itemId(item);
    if (!key) return;
    if (!confirm('Delete this review?')) return;
    setReviewStatus('Deleting review...');
    const response = await fetch(
      `/api/customer?action=reviews&productId=${encodeURIComponent(key)}`,
      { method: 'DELETE', headers: authHeaders() },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setReviewStatus(data.error || 'Could not delete review.');
      return;
    }
    setReviews((current) => current.filter((review) => String(review.productId) !== key));
    setReviewDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    setReviewStatus('Review deleted.');
  };

  const canChangeOrder = (order: CustomerOrder) =>
    ['pending_cod', 'processing'].includes(order.status || 'pending_cod');

  const startEditOrder = (order: CustomerOrder) => {
    setEditingOrderId(order.id);
    setOrderActionStatus('');
    setOrderDrafts((current) => ({
      ...current,
      [order.id]: {
        fullName: order.shippingAddress?.fullName || '',
        phone: order.shippingAddress?.phone || '',
        email: order.shippingAddress?.email || '',
        city: order.shippingAddress?.city || '',
        area: order.shippingAddress?.area || '',
        address: order.shippingAddress?.address || '',
        landmark: order.shippingAddress?.landmark || '',
      },
    }));
  };

  const updateOrderDraft = (orderId: string, field: string, value: string) => {
    setOrderDrafts((current) => ({
      ...current,
      [orderId]: { ...(current[orderId] ?? {}), [field]: value },
    }));
  };

  const saveOrderDetails = async (order: CustomerOrder) => {
    if (!user) return;
    const draft = orderDrafts[order.id] ?? {};
    const required = ['fullName', 'phone', 'city', 'area', 'address'];
    if (required.some((field) => !String(draft[field] || '').trim())) {
      setOrderActionStatus('Fill in name, phone, city, area, and address.');
      return;
    }
    setOrderActionStatus('Updating order details...');
    const response = await fetch('/api/customer?action=orders', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ orderId: order.id, intent: 'shipping', shippingAddress: draft }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setOrderActionStatus(data.error || 'Could not update order details.');
      return;
    }
    setOrders((current) => current.map((item) => (item.id === order.id ? data.order : item)));
    setEditingOrderId('');
    setOrderActionStatus('Order details updated.');
  };

  const cancelOrder = async (order: CustomerOrder) => {
    if (!user || !confirm('Cancel this order?')) return;
    setOrderActionStatus('Cancelling order...');
    const response = await fetch('/api/customer?action=orders', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ orderId: order.id, intent: 'cancel' }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setOrderActionStatus(data.error || 'Could not cancel order.');
      return;
    }
    setOrders((current) => current.map((item) => (item.id === order.id ? data.order : item)));
    setEditingOrderId('');
    setOrderActionStatus('Order cancelled.');
  };

  if (!user) {
    return (
      <main className="mx-auto max-w-7xl px-4 pb-20 pt-14 lg:px-6 lg:pt-20">
        <section className="border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-semibold text-gray-900">Login to view your orders</h1>
          <p className="mt-2 text-base text-gray-600">
            Track, edit, or cancel your orders and write product reviews.
          </p>
          <button
            onClick={openLogin}
            className="mt-6 bg-[#111111] px-6 py-3 text-base font-medium text-white hover:bg-[#333333] cursor-pointer"
          >
            Login / Register
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 pt-14 lg:px-6 lg:pt-20">
      <nav className="mb-7 flex" aria-label="Breadcrumb">
        <ol className="inline-flex items-center space-x-1 md:space-x-2 text-sm">
          <li className="inline-flex items-center">
            <Link className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-900" href="/">
              Home
            </Link>
          </li>
          <li aria-current="page">
            <span className="font-medium text-gray-900">Orders</span>
          </li>
        </ol>
      </nav>
      <div className="border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#111111]">Orders</p>
            <h1 className="mt-1 text-2xl font-semibold text-gray-900">Order history</h1>
            <p className="mt-1 text-sm text-gray-500">
              {orders.length
                ? `${orders.length} order${orders.length === 1 ? '' : 's'}`
                : 'No orders yet'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadOrdersAndReviews()}
            className="inline-flex items-center gap-1.5 border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:border-gray-900 hover:text-gray-900 cursor-pointer"
          >
            <RefreshCcw size={14} /> Refresh
          </button>
        </div>
        {ordersStatus && <p className="mt-4 text-sm text-gray-500">{ordersStatus}</p>}
        {orderActionStatus && <p className="mt-2 text-sm text-gray-500">{orderActionStatus}</p>}
        {!ordersStatus && orders.length === 0 && (
          <div className="mt-5 border border-dashed border-gray-200 p-6 text-center">
            <ShoppingBag size={22} className="mx-auto text-gray-400" />
            <p className="mt-2 text-sm text-gray-500">You have not placed any orders yet.</p>
            <Link
              href="/product"
              className="mt-4 inline-block bg-[#111111] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#333333]"
            >
              Start shopping
            </Link>
          </div>
        )}
        <div className="mt-5 space-y-4">
          {orders.map((order) => (
            <article key={order.id} className="border border-gray-200">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-4">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Order {order.id}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Placed {formatDate(order.createdAt)} ·{' '}
                    {statusLabels[order.status || 'pending_cod'] || order.status}
                  </p>
                </div>
                <p className="text-base font-semibold text-gray-900">{money(order.total)}</p>
              </div>
              <div className="grid gap-4 p-4">
                <div className="grid gap-4 bg-gray-50 p-4 lg:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#111111]">
                      Delivery details
                    </p>
                    {editingOrderId === order.id ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {[
                          ['fullName', 'Full name'],
                          ['phone', 'Phone'],
                          ['email', 'Email'],
                          ['city', 'City'],
                          ['area', 'Area'],
                          ['landmark', 'Landmark'],
                        ].map(([field, label]) => (
                          <input
                            key={field}
                            value={orderDrafts[order.id]?.[field] ?? ''}
                            onChange={(event) => updateOrderDraft(order.id, field, event.target.value)}
                            placeholder={label}
                            className={inputClass}
                          />
                        ))}
                        <textarea
                          value={orderDrafts[order.id]?.address ?? ''}
                          onChange={(event) => updateOrderDraft(order.id, 'address', event.target.value)}
                          placeholder="Full delivery address"
                          className="min-h-20 w-full border border-gray-300 bg-white px-4 py-2.5 text-base text-gray-800 placeholder:text-gray-400 outline-0 ring-3 ring-transparent focus:border-gray-900 focus:ring-gray-900/10 sm:col-span-2"
                        />
                        <div className="flex flex-wrap gap-2 sm:col-span-2">
                          <button
                            type="button"
                            onClick={() => void saveOrderDetails(order)}
                            className="bg-[#111111] px-4 py-2 text-sm font-medium text-white hover:bg-[#333333] cursor-pointer"
                          >
                            Save details
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingOrderId('')}
                            className="border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:border-gray-900 cursor-pointer"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 text-sm leading-6 text-gray-600">
                        <p className="font-semibold text-gray-900">
                          {order.shippingAddress?.fullName || 'Customer'}
                        </p>
                        <p>{order.shippingAddress?.phone || '-'}</p>
                        <p>{order.shippingAddress?.address || '-'}</p>
                        <p>
                          {[order.shippingAddress?.area, order.shippingAddress?.city, order.shippingAddress?.landmark]
                            .filter(Boolean)
                            .join(', ') || '-'}
                        </p>
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#111111]">Order total</p>
                    <div className="mt-3 space-y-2 text-sm text-gray-700">
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500">Subtotal</span>
                        <span>{money(order.subtotal)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500">Discount</span>
                        <span>- {money(order.discount)}</span>
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-gray-500">{order.deliveryLabel || 'Delivery'}</span>
                        <span>{money(order.deliveryFee)}</span>
                      </div>
                      <div className="border-t border-gray-200 pt-2 font-semibold text-gray-900">
                        <div className="flex justify-between gap-4">
                          <span>Total</span>
                          <span>{money(order.total)}</span>
                        </div>
                      </div>
                    </div>
                    {canChangeOrder(order) && editingOrderId !== order.id && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => startEditOrder(order)}
                          className="border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:border-gray-900 hover:text-gray-900 cursor-pointer"
                        >
                          Edit details
                        </button>
                        <button
                          type="button"
                          onClick={() => void cancelOrder(order)}
                          className="inline-flex items-center gap-1 border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-600 hover:text-white cursor-pointer"
                        >
                          <XCircle size={13} /> Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {(order.items ?? []).map((item) => {
                  const key = itemId(item);
                  const product = getProductWithPlaceholder(key || item.name || '');
                  const existingReview = reviewsByProduct[key];
                  const draft = reviewDrafts[key] ?? {
                    rating: Number(existingReview?.rating || 5),
                    text: String(existingReview?.text || ''),
                  };
                  return (
                    <div
                      key={`${order.id}-${key || item.name}`}
                      className="grid gap-4 border border-gray-100 p-3 lg:grid-cols-[72px_1fr_300px]"
                    >
                      <img
                        src={item.image || product.image}
                        alt=""
                        className="h-[72px] w-[72px] object-cover"
                      />
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">{item.name || product.name}</p>
                        <p className="mt-1 text-sm text-gray-500">
                          Qty {itemQty(item)} / {money(Number(item.price ?? product.price))}
                        </p>
                      </div>
                      <div className="grid gap-2">
                        {existingReview && (
                          <div className="bg-gray-50 p-3">
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#111111]">
                              Your review
                            </p>
                            <p className="mt-2 text-sm leading-6 text-gray-600">{existingReview.text}</p>
                            <p className="mt-2 text-xs text-gray-500">
                              Last updated {formatDate(existingReview.updatedAt || existingReview.createdAt)}
                            </p>
                          </div>
                        )}
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((value) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => updateReviewDraft(key, { rating: value })}
                              aria-label={`${value} star review`}
                              className="cursor-pointer"
                            >
                              <Star
                                size={17}
                                className={value <= draft.rating ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}
                              />
                            </button>
                          ))}
                        </div>
                        <textarea
                          value={draft.text}
                          onChange={(event) => updateReviewDraft(key, { text: event.target.value })}
                          placeholder="Write your review..."
                          className="min-h-20 w-full border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 outline-0 focus:border-gray-900"
                        />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void submitReview(item)}
                            className="bg-[#111111] px-4 py-2 text-sm font-medium text-white hover:bg-[#333333] cursor-pointer"
                          >
                            {existingReview ? 'Update review' : 'Save review'}
                          </button>
                          {existingReview && (
                            <button
                              type="button"
                              onClick={() => void deleteReview(item)}
                              className="border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-600 hover:text-white cursor-pointer"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
          {reviewStatus && <p className="text-sm text-gray-500">{reviewStatus}</p>}
        </div>
      </div>
    </main>
  );
}



