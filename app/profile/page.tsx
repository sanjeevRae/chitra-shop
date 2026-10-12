import type { Metadata } from 'next';
import ProfileDashboard from '../../components/ProfileDashboard';

export const metadata: Metadata = {
  title: 'Profile',
  description: 'Manage your Chitra account profile, orders, and reviews.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function ProfilePage() {
  return <ProfileDashboard />;
}
