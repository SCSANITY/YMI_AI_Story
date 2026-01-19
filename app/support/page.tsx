'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Headphones, ChevronRight } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';

export default function SupportPage() {
  const router = useRouter();
  const { orders } = useGlobalContext();
  const [orderId, setOrderId] = useState('');

  const handleLookup = () => {
    if (!orderId.trim()) return;
    router.push(`/support/${orderId.trim()}`);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-10">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
          <Headphones className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-gray-900">Support Center</h1>
          <p className="text-gray-500 text-sm">Find help for your order or reach our team.</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-8">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Lookup an order</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              className="flex-1 h-11 rounded-lg border border-gray-200 px-3 text-sm"
              placeholder="Enter order ID"
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
            />
            <Button size="sm" className="rounded-full px-6" onClick={handleLookup}>Find</Button>
          </div>
          <p className="text-xs text-gray-500">Demo tip: copy an order ID from the list.</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Recent orders</h2>
          {orders.length === 0 ? (
            <p className="text-sm text-gray-500">No demo orders yet.</p>
          ) : (
            <div className="space-y-3">
              {orders.slice(0, 3).map(order => (
                <button
                  key={order.id}
                  className="w-full text-left border border-gray-100 rounded-xl p-3 flex items-center justify-between hover:bg-gray-50"
                  onClick={() => router.push(`/support/${order.id}`)}
                >
                  <div>
                    <div className="text-xs text-gray-500">#{order.id}</div>
                    <div className="text-sm font-semibold text-gray-900">${order.total.toFixed(2)}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
