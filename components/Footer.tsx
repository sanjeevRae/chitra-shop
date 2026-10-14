'use client';

import { trackMetaEvent } from '../lib/meta-pixel';

export default function Footer() {
  return (
<footer>
  <div className="bg-gray-100 py-16 lg:py-28">
    <div className="max-w-7xl mx-auto px-4 xl:px-0">
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-12 xl:gap-20">
        <div className="lg:col-span-3">
          <a className="mb-6 block" href="/">
            <img
              alt="techself"
              src="/images/logo/footer-logo.png"
              className="h-14 w-auto object-contain"
            />
          </a>
          <p className="text-base text-gray-500">
            Discover products you&apos;ll love, at prices you&apos;ll appreciate. Shop with confidence and enjoy a simple, convenient shopping experience.
          </p>
          <div className="mt-6 sm:mt-10 lg:mt-14">
            <p className="mb-2 text-gray-500 text-base">
              Follow us on
            </p>
            <div className="flex gap-5">
              <a href="https://www.facebook.com/people/Chitra-Tech/61589090079956/" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-700">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <g clipPath="url(#clip0_facebook)">
                    <path d="M18 9.05469C18 4.08412 13.9706 0.0546875 9 0.0546875C4.02943 0.0546875 0 4.08412 0 9.05469C0 13.5468 3.29115 17.2702 7.59375 17.9454V11.6562H5.30859V9.05469H7.59375V7.07188C7.59375 4.81625 8.93742 3.57031 10.9932 3.57031C11.9776 3.57031 13.0078 3.74609 13.0078 3.74609V5.96094H11.873C10.755 5.96094 10.4062 6.65475 10.4062 7.36719V9.05469H12.9023L12.5033 11.6562H10.4062V17.9454C14.7088 17.2702 18 13.5468 18 9.05469Z" fill="currentColor" />
                  </g>
                  <defs>
                    <clipPath id="clip0_facebook">
                      <rect width="18" height="18" fill="white" />
                    </clipPath>
                  </defs>
                </svg>
              </a>
              <a href="https://www.instagram.com/chitra.tech" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-700">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <g clipPath="url(#clip0_instagram)">
                    <path d="M9.92477 0C10.9377 0.00167406 11.451 0.00703828 11.8945 0.0202418L12.0692 0.025948C12.271 0.0331213 12.4701 0.0421215 12.7101 0.0533719C13.6678 0.0976265 14.3212 0.249129 14.8949 0.471887C15.4881 0.700648 15.9892 1.00966 16.4894 1.50993C16.9889 2.0102 17.298 2.51271 17.5275 3.10448C17.7495 3.67751 17.901 4.33153 17.946 5.28931C17.9568 5.52933 17.9654 5.72841 17.9725 5.93024L17.9782 6.10492C17.9913 6.5484 17.9973 7.06177 17.9992 8.07471L18 8.74577C18 8.82777 18 8.91237 18 8.99967L18 9.25357L17.9994 9.92472C17.9977 10.9376 17.9924 11.451 17.9792 11.8944L17.9734 12.0691C17.9663 12.271 17.9573 12.4701 17.946 12.7101C17.9018 13.6679 17.7495 14.3211 17.5275 14.8949C17.2987 15.4882 16.9889 15.9892 16.4894 16.4895C15.9892 16.989 15.4859 17.298 14.8949 17.5275C14.3212 17.7495 13.6678 17.901 12.7101 17.946C12.4701 17.9567 12.271 17.9654 12.0692 17.9725L11.8945 17.9781C11.451 17.9914 10.9377 17.9973 9.92477 17.9993L9.25362 18C9.17162 18 9.08702 18 8.99972 18H8.74582L8.07466 17.9994C7.06177 17.9977 6.5484 17.9924 6.10491 17.9791L5.93023 17.9734C5.7284 17.9662 5.52932 17.9572 5.28931 17.946C4.33152 17.9018 3.679 17.7495 3.10448 17.5275C2.51196 17.2988 2.01019 16.989 1.50992 16.4895C1.00966 15.9892 0.701396 15.4859 0.471887 14.8949C0.249129 14.3211 0.0983738 13.6679 0.0533721 12.7101C0.0426797 12.4701 0.0339583 12.271 0.026893 12.0691L0.0212319 11.8944C0.00806437 11.451 0.00206123 10.9376 0.000117163 9.92472L0 8.07471C0.00167406 7.06177 0.00702927 6.5484 0.0202327 6.10492L0.025948 5.93024C0.0331213 5.72841 0.0421217 5.52933 0.0533721 5.28931C0.0976177 4.33078 0.249129 3.67825 0.471887 3.10448C0.70064 2.51196 1.00966 2.0102 1.50992 1.50993C2.01019 1.00966 2.51271 0.701396 3.10448 0.471887C3.67825 0.249129 4.33078 0.0983735 5.28931 0.0533719C5.52932 0.0426885 5.7284 0.0339673 5.93023 0.026902L6.10491 0.0212407C6.5484 0.00806417 7.06177 0.00206102 8.07466 0.000116949L9.92477 0ZM8.99972 4.49953C6.513 4.49953 4.49953 6.51518 4.49953 8.99967C4.49953 11.4864 6.51519 13.4998 8.99972 13.4998C11.4864 13.4998 13.4999 11.4842 13.4999 8.99967C13.4999 6.513 11.4842 4.49953 8.99972 4.49953ZM8.99972 6.2996C10.491 6.2996 11.6998 7.50805 11.6998 8.99967C11.6998 10.4909 10.4913 11.6998 8.99972 11.6998C7.50845 11.6998 6.2996 10.4914 6.2996 8.99967C6.2996 7.50841 7.508 6.2996 8.99972 6.2996ZM13.7249 3.14949C13.1045 3.14949 12.5998 3.65342 12.5998 4.27376C12.5998 4.89411 13.1038 5.39882 13.7249 5.39882C14.3452 5.39882 14.8499 4.89489 14.8499 4.27376C14.8499 3.65342 14.3444 3.14871 13.7249 3.14949Z" fill="currentColor" />
                  </g>
                  <defs>
                    <clipPath id="clip0_instagram">
                      <rect width="18" height="18" fill="white" />
                    </clipPath>
                  </defs>
                </svg>
              </a>
              <a href="https://www.linkedin.com/company/chitratech" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-700">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <g clipPath="url(#clip0_linkedin)">
                    <path d="M16.6676 0H1.32891C0.594141 0 0 0.580078 0 1.29727V16.6992C0 17.4164 0.594141 18 1.32891 18H16.6676C17.4023 18 18 17.4164 18 16.7027V1.29727C18 0.580078 17.4023 0 16.6676 0ZM5.34023 15.3387H2.66836V6.74648H5.34023V15.3387ZM4.0043 5.57578C3.14648 5.57578 2.45391 4.8832 2.45391 4.02891C2.45391 3.17461 3.14648 2.48203 4.0043 2.48203C4.85859 2.48203 5.55117 3.17461 5.55117 4.02891C5.55117 4.87969 4.85859 5.57578 4.0043 5.57578ZM15.3387 15.3387H12.6703V11.1621C12.6703 10.1672 12.6527 8.88398 11.2816 8.88398C9.89297 8.88398 9.68203 9.97031 9.68203 11.0918V15.3387H7.01719V6.74648H9.57656V7.9207H9.61172C9.9668 7.2457 10.8387 6.53203 12.1359 6.53203C14.8395 6.53203 15.3387 8.31094 15.3387 10.6242V15.3387Z" fill="currentColor" />
                  </g>
                  <defs>
                    <clipPath id="clip0_linkedin">
                      <rect width="18" height="18" fill="white" />
                    </clipPath>
                  </defs>
                </svg>
              </a>
  <a
  href="https://www.tiktok.com/@chitratech"
  target="_blank"
  rel="noopener noreferrer"
  aria-label="TikTok"
  className="text-gray-400 hover:text-gray-700 transition-colors"
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M19.589 6.686a4.793 4.793 0 0 1-3.77-4.192V2h-4.017v13.54a2.896 2.896 0 0 1-2.9 2.9 2.896 2.896 0 0 1-2.9-2.9 2.896 2.896 0 0 1 2.9-2.9c.304 0 .6.048.88.14V8.68a7.02 7.02 0 0 0-.88-.057 6.917 6.917 0 1 0 6.917 6.917V8.63a8.76 8.76 0 0 0 5.12 1.65V6.265a4.83 4.83 0 0 1-1.35-.21Z" />
  </svg>
</a>
            </div>
          </div>
        </div>


<div className="lg:col-span-9">
<div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3 xl:grid-cols-5">
  {/* Mobile & Accessories */}
  <div>
    <h4 className="text-lg font-semibold text-gray-800 mb-6">
      Mobile & Accessories
    </h4>
    <nav>
      <ul className="space-y-3">
        {[
          "Phone",
          "Tablet Accessories",
          "Mobile Accessories",
          "Charger & Cable",
          "Power Bank",
          "Batteries",
        ].map((category) => (
          <li key={category}>
            <a
              className="text-gray-500 leading-6 font-medium hover:text-gray-800 transition-colors"
              href={`/product?search=${encodeURIComponent(category)}`}
            >
              {category}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  </div>

  {/* Computers & Networking */}
  <div>
    <h4 className="text-lg font-semibold text-gray-800 mb-6">
      Computers & Networking
    </h4>
    <nav>
      <ul className="space-y-3">
        {[
          "Computer Accessories",
          "Laptop",
          "Storage Devices",
          "Printer & Supplies",
          "Networking",
          "Gaming",
        ].map((category) => (
          <li key={category}>
            <a
              className="text-gray-500 leading-6 font-medium hover:text-gray-800 transition-colors"
              href={`/product?search=${encodeURIComponent(category)}`}
            >
              {category}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  </div>

  {/* Audio, Video & Imaging */}
  <div>
    <h4 className="text-lg font-semibold text-gray-800 mb-6">
      Audio, Video & Imaging
    </h4>
    <nav>
      <ul className="space-y-3">
        {[
          "Earphone",
          "Speaker",
          "Audio Equipment",
          "Camera",
          "TV",
          "Projector",
        ].map((category) => (
          <li key={category}>
            <a
              className="text-gray-500 leading-6 font-medium hover:text-gray-800 transition-colors"
              href={`/product?search=${encodeURIComponent(category)}`}
            >
              {category}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  </div>

  {/* Home & Lifestyle */}
  <div>
    <h4 className="text-lg font-semibold text-gray-800 mb-6">
      Home & Lifestyle
    </h4>
    <nav>
      <ul className="space-y-3">
        {[
          "Lighting",
          "Home Appliances",
          "Smart Home",
          "Personal Care",
          "Fashion",
          "Sports & Outdoors",
        ].map((category) => (
          <li key={category}>
            <a
              className="text-gray-500 leading-6 font-medium hover:text-gray-800 transition-colors"
              href={`/product?search=${encodeURIComponent(category)}`}
            >
              {category}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  </div>

  {/* Security, Auto & Tools */}
  <div>
    <h4 className="text-lg font-semibold text-gray-800 mb-6">
      Security, Auto & Tools
    </h4>
    <nav>
      <ul className="space-y-3">
        {[
          "CCTV & Security",
          "Car Electronics",
          "Auto Parts",
          "Tools & Testers",
          "Watch",
          "Drones",
        ].map((category) => (
          <li key={category}>
            <a
              className="text-gray-500 leading-6 font-medium hover:text-gray-800 transition-colors"
              href={`/product?search=${encodeURIComponent(category)}`}
            >
              {category}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  </div>
</div>
</div>


       
        
      </div>
    </div>
  </div>
  <div className="max-w-7xl mx-auto px-4 xl:px-0">
    <div className="flex flex-col lg:flex-row lg:items-center divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
      <div className="flex justify-center flex-col sm:flex-row gap-3 items-center py-6 lg:py-5 lg:pr-5 xl:pr-16">
        <div className="bg-gray-100 w-10 h-10 rounded-lg inline-flex items-center justify-center text-gray-700">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M20.0001 17.0518V12C20.0001 7.58174 16.4183 4 12 4C7.58174 4 4 7.58174 4 12V17.0518M19.9998 14.041V19.75C19.9998 20.5784 19.3282 21.25 18.4998 21.25H13.9998M6.50006 18.75H5.50006C4.67163 18.75 4.00006 18.0784 4.00006 17.25V13.75C4.00006 12.9216 4.67163 12.25 5.50006 12.25H6.50006C7.32849 12.25 8.00006 12.9216 8.00006 13.75V17.25C8.00006 18.0784 7.32849 18.75 6.50006 18.75ZM17.5 18.75H18.5C19.3284 18.75 20 18.0784 20 17.25V13.75C20 12.9216 19.3284 12.25 18.5 12.25H17.5C16.6716 12.25 16 12.9216 16 13.75V17.25C16 18.0784 16.6716 18.75 17.5 18.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="shrink-0 text-center sm:text-left">
          <p className="text-xs text-gray-700">
            8:30 AM - 10:30 PM
          </p>
          <button
            type="button"
            onClick={() => trackMetaEvent('Contact', { content_category: 'phone' })}
            className="text-sm font-semibold text-gray-800"
          >
            +977-9712039906/ 9712039923
          </button>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row items-center justify-center py-6 lg:py-5 lg:px-5 xl:px-16 gap-3">
        <div className="text-center sm:text-left">
          <span className="text-sm mb-1 block font-semibold text-gray-800">
            Download Now on
          </span>
          <p className="text-xs text-gray-700">
          Shop Your Favorites, Anytime        </p>
        </div>
        <div className="flex gap-2.5">
          <a href="#" target="_blank" rel="noopener noreferrer">
            <img alt="App Store" className="h-10" src="/images/footer/app-store.svg" />
          </a>
          <a href="#" target="_blank" rel="noopener noreferrer">
            <img alt="Google Play" className="h-10" src="/images/footer/google-play.svg" />
          </a>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center gap-3 py-6 lg:items-start lg:py-5 lg:pl-5 xl:pl-16 lg:shrink-0">
        <p className="text-gray-500 text-sm font-medium">
          We Support
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 shrink-0 lg:flex-nowrap lg:justify-start">
          <span className="flex h-7 w-20 shrink-0 items-center justify-center">
            <img alt="eSewa" className="max-h-full max-w-full object-contain" src="/images/payment/esewa-logo.png" />
          </span>
          <span className="flex h-7 w-20 shrink-0 items-center justify-center">
            <img alt="Khalti" className="max-h-full max-w-full object-contain" src="/images/payment/khalti-logo.png" />
          </span>
          <span className="flex h-7 w-20 shrink-0 items-center justify-center">
            <img alt="Fonepay" className="max-h-full max-w-full object-contain" src="/images/payment/fonepay-logo.png" />
          </span>
          <span className="flex h-7 w-20 shrink-0 items-center justify-center">
            <img alt="Cash on Delivery" className="max-h-full max-w-full object-contain" src="/images/payment/cod-logo.png" />
          </span>
        </div>
      </div>
    </div>
  </div>
  <div className="border-t border-gray-100">
    <div className="max-w-7xl mx-auto px-4 xl:px-0">
      <div className="flex flex-col items-center gap-5 sm:flex-row justify-between py-5">
        <div className="order-2 sm:order-1">
          <p className="text-gray-500 text-base">
            © Copyright 2026 - Chitra Shop.
          </p>
        </div>
        <nav className="order-1 sm:order-2">
          <ul className="flex sm:flex-row items-center gap-3 sm:gap-0 flex-col text-base text-gray-500">
            <li className="sm:pr-4">
              <a href="/refund-policy" className="hover:text-violet-600 transition-colors">
                Refund Policy
              </a>
            </li>
            <li className="sm:px-4 sm:border-l border-gray-200">
              <a href="/terms-of-service" className="hover:text-violet-600 transition-colors">
                Terms of Services
              </a>
            </li>
            <li className="sm:pl-4 sm:border-l border-gray-200">
              <a href="/shipping-policy" className="hover:text-violet-600 transition-colors">
                Shipping policy
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  </div>
</footer>
  );
}
