import { NextResponse } from 'next/server';
import { randomInt } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sendEmail } from '@/lib/order-emails';
import {
  adminSessionExpiry,
  buildAdminSessionCookie,
  buildAdminSessionCookieClear,
  newAdminSessionToken,
} from '@/lib/admin-auth';
import {
  emailCustomerId,
  hashPassword,
  newPublicId,
  newSessionToken,
  sha256Hex,
  verifyPassword,
} from '@/lib/customer-auth';

// POST /api/customer?action=account|checkout|reviews|logout|forgot|cart
// GET  /api/customer?action=account|orders|reviews|cart  (session-authenticated)
// PATCH /api/customer?action=account|orders          (session-authenticated)
// DELETE /api/customer?action=reviews               (session-authenticated)
//
// Sign-up/sign-in is EMAIL ONLY (password register/login). `forgot` is wired
// end-to-end on the client but the email delivery is a server stub for now —
// see forgotPassword() below.
//
// Conventions mirror /api/admin: service-role client only, RLS on the new
// tables has NO public policies. Session auth is `Authorization: Bearer
// <customerId>.<secret>` (stdlib node:crypto; no JWT dependency), and
// `x-customer-id` is accepted as an alias for the session token.
//
// GET account also accepts a bare `?id=<customerId>` so a stored session can
// refresh the profile snapshot (SAUD parity). Orders and review writes always
// require a valid session token and are ownership-checked row by row.

type CustomerRow = {
  id: string;
  method?: string | null;
  role?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  photo?: string | null;
  address?: string | null;
  city?: string | null;
  area?: string | null;
  landmark?: string | null;
  password_hash?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type SessionRow = {
  id: string;
  customer_id: string;
  secret_hash: string;
  expires_at: string | null;
};

type OrderDbRow = {
  id: string;
  user_id?: string | null;
  customer?: unknown;
  items?: unknown;
  subtotal?: number | string | null;
  discount?: number | string | null;
  delivery_fee?: number | string | null;
  delivery_label?: string | null;
  total?: number | string | null;
  payment_method?: string | null;
  status?: string | null;
  shipping_address?: unknown;
  created_at?: string | null;
  updated_at?: string | null;
};

type ReviewDbRow = {
  id: string;
  user_id: string;
  user_name?: string | null;
  user_photo?: string | null;
  product_id: string;
  product_name?: string | null;
  rating?: number | string | null;
  text?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asNumber(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function asText(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

// The account object the browser stores — password_hash NEVER leaves the server.
function sanitizeCustomer(row: CustomerRow) {
  return {
    id: row.id,
    method: row.method ?? 'email',
    role: row.role ?? 'customer',
    name: row.name ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    photo: row.photo ?? '',
    address: row.address ?? '',
    city: row.city ?? '',
    area: row.area ?? '',
    landmark: row.landmark ?? '',
  };
}

function toCustomerOrder(row: OrderDbRow) {
  const customer = asRecord(row.customer);
  return {
    id: row.id,
    user: {
      id: row.user_id ?? asText(customer.id),
      name: asText(customer.name),
      email: asText(customer.email),
      phone: asText(customer.phone),
    },
    items: Array.isArray(row.items) ? row.items : [],
    subtotal: asNumber(row.subtotal),
    discount: asNumber(row.discount),
    deliveryFee: asNumber(row.delivery_fee),
    deliveryLabel: row.delivery_label ?? 'Standard delivery',
    total: asNumber(row.total),
    paymentMethod: row.payment_method ?? 'Cash on Delivery',
    status: row.status ?? 'pending_cod',
    shippingAddress: asRecord(row.shipping_address),
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
  };
}

function toCustomerReview(row: ReviewDbRow) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name ?? '',
    userPhoto: row.user_photo ?? '',
    productId: row.product_id,
    productName: row.product_name ?? '',
    rating: Math.min(5, Math.max(1, Math.round(asNumber(row.rating) || 5))),
    text: row.text ?? '',
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
  };
}

function getSessionToken(request: Request): string | null {
  const authorization = request.headers.get('authorization') ?? '';
  if (authorization.toLowerCase().startsWith('bearer ')) {
    const token = authorization.slice(7).trim();
    if (token) return token;
  }
  const headers = Object.fromEntries(request.headers.entries());
  return headers['x-customer-id'] ?? null;
}

async function getSessionCustomerId(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  token: string | null,
): Promise<string | null> {
  if (!token || !token.includes('.')) return null;
  // Format is `<customerId>.<secret>`; ids never contain dots.
  const separator = token.lastIndexOf('.');
  const customerId = token.slice(0, separator);
  const secret = token.slice(separator + 1);
  if (!customerId || !secret) return null;
  const { data, error } = await supabase
    .from('customer_sessions')
    .select('id,customer_id,secret_hash,expires_at')
    .eq('id', token)
    .eq('customer_id', customerId)
    .maybeSingle();
  if (error || !data) return null;
  const session = data as SessionRow;
  if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) return null;
  return session.secret_hash === sha256Hex(secret) ? session.customer_id : null;
}

async function mintSession(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  customerId: string,
): Promise<string> {
  const token = newSessionToken(customerId);
  await supabase.from('customer_sessions').insert({
    id: token,
    customer_id: customerId,
    secret_hash: sha256Hex(token.slice(token.lastIndexOf('.') + 1)),
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  return token;
}

async function revokeCustomerSessions(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  customerId: string,
) {
  await supabase.from('customer_sessions').delete().eq('customer_id', customerId);
}

// When an ADMIN-role account logs in via the storefront, also mint an admin
// session + set the HttpOnly login cookie so the same login opens /admin. The
// /admin page gate reads exactly this cookie and re-checks role='admin', so a
// customer-role account never gets a cookie (role is verified here too).
async function setAdminLoginCookieIfAdmin(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  response: NextResponse,
  customerId: string,
  role: string | null | undefined,
  request: Request,
) {
  if (role !== 'admin') return;
  const token = newAdminSessionToken(customerId);
  const { error } = await supabase.from('admin_sessions').insert({
    id: token,
    customer_id: customerId,
    secret_hash: sha256Hex(token.slice(token.lastIndexOf('.') + 1)),
    expires_at: adminSessionExpiry(),
  });
  if (error) return; // Non-fatal: storefront login still succeeds.
  const isSecure = new URL(request.url).protocol === 'https:';
  response.headers.set('Set-Cookie', buildAdminSessionCookie(token, isSecure));
}

async function getAccount(request: Request) {
  const supabase = getSupabaseAdmin();
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return jsonError('Customer id is required.');
  const { data, error } = await supabase
    .from('customers')
    .select('id,method,role,name,email,phone,photo,address,city,area,landmark,created_at,updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) return jsonError(error.message, 500);
  if (!data) return jsonError('Account not found.', 404);
  return NextResponse.json({ user: sanitizeCustomer(data as CustomerRow) });
}

type LoginPayload = {
  mode?: string;
  email?: string;
  password?: string;
  name?: string;
  photo?: string;
  otp?: string;
};

async function upsertAccount(request: Request) {
  const supabase = getSupabaseAdmin();
  const payload = (await request.json().catch(() => ({}))) as LoginPayload;
  const mode = payload.mode === 'register' ? 'register' : 'login';
  const email = asText(payload.email).trim().toLowerCase();
  const password = asText(payload.password);
  const name = asText(payload.name).trim();
  const photo = asText(payload.photo);

  // Email-only auth: no phone, no Google.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError('Enter a valid email address.');
  }
  if (mode === 'register') {
    // Email/password self-signup is disabled — accounts are only created via
    // the verified OTP flow (POST ?action=send-otp then ?action=verify-otp).
    return jsonError(
      'Please use the signup flow and verify your email to create an account.',
      400,
    );
  }
  if (!password) return jsonError('Enter your password.');

  const id = emailCustomerId(email);
  const { data: existing, error: lookupError } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (lookupError) return jsonError(lookupError.message, 500);

  if (mode === 'login') {
    // Genuine login: unknown email is rejected — it must NOT create an
    // account (this is stricter than SAUD's merge-on-login).
    if (!existing) return jsonError('No account found for this email. Please register first.', 401);
    if (!verifyPassword(password, (existing as CustomerRow).password_hash)) {
      return jsonError('Invalid email or password.', 401);
    }
    const token = await mintSession(supabase, id);
    const response = NextResponse.json({ user: sanitizeCustomer(existing as CustomerRow), token });
    // Admin-role accounts also get the /admin login cookie from this storefront
    // login, so logging in anywhere grants dashboard access.
    await setAdminLoginCookieIfAdmin(supabase, response, id, (existing as CustomerRow).role, request);
    return response;
  }

  if (existing) {
    return jsonError('An account already exists for this email. Please log in instead.', 409);
  }

  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    id,
    method: 'email',
    role: 'customer',
    name: name || email.split('@')[0] || 'Customer',
    email,
    phone: '',
    photo,
    address: '',
    city: '',
    area: '',
    landmark: '',
    password_hash: hashPassword(password),
    created_at: now,
    updated_at: now,
  };
  const { data, error } = await supabase.from('customers').insert(row).select('*').single();
  if (error) {
    if (/duplicate|unique|already exists/i.test(error.message)) {
      return jsonError('An account already exists for this email. Please log in instead.', 409);
    }
    return jsonError(error.message, 500);
  }
  const token = await mintSession(supabase, id);
  return NextResponse.json({ user: sanitizeCustomer(data as CustomerRow), token });
}

const PROFILE_FIELDS = ['name', 'email', 'phone', 'photo', 'address', 'city', 'area', 'landmark'] as const;

async function updateAccount(request: Request) {
  const supabase = getSupabaseAdmin();
  const customerId = await getSessionCustomerId(supabase, getSessionToken(request));
  if (!customerId) return jsonError('Please log in again.', 401);
  const payload = asRecord(await request.json().catch(() => ({})));

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const field of PROFILE_FIELDS) {
    if (field in payload) patch[field] = asText(payload[field]);
  }
  // Identity fields (id/method/role/password) are never writable from the profile form.
  const { data, error } = await supabase
    .from('customers')
    .update(patch)
    .eq('id', customerId)
    .select('id,method,role,name,email,phone,photo,address,city,area,landmark,created_at,updated_at')
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ user: sanitizeCustomer(data as CustomerRow) });
}

async function logout(request: Request) {
  const supabase = getSupabaseAdmin();
  const customerId = await getSessionCustomerId(supabase, getSessionToken(request));
  if (customerId) await revokeCustomerSessions(supabase, customerId);
  // Also expire the admin login cookie (set only for admin-role accounts) so
  // a storefront logout fully ends /admin access.
  const isSecure = new URL(request.url).protocol === 'https:';
  const response = NextResponse.json({ ok: true });
  response.headers.set('Set-Cookie', buildAdminSessionCookieClear(isSecure));
  return response;
}

// POST /api/customer?action=forgot — password reset request.
//
// The request/response contract is FINAL (email in, generic ok out — no
// account-existence leak), but actual email delivery is not wired yet.
// TODO(password-reset): once configured, replace the stub below with:
//   1. mint a single-use token: randomBytes(32) -> sha256Hex() stored in
//      public.password_reset_tokens (hash only, expires_at ~30 min),
//   2. send the raw token to the email via your provider (Resend/SES/etc.),
//   3. add `POST ?action=reset` that verifies the hash, runs hashPassword()
//      on the new password, updates customers.password_hash, and revokes
//      all customer_sessions for that id.
async function forgotPassword(request: Request) {
  const payload = asRecord(await request.json().catch(() => ({})));
  const email = asText(payload.email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError('Enter a valid email address.');
  }
  // Generic answer for every email (existing or not): no account enumeration.
  // The real implementation will look up `emailCustomerId(email)` and only
  // then mint/send the token — the response text stays identical either way.
  return jsonError(
    'Password reset is not configured yet. Please contact support to reset your password.',
    501,
  );
}

async function getOrders(request: Request) {
  const supabase = getSupabaseAdmin();
  const customerId = await getSessionCustomerId(supabase, getSessionToken(request));
  if (!customerId) return jsonError('Please log in to view your orders.', 401);
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('user_id', customerId)
    .order('created_at', { ascending: false });
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ orders: ((data ?? []) as OrderDbRow[]).map(toCustomerOrder) });
}

const EDITABLE_ORDER_STATUSES = new Set(['pending_cod', 'processing']);

async function updateOrder(request: Request) {
  const supabase = getSupabaseAdmin();
  const customerId = await getSessionCustomerId(supabase, getSessionToken(request));
  if (!customerId) return jsonError('Please log in again.', 401);
  const payload = asRecord(await request.json().catch(() => ({})));
  const orderId = asText(payload.orderId);
  const intent = asText(payload.intent);
  if (!orderId || (intent !== 'cancel' && intent !== 'shipping')) {
    return jsonError('Order update payload is incomplete.');
  }
  const { data: row, error: lookupError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .eq('user_id', customerId)
    .maybeSingle();
  if (lookupError) return jsonError(lookupError.message, 500);
  if (!row) return jsonError('Order not found.', 404);
  const existing = row as OrderDbRow;
  const currentStatus = asText(existing.status) || 'pending_cod';
  if (!EDITABLE_ORDER_STATUSES.has(currentStatus)) {
    return jsonError('This order can no longer be changed.');
  }

  const now = new Date().toISOString();
  if (intent === 'cancel') {
    const { data, error } = await supabase
      .from('orders')
      .update({ status: 'cancelled', updated_at: now })
      .eq('id', orderId)
      .eq('user_id', customerId)
      .select('*')
      .single();
    if (error) return jsonError(error.message, 500);
    return NextResponse.json({ ok: true, order: toCustomerOrder(data as OrderDbRow) });
  }

  const draft = asRecord(payload.shippingAddress);
  const required = ['fullName', 'phone', 'city', 'area', 'address'];
  if (required.some((field) => !asText(draft[field]).trim())) {
    return jsonError('Fill in name, phone, city, area, and address.');
  }
  const shippingAddress: Record<string, string> = {};
  const merged = { ...asRecord(existing.shipping_address), ...draft };
  for (const [key, value] of Object.entries(merged)) {
    shippingAddress[key] = asText(value);
  }
  const { data, error } = await supabase
    .from('orders')
    .update({ shipping_address: shippingAddress, updated_at: now })
    .eq('id', orderId)
    .eq('user_id', customerId)
    .select('*')
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true, order: toCustomerOrder(data as OrderDbRow) });
}

async function checkout(request: Request) {
  const supabase = getSupabaseAdmin();
  const customerId = await getSessionCustomerId(supabase, getSessionToken(request));
  if (!customerId) return jsonError('Please log in to place an order.', 401);
  const payload = asRecord(await request.json().catch(() => ({})));
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) return jsonError('Your cart is empty.');

  const { data: account, error: accountError } = await supabase
    .from('customers')
    .select('id,name,email,phone')
    .eq('id', customerId)
    .maybeSingle();
  if (accountError) return jsonError(accountError.message, 500);
  if (!account) return jsonError('Account not found.', 404);
  const customer = account as CustomerRow;

  const shippingAddress = asRecord(payload.shippingAddress);
  const subtotal = asNumber(payload.subtotal);
  const discount = asNumber(payload.discount);
  const deliveryFee = asNumber(payload.deliveryFee);
  const total = Math.max(0, subtotal - discount + deliveryFee);
  const now = new Date().toISOString();
  const order: Record<string, unknown> = {
    id: newPublicId('ORD'),
    user_id: customerId,
    customer: {
      id: customer.id,
      name: customer.name ?? '',
      email: customer.email ?? '',
      phone: customer.phone ?? '',
    },
    items,
    subtotal,
    discount,
    delivery_fee: deliveryFee,
    delivery_label: asText(payload.deliveryLabel) || 'Standard delivery',
    total,
    payment_method: 'Cash on Delivery',
    status: 'pending_cod',
    shipping_address: shippingAddress,
    created_at: now,
    updated_at: now,
  };
  const { data, error } = await supabase.from('orders').insert(order).select('*').single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true, order: toCustomerOrder(data as OrderDbRow) });
}

async function getReviews(request: Request) {
  const supabase = getSupabaseAdmin();
  const customerId = await getSessionCustomerId(supabase, getSessionToken(request));
  if (!customerId) return jsonError('Please log in to view your reviews.', 401);
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('user_id', customerId)
    .order('updated_at', { ascending: false });
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ reviews: ((data ?? []) as ReviewDbRow[]).map(toCustomerReview) });
}

async function saveReview(request: Request) {
  const supabase = getSupabaseAdmin();
  const customerId = await getSessionCustomerId(supabase, getSessionToken(request));
  if (!customerId) return jsonError('Please log in to write a review.', 401);
  const payload = asRecord(await request.json().catch(() => ({})));
  const productId = asText(payload.productId);
  if (!productId) return jsonError('Product id is required.');
  const rating = Math.min(5, Math.max(1, Math.round(asNumber(payload.rating) || 5)));
  const text = asText(payload.text).trim();
  if (!text) return jsonError('Write something about this product first.');

  const id = `${customerId}_${productId}`;
  const { data: account } = await supabase
    .from('customers')
    .select('name,photo')
    .eq('id', customerId)
    .maybeSingle();
  const snapshot = (account ?? {}) as Partial<CustomerRow>;
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    id,
    user_id: customerId,
    user_name: asText(snapshot.name),
    user_photo: asText(snapshot.photo),
    product_id: productId,
    product_name: asText(payload.productName),
    rating,
    text,
    updated_at: now,
  };
  const { data: existing } = await supabase
    .from('reviews')
    .select('id,created_at')
    .eq('id', id)
    .maybeSingle();
  if (!existing) row.created_at = now;
  const { data, error } = await supabase
    .from('reviews')
    .upsert(row, { onConflict: 'id' })
    .select('*')
    .single();
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true, review: toCustomerReview(data as ReviewDbRow) });
}

async function deleteReview(request: Request) {
  const supabase = getSupabaseAdmin();
  const customerId = await getSessionCustomerId(supabase, getSessionToken(request));
  if (!customerId) return jsonError('Please log in again.', 401);
  const productId = new URL(request.url).searchParams.get('productId');
  if (!productId) return jsonError('Product id is required.');
  const { error } = await supabase
    .from('reviews')
    .delete()
    .eq('id', `${customerId}_${productId}`)
    .eq('user_id', customerId);
  if (error) return jsonError(error.message, 500);
  return NextResponse.json({ ok: true });
}

const OTP_TTL_MS = Number(process.env.OTP_EXPIRY_MINUTES ?? 10) * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60_000;
const OTP_MAX_ATTEMPTS = 5;

// POST ?action=send-otp — email + password + name; generates a 6-digit code,
// stores its hash, and emails it. NO account is created here.
async function sendSignupOtp(request: Request) {
  const supabase = getSupabaseAdmin();
  const payload = (await request.json().catch(() => ({}))) as LoginPayload;
  const email = asText(payload.email).trim().toLowerCase();
  const name = asText(payload.name).trim();
  const password = asText(payload.password);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError('Enter a valid email address.');
  }
  if (name.length < 2) return jsonError('Enter your name.');
  if (password.length < 8) return jsonError('Password must be at least 8 characters.');

  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existing) {
    return jsonError('This email already has an account. Please log in.', 409);
  }

  const { data: prior } = await supabase
    .from('customer_otps')
    .select('created_at')
    .eq('email', email)
    .maybeSingle();
  if (prior?.created_at && Date.now() - new Date(prior.created_at).getTime() < OTP_RESEND_COOLDOWN_MS) {
    return jsonError('Please wait a minute before requesting another code.', 429);
  }

  const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const nowIso = new Date().toISOString();
  const { error: upsertError } = await supabase.from('customer_otps').upsert(
    {
      email,
      otp_hash: sha256Hex(otp),
      expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
      attempts: 0,
      created_at: nowIso,
    },
    { onConflict: 'email' },
  );
  if (upsertError) return jsonError(upsertError.message, 500);

  const store = process.env.STORE_NAME ?? 'Chitra Tech';
  const minutes = Math.round(OTP_TTL_MS / 60000);
  const result = await sendEmail({
    to: email,
    subject: `${store} verification code: ${otp}`,
    html: `<p>Your ${store} verification code is</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${otp}</p><p>This code expires in ${minutes} minutes. If you didn&apos;t request it, you can ignore this email.</p>`,
    text: `Your ${store} verification code is ${otp}. It expires in ${minutes} minutes.`,
  });
  if (!result.sent) {
    console.warn('[customer/route] send-otp email failed:', result.error ?? result.provider);
    return jsonError('Could not send the code right now. Please try again shortly.', 502);
  }
  return NextResponse.json({ ok: true, message: 'Verification code sent.' });
}

// POST ?action=verify-otp — verifies the code and creates the account + session.
async function verifySignupOtp(request: Request) {
  const supabase = getSupabaseAdmin();
  const payload = (await request.json().catch(() => ({}))) as LoginPayload;
  const email = asText(payload.email).trim().toLowerCase();
  const name = asText(payload.name).trim();
  const password = asText(payload.password);
  const otp = asText(payload.otp).trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError('Enter a valid email address.');
  }
  if (name.length < 2) return jsonError('Enter your name.');
  if (password.length < 8) return jsonError('Password must be at least 8 characters.');
  if (!/^\d{6}$/.test(otp)) return jsonError('Enter the 6-digit code.');

  const { data: existing } = await supabase
    .from('customers')
    .select('id')
    .eq('email', email)
    .maybeSingle();
  if (existing) {
    return jsonError('This email already has an account. Please log in.', 409);
  }

  const { data: row } = await supabase
    .from('customer_otps')
    .select('otp_hash, expires_at, attempts')
    .eq('email', email)
    .maybeSingle();
  if (!row) return jsonError('Request a new code to continue.', 400);
  if (new Date((row as { expires_at: string }).expires_at).getTime() < Date.now()) {
    return jsonError('That code expired. Request a new one.', 400);
  }
  const attempts = (row as { attempts: number }).attempts ?? 0;
  if (attempts >= OTP_MAX_ATTEMPTS) {
    return jsonError('Too many attempts. Request a new code.', 429);
  }

  if ((row as { otp_hash: string }).otp_hash !== sha256Hex(otp)) {
    await supabase.from('customer_otps').update({ attempts: attempts + 1 }).eq('email', email);
    return jsonError('That code is incorrect.');
  }

  const id = emailCustomerId(email);
  const now = new Date().toISOString();
  const newRow: Record<string, unknown> = {
    id,
    method: 'email',
    role: 'customer',
    name: name || email.split('@')[0] || 'Customer',
    email,
    phone: '',
    photo: '',
    address: '',
    city: '',
    area: '',
    landmark: '',
    password_hash: hashPassword(password),
    created_at: now,
    updated_at: now,
  };
  const { data, error } = await supabase.from('customers').insert(newRow).select('*').single();
  if (error) {
    if (/duplicate|unique|already exists/i.test(error.message)) {
      return jsonError('This email already has an account. Please log in.', 409);
    }
    return jsonError(error.message, 500);
  }

  await supabase.from('customer_otps').delete().eq('email', email); // consume
  const token = await mintSession(supabase, id);
  return NextResponse.json({ user: sanitizeCustomer(data as CustomerRow), token });
}

export async function GET(request: Request) {
  try {
    const action = new URL(request.url).searchParams.get('action');
    if (action === 'account') return await getAccount(request);
    if (action === 'orders') return await getOrders(request);
    if (action === 'reviews') return await getReviews(request);
    if (action === 'cart') return await getCart(request);
    return jsonError('Unsupported customer action.', 404);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Customer request failed.', 500);
  }
}

export async function POST(request: Request) {
  try {
    const action = new URL(request.url).searchParams.get('action');
    if (action === 'account') return await upsertAccount(request);
    if (action === 'send-otp') return await sendSignupOtp(request);
    if (action === 'verify-otp') return await verifySignupOtp(request);
    if (action === 'checkout') return await checkout(request);
    if (action === 'reviews') return await saveReview(request);
    if (action === 'logout') return await logout(request);
    if (action === 'forgot') return await forgotPassword(request);
    if (action === 'cart') return await saveCart(request);
    return jsonError('Unsupported customer action.', 404);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Customer request failed.', 500);
  }
}

// Persistent cart (public.cart_items): one row per (customer_id, product_id).
// Session-authenticated; qty <= 0 removes the row. POST replaces the
// customer's whole cart with the posted lines (merge happens client-side).
async function getCart(request: Request) {
  const supabase = getSupabaseAdmin();
  const customerId = await getSessionCustomerId(supabase, getSessionToken(request));
  if (!customerId) return jsonError('Please log in to view your cart.', 401);
  const { data, error } = await supabase
    .from('cart_items')
    .select('product_id,qty')
    .eq('customer_id', customerId)
    .order('updated_at', { ascending: false });
  if (error) return jsonError(error.message, 500);
  const items = ((data ?? []) as { product_id?: unknown; qty?: unknown }[])
    .map((row) => ({
      id: String(row.product_id ?? ''),
      qty: Math.max(1, Math.floor(Number(row.qty ?? 1) || 1)),
    }))
    .filter((line) => line.id);
  return NextResponse.json({ cart: items });
}

async function saveCart(request: Request) {
  const supabase = getSupabaseAdmin();
  const customerId = await getSessionCustomerId(supabase, getSessionToken(request));
  if (!customerId) return jsonError('Please log in to save your cart.', 401);
  const payload = await request.json().catch(() => ({}));
  const raw = Array.isArray((payload as Record<string, unknown>).items)
    ? ((payload as Record<string, unknown>).items as unknown[])
    : [];
  // Merge duplicates client mistakes may send; cap at 200 distinct lines.
  const merged = new Map<string, number>();
  for (const entry of raw) {
    const record = asRecord(entry);
    const id = String(record.id ?? '').trim();
    const qty = Math.floor(Number(record.qty ?? 0) || 0);
    if (!id || qty <= 0 || merged.size >= 200) continue;
    merged.set(id, Math.min(99, (merged.get(id) ?? 0) + qty));
  }
  const now = new Date().toISOString();
  const { error: deleteError } = await supabase
    .from('cart_items')
    .delete()
    .eq('customer_id', customerId);
  if (deleteError) return jsonError(deleteError.message, 500);
  if (merged.size > 0) {
    const rows = [...merged.entries()].map(([productId, qty]) => ({
      customer_id: customerId,
      product_id: productId,
      qty,
      updated_at: now,
    }));
    const { error: insertError } = await supabase.from('cart_items').insert(rows);
    if (insertError) return jsonError(insertError.message, 500);
  }
  return NextResponse.json({ ok: true, count: merged.size });
}

export async function PATCH(request: Request) {
  try {
    const action = new URL(request.url).searchParams.get('action');
    if (action === 'account') return await updateAccount(request);
    if (action === 'orders') return await updateOrder(request);
    return jsonError('Unsupported customer action.', 404);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Customer request failed.', 500);
  }
}

export async function DELETE(request: Request) {
  try {
    const action = new URL(request.url).searchParams.get('action');
    if (action === 'reviews') return await deleteReview(request);
    return jsonError('Unsupported customer action.', 404);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Customer request failed.', 500);
  }
}




