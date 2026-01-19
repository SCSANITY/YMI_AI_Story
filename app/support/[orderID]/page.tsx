'use client';

import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Headphones, ArrowLeft, Send } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';

export default function SupportOrderPage() {
  const router = useRouter();
  const params = useParams();
  const { orders } = useGlobalContext();
  const orderId = params?.orderID as string | undefined;
  const order = orders.find(o => o.id === orderId);

  const [message, setMessage] = useState('');

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Button variant="ghost" size="sm" onClick={() => router.push('/support')} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div>
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-gray-900">Support Ticket</h1>
          <p className="text-gray-500 text-sm">Order reference: {orderId}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-8">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900">Tell us what happened</h2>
          <textarea
            className="w-full min-h-[140px] rounded-xl border border-gray-200 p-3 text-sm"
            placeholder="Describe the issue (demo only)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <Button size="sm" className="rounded-full px-6">
            <Send className="h-4 w-4 mr-2" /> Submit (Demo)
          </Button>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Order summary</h2>
          {order ? (
            <div className="text-sm text-gray-600 space-y-2">
              <div><span className="font-semibold">Status:</span> {order.status}</div>
              <div><span className="font-semibold">Total:</span> ${order.total.toFixed(2)}</div>
              <div><span className="font-semibold">Placed:</span> {new Date(order.date).toLocaleString()}</div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">This order is not in the demo data yet.</p>
          )}
          <div className="mt-4 text-xs text-gray-500">Our team typically replies within 24 hours (demo).</div>
        </div>
      </div>
    </div>
  );
}
