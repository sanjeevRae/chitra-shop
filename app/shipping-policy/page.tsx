import type { Metadata } from 'next';
import PolicyPage from '@/components/PolicyPage';

// Admin edits to cms_items must show up without a redeploy.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Shipping Policy',
  description: 'Shipping times, rates, and delivery information for Chitra Tech orders.',
};

export default function ShippingPolicyPage() {
  return <PolicyPage slug="shipping-policy" fallbackTitle="Shipping Policy" />;
}
