import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import './globals.css';
import { StoreProvider } from '../lib/store';
import { CustomerAuthProvider } from '../lib/customer-context';
import SiteChrome from '../components/SiteChrome';

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' });

// Social sharing (Open Graph / Twitter). WhatsApp, Facebook, Messenger etc.
// read these tags to build the link preview card.
const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://chitratech.com.np').replace(/\/$/, '');
const SITE_NAME = 'Chitra Tech';
const OG_IMAGE = `${SITE_URL}/images/logo/logo.png`;
const SITE_DESCRIPTION =
  'Shop smart devices, audio, accessories and more at Chitra Tech. Fast delivery across Nepal with Cash on Delivery and secure online payment.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Chitra Tech — Electronics & Accessories Store',
    template: '%s | Chitra Tech',
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: 'Chitra Tech — Electronics & Accessories Store',
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    images: [{ url: OG_IMAGE, alt: 'Chitra Tech' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Chitra Tech — Electronics & Accessories Store',
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={dmSans.variable}>
      <body>
        <StoreProvider>
          <CustomerAuthProvider>
            <div className="antialiased">
              <SiteChrome>{children}</SiteChrome>
            </div>
          </CustomerAuthProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
