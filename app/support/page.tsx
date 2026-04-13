'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Headphones, ChevronRight } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';
import { useI18n } from '@/lib/useI18n';
import { CheckoutCurrency, formatMajorCurrencyValue } from '@/lib/locale-pricing';

export default function SupportPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { user, checkoutEmail } = useGlobalContext();
  const [orderId, setOrderId] = useState('');
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (user?.customerId) {
      params.set('customerId', user.customerId);
    } else if (checkoutEmail) {
      params.set('email', checkoutEmail);
    }

    if (!params.toString()) {
      setRecentOrders([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetch(`/api/orders/list?${params.toString()}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { orders: [] }))
      .then((data) => {
        if (cancelled) return;
        const orders = Array.isArray(data?.orders) ? data.orders : [];
        setRecentOrders(orders);
      })
      .catch(() => {
        if (cancelled) return;
        setRecentOrders([]);
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.customerId, checkoutEmail]);

  const handleLookup = () => {
    if (!orderId.trim()) return;
    router.push(`/support/${orderId.trim()}`);
  };

  return (
    <div className="page-surface min-h-screen">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-10">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
          <Headphones className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-title text-gray-900">{t('support.title')}</h1>
          <p className="text-gray-500 text-sm">{t('support.subtitle')}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-8">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-bold text-gray-900">{t('support.lookupTitle')}</h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              className="flex-1 h-11 rounded-lg border border-gray-200 px-3 text-sm"
              placeholder={t('support.lookupPlaceholder')}
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
            />
            <Button size="sm" className="rounded-full px-6" onClick={handleLookup}>{t('common.find')}</Button>
          </div>
          <p className="text-xs text-gray-500">{t('support.lookupHint')}</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">{t('support.recentOrders')}</h2>
          {isLoading ? (
            <p className="text-sm text-gray-500">{t('support.loadingRecent')}</p>
          ) : recentOrders.length === 0 ? (
            <p className="text-sm text-gray-500">{t('support.noRecent')}</p>
          ) : (
            <div className="space-y-3">
              {recentOrders.slice(0, 3).map(order => (
                <button
                  key={order.id}
                  className="w-full text-left border border-gray-100 rounded-xl p-3 flex items-center justify-between hover:bg-gray-50"
                  onClick={() => router.push(`/support/${order.displayId ?? order.id}`)}
                >
                  <div>
                    <div className="text-xs text-gray-500 font-mono tabular-nums tracking-wide">
                      #{order.displayId ?? order.id}
                    </div>
                    <div className="text-sm font-semibold text-gray-900">
                      {formatMajorCurrencyValue(Number(order.total ?? 0), (order.displayCurrency ?? 'USD') as CheckoutCurrency)}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
