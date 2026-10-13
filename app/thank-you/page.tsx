import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Thank You for Your Order | TechSelf",
};

export default function ThankYouPage() {
  return (
    <main>
      <section className="lg:pt-20 pt-14 pb-20">
        <div className="max-w-2xl mx-auto px-4 lg:px-6 text-center">
          <div className="mb-8">
            <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="w-10 h-10 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
          </div>
          <h1 className="text-4xl lg:text-5xl font-semibold text-gray-900 mb-4">
            Thank You for Your Order!
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            Your order has been successfully placed. We&apos;ve sent a
            confirmation email with your order details.
          </p>
          <div className="bg-gray-50 rounded-2xl p-8 mb-8">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Order Number:</span>
                <span className="font-semibold text-gray-900">#TGS-91798</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Estimated Delivery:</span>
                <span className="font-semibold text-gray-900">
                  3-5 business days
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              className="inline-flex items-center justify-center rounded-lg bg-teal-500 px-6 py-3 text-white font-medium transition hover:bg-teal-600"
              href="/shop"
            >
              Continue Shopping
            </a>
            <a
              className="inline-flex items-center justify-center rounded-lg border-2 border-gray-300 px-6 py-3 text-gray-700 font-medium transition hover:bg-gray-50"
              href="/"
            >
              Back to Home
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
