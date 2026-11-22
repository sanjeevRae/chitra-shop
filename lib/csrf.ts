// CSRF protection for Chitra E-commerce.
//
// validateOrigin(request) checks the Origin header, then falls back to Referer,
// against an allowlist built from NEXT_PUBLIC_APP_URL and
// https://shop.chitratech.com.np. Fails closed if neither header is present.
//
// Call this as the first line of every POST/PATCH/DELETE handler in:
//   app/api/customer/route.ts
//   app/api/admin/route.ts
//   app/api/cloudinary/route.ts

const ALLOWED_ORIGINS = new Set([
  process.env.NEXT_PUBLIC_APP_URL ?? 'https://shop.chitratech.com.np',
  'https://shop.chitratech.com.np',
]);

export function validateOrigin(request: Request): { ok: true } | { ok: false; error: string } {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  // Fail closed: no Origin and no Referer means we cannot verify the request
  // came from our own site.
  if (!origin && !referer) {
    return { ok: false, error: 'Missing Origin or Referer header.' };
  }

  const checkOrigin = (value: string | null): boolean => {
    if (!value) return false;
    try {
      const url = new URL(value);
      return ALLOWED_ORIGINS.has(url.origin);
    } catch {
      return false;
    }
  };

  if (origin && !checkOrigin(origin)) {
    return { ok: false, error: 'Origin not allowed.' };
  }

  if (referer && !checkOrigin(referer)) {
    return { ok: false, error: 'Referer not allowed.' };
  }

  return { ok: true };
}
