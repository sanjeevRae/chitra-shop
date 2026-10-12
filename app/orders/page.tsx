import type { Metadata } from 'next';
import OrdersPage from '../../components/OrdersPage';

export const metadata: Metadata = {
  title: 'Orders | Chitra Electronics',
  description: 'Track, edit, or cancel your Chitra orders.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function Orders() {
  return <OrdersPage />;
}
