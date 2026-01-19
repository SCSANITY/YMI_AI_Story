'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Package, ChevronRight } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';

export default function OrdersPage() {
  const router = useRouter();
  const { orders, user, openLoginModal } = useGlobalContext();

  if (!user) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-8">
        <div className="max-w-lg text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <Package className="h-7 w-7 text-amber-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-gray-900">Log in to see orders</h1>
          <p className="text-gray-600">Track your personalized books in one place.</p>
          <Button size="lg" className="rounded-full px-8" onClick={openLoginModal}>Log In</Button>
        </div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-8">
        <div className="max-w-lg text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <Package className="h-7 w-7 text-amber-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-gray-900">No orders yet</h1>
          <p className="text-gray-600">Start by creating a magical storybook.</p>
          <Button size="lg" className="rounded-full px-8" onClick={() => router.push('/')}>Browse Books</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-10">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
          <Package className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-serif font-bold text-gray-900">My Orders</h1>
          <p className="text-gray-500 text-sm">Track and review your purchases.</p>
        </div>
      </div>

      <div className="space-y-4">
        {orders.map(order => (
          <button
            key={order.id}
            onClick={() => router.push(`/orders/${order.id}`)}
            className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center justify-between hover:shadow-md transition-shadow"
          >
            <div>
              <div className="text-sm text-gray-500">Order #{order.id}</div>
              <div className="text-lg font-semibold text-gray-900">${order.total.toFixed(2)}</div>
              <div className="text-xs text-gray-500">{new Date(order.date).toLocaleString()}</div>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-amber-600 bg-amber-50 px-3 py-1 rounded-full">
                {order.status}
              </span>
              <ChevronRight className="h-4 w-4 text-gray-400" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
