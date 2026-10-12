// Server-only order-status customer emails sent over SMTP via nodemailer.
//
// Provider order (first configured wins, then fallback):
//   1. Brevo  — smtp-relay.brevo.com (BREVO_API_KEY is the SMTP password; set
//               BREVO_SMTP_USER to your Brevo SMTP login, e.g. 9xxxxx@smtp-brevo.com)
//   2. Resend — smtp.resend.com       (RESEND_API_KEY is the SMTP password; the
//               SMTP username is always "resend")
// These keys are SMTP credentials, so we authenticate over SMTP directly
// (STARTTLS on port 587 by default). If a provider's SMTP send fails, we fall
// back to the next configured provider.
//
// Contract:
//   • sendOrderStatusEmail() NEVER throws. Any failure (no provider, no customer
//     email, timeout, auth error, network error) resolves to { sent: false, ... }
//     and only logs. The admin status update returns 200 regardless.
//   • A notification is only sent for statuses in STATUS_NOTICES below;
//     unknown statuses (e.g. "pending_cod") resolve to no notification.
//
// The admin PATCH ?action=orders handler already guards against re-emailing on
// an unchanged status, so this module emails exactly once per real change.

import nodemailer from 'nodemailer';

type OrderLike = {
  id?: string | null;
  customer?: unknown;
  items?: unknown;
  total?: number | string | null;
  delivery_label?: string | null;
  payment_method?: string | null;
  shipping_address?: unknown;
  status?: string | null;
  created_at?: string | null;
};

export type SendResult =
  | { sent: true; provider: 'brevo' | 'resend'; to: string }
  | { sent: false; reason: string };

const TIMEOUT_MS = 8000;

// Sender identity. Override via env so it matches a sender you have verified
// in Brevo/Resend (unverified senders are rejected by both providers).
const STORE_NAME = (process.env.STORE_NAME || 'Chitra Shop').trim();
const EMAIL_FROM = (process.env.EMAIL_FROM || 'no-reply@chitrashop.com.np').trim();
const SUPPORT_EMAIL = (process.env.SUPPORT_EMAIL || '').trim();
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || '').trim();

type SmtpConfig = {
  provider: 'brevo' | 'resend';
  host: string;
  port: number;
  user: string;
  pass: string;
};

// Ordered list of configured SMTP providers (Brevo first, then Resend as a
// fallback). BREVO_API_KEY / RESEND_API_KEY are used as the SMTP passwords.
function smtpProviders(): SmtpConfig[] {
  const providers: SmtpConfig[] = [];

  const brevoPass = (process.env.BREVO_API_KEY || '').trim();
  if (brevoPass) {
    providers.push({
      provider: 'brevo',
      host: (process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com').trim(),
      port: Number(process.env.BREVO_SMTP_PORT || 587) || 587,
      // Brevo SMTP login is your account email; override via BREVO_SMTP_USER.
      user: (process.env.BREVO_SMTP_USER || EMAIL_FROM).trim(),
      pass: brevoPass,
    });
  }

  const resendPass = (process.env.RESEND_API_KEY || '').trim();
  if (resendPass) {
    providers.push({
      provider: 'resend',
      host: (process.env.RESEND_SMTP_HOST || 'smtp.resend.com').trim(),
      port: Number(process.env.RESEND_SMTP_PORT || 587) || 587,
      // Resend SMTP username is always "resend".
      user: (process.env.RESEND_SMTP_USER || 'resend').trim(),
      pass: resendPass,
    });
  }

  return providers;
}

type StatusNotice = {
  subject: string;
  heading: string;
  intro: string;
  tone: string; // accent color for the badge/button in the HTML email
};

// Human copy per status the admin can set in InsightDashboard. Keys must match
// the exact `value`s used there: pending_cod | processing | shipped | delivered
// | cancelled | returned.
const STATUS_NOTICES: Record<string, StatusNotice> = {
  processing: {
    subject: 'We are preparing your order',
    heading: 'Your order is being prepared',
    intro: 'Good news — we have started preparing your order. We will let you know as soon as it ships.',
    tone: '#7e22ce',
  },
  shipped: {
    subject: 'Your order has shipped',
    heading: 'Your package is on the way',
    intro: 'Your order has been handed to our delivery partner and is on its way to you.',
    tone: '#1d4ed8',
  },
  delivered: {
    subject: 'Your order has been delivered',
    heading: 'Delivered — enjoy!',
    intro: 'Your order has been delivered. We hope you love your purchase. If anything is wrong, reply to this email and we will make it right.',
    tone: '#15803d',
  },
  cancelled: {
    subject: 'Your order has been cancelled',
    heading: 'Your order was cancelled',
    intro: 'Your order has been cancelled as requested. If you did not expect this or have any questions, please contact our support team.',
    tone: '#b91c1c',
  },
  returned: {
    subject: 'Your return has been received',
    heading: 'Your return has been received',
    intro: 'We have received your returned item and it is being processed. Any applicable refund will follow our refund policy.',
    tone: '#0369a1',
  },
};

// --- Field extraction (robust to the two shapes `customer` is stored in) ---

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

// Unwrap { user: {...} } when present, else use the object directly.
function customerObject(order: OrderLike): Record<string, unknown> | null {
  const c = asRecord(order.customer);
  if (!c) return null;
  const user = asRecord(c.user);
  return user ?? c;
}

function customerEmail(order: OrderLike): string {
  const c = customerObject(order);
  const addr = asRecord(order.shipping_address);
  return str(c?.email) || str(addr?.email) || '';
}

function customerName(order: OrderLike): string {
  const c = customerObject(order);
  const addr = asRecord(order.shipping_address);
  return str(c?.name) || str(addr?.fullName) || 'Customer';
}

// Short, human-friendly order reference (first 8 chars of the UUID, upper).
function orderNumber(order: OrderLike): string {
  const id = str(order.id);
  return id ? id.slice(0, 8).toUpperCase() : '';
}

function itemCount(order: OrderLike): number {
  return Array.isArray(order.items) ? order.items.length : 0;
}

function formatMoney(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '';
  // Prices are stored in NPR (Rs.).
  return `Rs. ${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- Email body builders (HTML + plaintext) ---

function buildHtml(notice: StatusNotice, order: OrderLike): string {
  const name = escapeHtml(customerName(order));
  const heading = escapeHtml(notice.heading);
  const intro = escapeHtml(notice.intro);
  const orderNo = escapeHtml(orderNumber(order));
  const total = formatMoney(order.total);
  const count = itemCount(order);
  const itemsLine = count === 1 ? '1 item' : `${count} items`;

  const orderRows = [
    orderNo ? `<strong>Order number</strong><br />${orderNo}` : '',
    count ? `<strong>Items</strong><br />${escapeHtml(itemsLine)}` : '',
    total ? `<strong>Order total</strong><br />${escapeHtml(total)}` : '',
  ]
    .filter(Boolean)
    .join('');

  const supportLine = SUPPORT_EMAIL
    ? `<p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Questions? Reply to this email or contact us at ${escapeHtml(SUPPORT_EMAIL)}.</p>`
    : `<p style="margin:16px 0 0;font-size:13px;color:#6b7280;">Questions? Just reply to this email — we're happy to help.</p>`;

  const trackLink = SITE_URL
    ? `<a href="${escapeHtml(SITE_URL)}/orders" style="display:inline-block;margin-top:20px;padding:12px 22px;background:${notice.tone};color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">View my order</a>`
    : '';

  return [
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111827;">`,
    `<h2 style="margin:0 0 8px;font-size:20px;">${heading}</h2>`,
    `<p style="margin:0 0 16px;font-size:15px;color:#374151;">Hi ${name},</p>`,
    `<p style="margin:0 0 20px;font-size:15px;color:#374151;">${intro}</p>`,
    orderRows
      ? `<div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;font-size:14px;line-height:1.7;color:#111827;">${orderRows}</div>`
      : '',
    trackLink,
    `<hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0 12px;" />`,
    `<p style="margin:0;font-size:13px;color:#6b7280;">${escapeHtml(STORE_NAME)}</p>`,
    supportLine,
    `</div>`,
  ].join('');
}

function buildText(notice: StatusNotice, order: OrderLike): string {
  const name = customerName(order);
  const lines = [`Hi ${name},`, '', notice.intro, ''];
  const orderNo = orderNumber(order);
  const total = formatMoney(order.total);
  const count = itemCount(order);
  if (orderNo) lines.push(`Order number: ${orderNo}`);
  if (count) lines.push(`Items: ${count}`);
  if (total) lines.push(`Order total: ${total}`);
  if (SITE_URL) lines.push(`Track: ${SITE_URL}/orders`);
  lines.push('', STORE_NAME);
  if (SUPPORT_EMAIL) lines.push(`Support: ${SUPPORT_EMAIL}`);
  return lines.join('\n');
}

function subjectFor(notice: StatusNotice, order: OrderLike): string {
  const orderNo = orderNumber(order);
  return orderNo ? `${notice.subject} — Order ${orderNo}` : notice.subject;
}


// --- SMTP transport (nodemailer) ---

type EmailParams = {
  to: string;
  toName: string;
  subject: string;
  html: string;
  text: string;
};

async function sendViaSmtp(config: SmtpConfig, params: EmailParams): Promise<SendResult> {
  try {
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465, // true for implicit TLS (465), STARTTLS otherwise (587)
      auth: { user: config.user, pass: config.pass },
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
    });
    await transporter.sendMail({
      from: { name: STORE_NAME, address: EMAIL_FROM },
      to: { name: params.toName, address: params.to },
      subject: params.subject,
      html: params.html,
      text: params.text,
      ...(SUPPORT_EMAIL ? { replyTo: SUPPORT_EMAIL } : {}),
    });
    transporter.close();
    return { sent: true, provider: config.provider, to: params.to };
  } catch (error) {
    console.warn(
      `[order-emails] ${config.provider} SMTP error:`,
      error instanceof Error ? error.message : error,
    );
    return { sent: false, reason: `${config.provider}-smtp-error` };
  }
}

// --- Public entry point ---

export async function sendOrderStatusEmail(
  order: OrderLike,
  newStatus: string,
): Promise<SendResult> {
  const notice = STATUS_NOTICES[newStatus];
  if (!notice) return { sent: false, reason: 'no-notification-for-status' };

  const to = customerEmail(order);
  if (!to) return { sent: false, reason: 'no-customer-email' };

  // Need at least one provider configured; otherwise skip quietly.
  const providers = smtpProviders();
  if (providers.length === 0) {
    console.warn('[order-emails] No BREVO_API_KEY/RESEND_API_KEY set — skipping status email.');
    return { sent: false, reason: 'no-provider-configured' };
  }

  const params: EmailParams = {
    to,
    toName: customerName(order),
    subject: subjectFor(notice, order),
    html: buildHtml(notice, order),
    text: buildText(notice, order),
  };

  // Try each configured provider in order (Brevo first, then Resend) until one
  // succeeds. This gives automatic fallback if a provider is down.
  for (const config of providers) {
    const result = await sendViaSmtp(config, params);
    if (result.sent) return result;
  }

  return { sent: false, reason: 'all-providers-failed' };
}

// Generic transactional email sender reusing the same SMTP transport + provider
// fallback as sendOrderStatusEmail. Used for OTP signup codes and similar
// non-order mail. Never throws.
export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<{ sent: boolean; provider?: string; error?: string }> {
  const to = input.to.trim();
  if (!to) return { sent: false, error: 'no-recipient' };

  const providers = smtpProviders();
  if (providers.length === 0) {
    console.warn('[order-emails] No BREVO_API_KEY/RESEND_API_KEY set — skipping email.');
    return { sent: false, error: 'no-provider-configured' };
  }

  const params: EmailParams = {
    to,
    toName: to,
    subject: input.subject,
    html: input.html,
    text: input.text,
  };

  for (const config of providers) {
    const result = await sendViaSmtp(config, params);
    if (result.sent) return { sent: true, provider: result.provider };
  }
  return { sent: false, error: 'all-providers-failed' };
}

