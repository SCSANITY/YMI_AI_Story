'use client';

import React from 'react';
import { Facebook, Instagram, Music2, Mail, Phone } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="mt-20 border-t border-amber-100 bg-white">
      <div className="container mx-auto px-4 py-12">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-5">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white flex items-center justify-center font-black">
                Y
              </div>
              <div className="text-lg font-bold text-gray-900">YMI Books</div>
            </div>
            <p className="text-sm text-gray-600 leading-relaxed">
              Create hyper-personalized storybooks that make your child the hero, with quick
              customization and speedy delivery.
            </p>
            <div className="flex items-center gap-3 text-amber-500">
              <a className="p-2 rounded-full bg-amber-50 hover:bg-amber-100" href="#" aria-label="Facebook">
                <Facebook className="h-4 w-4" />
              </a>
              <a className="p-2 rounded-full bg-amber-50 hover:bg-amber-100" href="#" aria-label="Instagram">
                <Instagram className="h-4 w-4" />
              </a>
              <a className="p-2 rounded-full bg-amber-50 hover:bg-amber-100" href="#" aria-label="TikTok">
                <Music2 className="h-4 w-4" />
              </a>
            </div>
          </div>

          <div className="space-y-4 text-sm">
            <h3 className="text-gray-900 font-semibold text-base">About YMI</h3>
            <ul className="space-y-2 text-gray-600">
              <li><a href="#" className="hover:text-amber-600">Contact us</a></li>
              <li><a href="#" className="hover:text-amber-600">FAQs</a></li>
              <li><a href="#books" className="hover:text-amber-600">Books</a></li>
              <li><a href="#" className="hover:text-amber-600">Blog</a></li>
            </ul>
          </div>

          <div className="space-y-4 text-sm">
            <h3 className="text-gray-900 font-semibold text-base">Customer Area</h3>
            <ul className="space-y-2 text-gray-600">
              <li><a href="/favorites" className="hover:text-amber-600">My Account</a></li>
              <li><a href="/orders" className="hover:text-amber-600">Orders</a></li>
              <li><a href="#" className="hover:text-amber-600">Terms</a></li>
              <li><a href="#" className="hover:text-amber-600">Privacy Policy</a></li>
            </ul>
          </div>

          <div className="space-y-4 text-sm">
            <h3 className="text-gray-900 font-semibold text-base">Subscribe</h3>
            <p className="text-gray-600">Don't miss out on new storybooks and seasonal drops.</p>
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  className="w-full h-11 rounded-lg border border-gray-200 pl-9 pr-3 text-sm"
                  placeholder="Enter your email"
                />
              </div>
              <button className="h-11 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold">
                Subscribe
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 pt-2 text-gray-400">
              <span className="text-xs border border-gray-200 rounded-md px-2 py-1">AMEX</span>
              <span className="text-xs border border-gray-200 rounded-md px-2 py-1">Klarna</span>
              <span className="text-xs border border-gray-200 rounded-md px-2 py-1">PayPal</span>
              <span className="text-xs border border-gray-200 rounded-md px-2 py-1">Visa</span>
              <span className="text-xs border border-gray-200 rounded-md px-2 py-1">Mastercard</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> hello@ymi.com</span>
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> +1 (555) 201-2026</span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-100">
        <div className="container mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between text-xs text-gray-500 gap-2">
          <span>YMI Books — © 2026 All rights reserved</span>
          <span>Designed for demo preview</span>
        </div>
      </div>
    </footer>
  );
};
