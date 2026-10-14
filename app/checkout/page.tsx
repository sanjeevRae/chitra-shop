import { redirect } from 'next/navigation';

// Legacy route: the current checkout process lives in /cart (CartPage
// checkout step - Rs. totals, voucher, delivery, COD). Forward here so old
// links and bookmarks keep working instead of landing on stale hardcoded totals.
export default function CheckoutRedirect() {
  redirect('/cart');
}
