// Security headers for Chitra E-commerce.
//
// Build a headers array for next.config.ts async headers().
// CSP starts in report-only mode; switch to enforce once the policy is proven.

export const CSP_REPORT_ONLY = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://connect.facebook.net https://www.google-analytics.com;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  img-src 'self' data: https: blob:;
  connect-src 'self' https://api.cloudinary.com https://res.cloudinary.com https://kbgshexjackuikkveohe.supabase.co https://api.groq.com https://connect.facebook.net https://www.google-analytics.com https://smtp-relay.brevo.com https://smtp.resend.com;
  frame-src 'none';
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`.trim().replace(/\s+/g, ' ');

export const CSP_ENFORCE = CSP_REPORT_ONLY
  .replace('default-src', 'default-src')
  .replace(/report-only/g, '');

export function buildSecurityHeaders(reportOnly = true): { source: string; headers: Record<string, string> }[] {
  const csp = reportOnly ? CSP_REPORT_ONLY : CSP_ENFORCE;
  const cspHeader = reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy';

  return [
    {
      source: '/(.*)',
      headers: {
        [cspHeader]: csp,
        'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
        'X-Frame-Options': 'DENY',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
        'X-DNS-Prefetch-Control': 'off',
        'X-XSS-Protection': '0',
      },
    },
  ];
}
