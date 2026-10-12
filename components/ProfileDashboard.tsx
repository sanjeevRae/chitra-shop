'use client';

import { type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Camera } from 'lucide-react';
import { useCustomerAuth } from '../lib/customer-context';

// Customer profile dashboard: profile card + account settings only.
// Orders, order edits, and per-item reviews live at /orders
// (components/OrdersPage.tsx). Picture upload allows up to 5 MB.

type ProfileForm = {
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  area: string;
  landmark: string;
  photo: string;
};

const emptyForm: ProfileForm = {
  name: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  area: '',
  landmark: '',
  photo: '',
};

function initials(name: string) {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '?'
  );
}

const inputClass =
  'h-11 w-full border border-gray-300 bg-white px-4 text-base text-gray-800 placeholder:text-gray-400 outline-0 ring-3 ring-transparent focus:border-gray-900 focus:ring-gray-900/10';

export default function ProfileDashboard() {
  const { user, openLogin, updateProfile, authStatus, logout } = useCustomerAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<ProfileForm>(emptyForm);
  const [uploadStatus, setUploadStatus] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe profile prefill (SAUD parity)
    setForm({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      address: user.address || '',
      city: user.city || '',
      area: user.area || '',
      landmark: user.landmark || '',
      photo: user.photo || '',
    });
  }, [user]);


  const setField = (key: keyof ProfileForm, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const uploadAvatar = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setUploadStatus('Choose an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadStatus('Use an image smaller than 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setField('photo', String(reader.result || ''));
      setUploadStatus('New profile image ready. Save changes to keep it.');
    };
    reader.onerror = () => setUploadStatus('Could not read image.');
    reader.readAsDataURL(file);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void updateProfile(form);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setLoggingOut(false);
    }
  };

  // Hooks must run on every render in the same order — these stay above the
  // `if (!user)` early return so login/logout never changes the hook count.
  const displayName = useMemo(
    () => form.name.trim() || user?.name || user?.email || 'Customer',
    [form.name, user?.email, user?.name],
  );

  const completion = useMemo(() => {
    const fields = [form.name, form.email || form.phone, form.city, form.address, form.photo];
    const filled = fields.filter((field) => String(field || '').trim()).length;
    return Math.round((filled / fields.length) * 100);
  }, [form.address, form.city, form.email, form.name, form.phone, form.photo]);

  if (!user) {
    return (
      <main className="mx-auto max-w-7xl px-4 pb-20 pt-14 lg:px-6 lg:pt-20">
        <section className="border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-semibold text-gray-900">Login to view your dashboard</h1>
          <p className="mt-2 text-base text-gray-600">
            Track your orders, manage your address, and write product reviews.
          </p>
          <button
            onClick={openLogin}
            className="mt-6 bg-[#111111] px-6 py-3 text-base font-medium text-white hover:bg-[#333333] cursor-pointer"
          >
            Login / Register
          </button>
        </section>
      </main>
    );
  }

  const accountFields: [keyof ProfileForm, string, string][] = [
    ['name', 'Full name', 'Enter your name'],
    ['email', 'Email', 'example@gmail.com'],
    ['phone', 'Phone', '03xx xxxxxxx'],
    ['city', 'City', 'City'],
    ['area', 'Area', 'Area'],
    ['landmark', 'Landmark', 'Nearby landmark'],
  ];

  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 pt-14 lg:px-6 lg:pt-20">
      <nav className="mb-7 flex" aria-label="Breadcrumb">
        <ol className="inline-flex items-center space-x-1 md:space-x-2 text-sm">
          <li className="inline-flex items-center">
            <Link className="inline-flex items-center gap-1 text-gray-500 hover:text-gray-900" href="/">
              Home
            </Link>
          </li>
          <li aria-current="page">
            <span className="font-medium text-gray-900">Profile</span>
          </li>
        </ol>
      </nav>
      <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="h-fit border border-gray-200 bg-white p-6 shadow-sm lg:sticky lg:top-24">
          <div className="flex flex-col items-center text-center">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative h-32 w-32 overflow-hidden rounded-full bg-[#111111] text-white ring-4 ring-gray-200 cursor-pointer"
              aria-label="Upload profile image"
            >
              {form.photo ? (
                <img src={form.photo} alt={displayName} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-4xl font-semibold">
                  {initials(displayName)}
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/65 py-2 text-xs font-semibold">
                <Camera size={14} /> Upload
              </span>
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={uploadAvatar} className="hidden" />
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-[#111111]">
              Customer profile
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-gray-900">{displayName}</h1>
            <p className="mt-2 text-sm text-gray-500">{form.email || form.phone || 'Add contact info'}</p>
            {uploadStatus && <p className="mt-3 text-sm text-gray-500">{uploadStatus}</p>}
          </div>
          <div className="mt-6 border-t border-gray-100 pt-5">
            <div className="flex items-center justify-between text-sm text-gray-700">
              <span className="font-semibold">Profile completion</span>
              <span>{completion}%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-gray-100">
              <div className="h-full rounded-full bg-[#111111]" style={{ width: `${completion}%` }} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            disabled={loggingOut}
            className="mt-6 w-full border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:border-gray-900 hover:text-gray-900 disabled:opacity-60 cursor-pointer"
          >
            {loggingOut ? 'Logging out...' : 'Log out'}
          </button>
        </aside>
        <section className="space-y-6">
          <form onSubmit={submit} className="border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="border-b border-gray-100 pb-5">
              <div className="flex w-full items-center justify-between gap-4 text-left"
              >
                <span>
                  <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-[#111111]">
                    Account settings
                  </span>
                  <span className="mt-1 block text-2xl font-semibold text-gray-900">
                    Contact and shipping details
                  </span>
                  <span className="mt-1 block text-sm text-gray-500">
                    {completion}% complete / {form.city || 'No city set'}
                    {form.area ? `, ${form.area}` : ''}
                  </span>
                </span>
              </div>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {accountFields.map(([field, label, placeholder]) => (
                <label key={field} className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-600">{label}</span>
                  <input
                    value={form[field]}
                    onChange={(event) => setField(field, event.target.value)}
                    placeholder={placeholder}
                    className={inputClass}
                  />
                </label>
              ))}
              <label className="block sm:col-span-2">
                <span className="mb-2 block text-sm font-medium text-gray-600">Full address</span>
                <textarea
                  value={form.address}
                  onChange={(event) => setField('address', event.target.value)}
                  placeholder="House, street, area"
                  className="min-h-20 w-full border border-gray-300 bg-white px-4 py-2.5 text-base text-gray-800 placeholder:text-gray-400 outline-0 ring-3 ring-transparent focus:border-gray-900 focus:ring-gray-900/10"
                />
              </label>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-5">
              <button className="bg-[#111111] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#333333] cursor-pointer">
                Save changes
              </button>
              {authStatus && <p className="text-sm text-gray-500">{authStatus}</p>}
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}



