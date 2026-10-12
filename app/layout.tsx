import type { Metadata } from 'next';
import { DM_Sans } from 'next/font/google';
import './globals.css';
import { StoreProvider } from '../lib/store';
import { CustomerAuthProvider } from '../lib/customer-context';
import SiteChrome from '../components/SiteChrome';

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' });

export const metadata: Metadata = {
  title: 'TechShelf - Electronics eCommerce Template',
  description:
    'TechShelf - Electronics eCommerce template built with Next.js. Shop smart devices, audio, accessories and more.',
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
