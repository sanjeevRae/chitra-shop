import type { MetadataRoute } from 'next';

// Same resolution order as app/layout.tsx so the declared sitemap origin always
// matches the canonical origin used by metadataBase / our OG tags.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://shop.chitratech.com.np').replace(/\/$/, '');

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // /admin 404s without a session cookie; /api/ is not for crawlers; the
        // rest are logged-in or transactional pages with no index value.
        disallow: ['/admin', '/api/', '/cart', '/checkout', '/orders', '/profile', '/thank-you'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
