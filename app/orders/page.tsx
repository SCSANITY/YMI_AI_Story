'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Package, ChevronRight, Truck, Hourglass, CircleCheck } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';
import { useI18n } from '@/lib/useI18n';
import { CheckoutCurrency, formatMajorCurrencyValue } from '@/lib/locale-pricing';
import {
  getOrderStatusLabelKey,
  isFinishedOrderStatus,
  isShippingOrderStatus,
  normalizeOrderStatus,
} from '@/lib/order-status';

type OrderSummary = {
  order_id: string;
  display_id?: string | null;
  order_status?: string | null;
  created_at?: string | null;
  total?: number;
  display_currency?: CheckoutCurrency;
  item_count?: number;
  cover_url?: string | null;
  first_item_name?: string | null;
};

type OrderTab = 'shipping' | 'unpaid' | 'finished';

const getOrderTab = (status?: string | null): OrderTab => {
  const normalized = normalizeOrderStatus(status)
  if (normalized === 'unpaid') return 'unpaid';
  if (isFinishedOrderStatus(normalized)) return 'finished';
  return 'shipping';
};

export default function OrdersPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { user, checkoutEmail, refreshCart } = useGlobalContext();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<OrderTab>('shipping');
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const url = user?.customerId
      ? `/api/orders?customerId=${user.customerId}`
      : checkoutEmail
      ? `/api/orders?email=${encodeURIComponent(checkoutEmail)}`
      : '/api/orders';

    fetch(url, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : { orders: [] }))
      .then((data) => {
        if (cancelled) return;
        setOrders(Array.isArray(data?.orders) ? data.orders : []);
      })
      .catch(() => {
        if (cancelled) return;
        setOrders([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.customerId, checkoutEmail]);

  const grouped = useMemo(() => {
    const shipping = orders.filter((order) => getOrderTab(order.order_status) === 'shipping');
    const unpaid = orders.filter((order) => getOrderTab(order.order_status) === 'unpaid');
    const finished = orders.filter((order) => getOrderTab(order.order_status) === 'finished');
    return { shipping, unpaid, finished };
  }, [orders]);

  const visibleOrders = grouped[activeTab];

  const statusLabel = (status?: string | null) => {
    return t(getOrderStatusLabelKey(status));
  };

  const handleDeletePending = async (orderId: string) => {
    if (deletingOrderId) return;
    const confirmed = window.confirm(t('orders.deletePendingConfirm'));
    if (!confirmed) return;

    setDeletingOrderId(orderId);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          customerId: user?.customerId ?? null,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || t('orders.deletePendingFailed'));
      }

      setOrders((prev) => prev.filter((order) => order.order_id !== orderId));
      await refreshCart();
    } catch (error) {
      console.error('Pending order delete failed:', error);
      window.alert(error instanceof Error ? error.message : t('orders.deletePendingFailed'));
    } finally {
      setDeletingOrderId(null);
    }
  };

  if (loading) {
    return (
      <div className="page-surface min-h-screen flex items-center justify-center p-8">
        <div className="text-sm text-gray-500">{t('common.loading')}</div>
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="page-surface min-h-screen flex items-center justify-center p-8">
        <div className="max-w-lg text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <Package className="h-7 w-7 text-amber-600" />
          </div>
          <h1 className="text-2xl md:text-3xl font-title text-gray-900">{t('orders.emptyTitle')}</h1>
          <p className="text-gray-600">{t('orders.emptyDescription')}</p>
          <Button size="lg" className="px-8" onClick={() => router.push('/')}>
            {t('common.browseBooks')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-surface min-h-screen">
    <div className="max-w-6xl mx-auto px-4 md:px-8 pt-24 pb-16">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
          <Package className="h-5 w-5 text-amber-600" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-title text-gray-900">{t('orders.title')}</h1>
          <p className="text-gray-500 text-sm">{t('orders.subtitle')}</p>
        </div>
      </div>

      <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-3">
        {(
          [
            { key: 'shipping', icon: Truck, label: t('orders.inTransit'), count: grouped.shipping.length },
            { key: 'unpaid', icon: Hourglass, label: t('orders.pendingPayment'), count: grouped.unpaid.length },
            { key: 'finished', icon: CircleCheck, label: t('orders.completed'), count: grouped.finished.length },
          ] as const
        ).map(({ key, icon: Icon, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`rounded-2xl border px-5 py-4 text-left transition-all duration-200 ${
              activeTab === key
                ? 'border-amber-300/60 bg-gradient-to-br from-amber-50 to-orange-50/60 text-amber-800 shadow-md shadow-amber-100/50'
                : 'border-white/60 bg-white/70 text-gray-600 hover:border-amber-200/60 hover:bg-white/90 backdrop-blur-sm'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Icon className={`h-4 w-4 ${activeTab === key ? 'text-amber-600' : 'text-gray-400'}`} />
              {label}
            </div>
            <div className={`text-xs mt-1 font-medium ${activeTab === key ? 'text-amber-600' : 'text-gray-400'}`}>
              {count} order{count !== 1 ? 's' : ''}
            </div>
          </button>
        ))}
      </div>

      {visibleOrders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-amber-100/80 bg-white/60 p-10 text-center text-sm text-gray-500">
          {t('orders.noCategoryOrders')}
        </div>
      ) : (
        <div className="space-y-4">
          {visibleOrders.map((order) => {
            const currentStatus = normalizeOrderStatus(order.order_status);
            const isShippingCard = isShippingOrderStatus(currentStatus);
            const isUnpaidCard = currentStatus === 'unpaid';
            const isFinishedCard = isFinishedOrderStatus(currentStatus);

            return (
              <div
                key={order.order_id}
                className="glass-panel w-full rounded-2xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
              >
                <button
                  type="button"
                  onClick={() => {
                    if (isShippingCard || isFinishedCard) {
                      router.push(`/orders/${order.order_id}`);
                    }
                  }}
                  className="flex items-center gap-4 text-left flex-1"
                >
                  <span className="relative block h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                    <Image
                      src={order.cover_url || '/Display.png'}
                      alt={order.first_item_name || 'Order'}
                      fill
                      sizes="64px"
                      className="object-cover"
                    />
                  </span>
                  <div>
                    <div className="text-xs text-gray-500 font-medium tabular-nums tracking-[0.14em]">
                      #{order.display_id ?? order.order_id}
                    </div>
                    <div className="text-lg font-semibold text-gray-900">
                      {order.first_item_name || t('common.personalizedStorybook')}
                    </div>
                    <div className="text-xs text-gray-500">
                      {order.item_count ?? 0} item{(order.item_count ?? 0) === 1 ? '' : 's'} |{' '}
                      {formatMajorCurrencyValue(Number(order.total ?? 0), order.display_currency ?? 'USD')}
                    </div>
                    <div className="text-xs mt-1 text-amber-700 font-semibold">{statusLabel(order.order_status)}</div>
                  </div>
                </button>

                <div className="flex items-center gap-2">
                  {isUnpaidCard && (
                    <>
                      <Button
                        size="sm"
                        className="rounded-full"
                        onClick={() => router.push(`/checkout?orderId=${encodeURIComponent(order.order_id)}`)}
                      >
                        {t('orders.continuePayment')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full border-red-200 text-red-600 hover:border-red-300 hover:text-red-700"
                        disabled={deletingOrderId === order.order_id}
                        onClick={() => void handleDeletePending(order.order_id)}
                      >
                        {t('orders.deletePending')}
                      </Button>
                    </>
                  )}
                  {isShippingCard && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => router.push(`/orders/${order.order_id}`)}
                    >
                      {t('orders.viewDetails')}
                    </Button>
                  )}
                  {isFinishedCard && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => router.push(`/orders/${order.order_id}/review`)}
                    >
                      {t('orders.rateReview')}
                    </Button>
                  )}
                  {(isShippingCard || isFinishedCard) && <ChevronRight className="h-4 w-4 text-gray-400" />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
    </div>
  );
}
