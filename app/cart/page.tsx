import type { Metadata } from 'next';
import CartPage from '../../components/CartPage';

export const metadata: Metadata = {
  title: 'Cart | Chitra Electronics',
  description: 'Review your selected products and proceed to checkout.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function Cart() {
  return <CartPage />;
}
