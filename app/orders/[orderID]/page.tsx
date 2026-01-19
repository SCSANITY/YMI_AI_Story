'use client';

import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Package, ArrowLeft } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { orders } = useGlobalContext();

  const orderId = params?.orderID as string | undefined;
  const order = orders.find(o => o.id === orderId);

  if (!order) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-8">
        <div className="max-w-lg text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <Package className="h-7 w-7 text-amber-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-gray-900">Order not found</h1>
          <p className="text-gray-600">We could not locate that order in the demo data.</p>
          <Button size="lg" className="rounded-full px-8" onClick={() => router.push('/orders')}>Back to Orders</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Button variant="ghost" size="sm" onClick={() => router.push('/orders')} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <div>
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-gray-900">Order #{order.id}</h1>
          <p className="text-gray-500 text-sm">Placed {new Date(order.date).toLocaleString()}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-[1.4fr_1fr] gap-8">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Items</h2>
          <div className="space-y-4">
            {order.items.map(item => (
              <div key={item.id} className="flex items-center gap-4">
                <img src={item.book.coverUrl} alt={item.book.title} className="w-16 h-20 rounded-lg object-cover" />
                <div className="flex-1">
                  <div className="font-semibold text-gray-900">{item.book.title}</div>
                  <div className="text-xs text-gray-500">Hero: {item.personalization?.childName || 'Unknown'}</div>
                </div>
                <div className="text-sm font-semibold text-gray-900">${(item.priceAtPurchase ?? item.book.price).toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Order Status</h2>
            <div className="text-sm font-semibold uppercase tracking-wide text-amber-600 bg-amber-50 px-3 py-2 rounded-full inline-block">
              {order.status}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Shipping</h2>
            <div className="text-sm text-gray-600 space-y-1">
              <div>{order.shippingAddress.firstName} {order.shippingAddress.lastName}</div>
              <div>{order.shippingAddress.address}</div>
              <div>{order.shippingAddress.city}, {order.shippingAddress.zip}</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Total</h2>
            <div className="text-2xl font-bold text-gray-900">${order.total.toFixed(2)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
