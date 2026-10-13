'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import Header from './Header';
import Footer from './Footer';
import CartDrawer from './CartDrawer';
import CartNotice from './CartNotice';
import WishlistDrawer from './WishlistDrawer';
import LoginModal from './LoginModal';
import MetaPixel from './MetaPixel';

export default function SiteChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAdmin = Boolean(pathname?.startsWith('/admin'));

  // The admin dashboard renders without the storefront header, footer and drawers.
  if (isAdmin) {
    return <>{children}</>;
  }

  return (
    <>
      <MetaPixel />
      <Header />
      {children}
      <Footer />
      <CartDrawer />
      <CartNotice />
      <WishlistDrawer />
      <LoginModal />
    </>
  );
}
