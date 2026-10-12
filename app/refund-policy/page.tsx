import type { Metadata } from 'next';
import PolicyPage from '@/components/PolicyPage';

// Admin edits to cms_items must show up without a redeploy.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Refund Policy',
  description: 'Refund policy for Chitra Tech purchases.',
};

export default function RefundPolicyPage() {
  return <PolicyPage slug="refund-policy" fallbackTitle="Refund Policy" />;
}
