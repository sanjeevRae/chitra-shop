import type { Metadata } from 'next';
import PolicyPage from '@/components/PolicyPage';

// Admin edits to cms_items must show up without a redeploy.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of service for using Chitra Tech.',
};

export default function TermsOfServicePage() {
  return <PolicyPage slug="terms-of-service" fallbackTitle="Terms of Service" />;
}
