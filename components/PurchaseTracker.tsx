'use client';

import { useEffect } from 'react';
import { firePendingPurchase } from '@/lib/meta-purchase';

// Fires the backend-confirmed order stored by a successful checkout as a Meta
// Purchase — exactly once per order id (refresh/revisit safe). Rendered on
// the /thank-you confirmation surface; no-ops when there is no pending order
// (direct visits) or the same order was already recorded.
export default function PurchaseTracker() {
  useEffect(() => {
    void firePendingPurchase();
  }, []);

  return null;
}
