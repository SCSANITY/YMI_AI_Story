'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package, ChevronRight, Truck, Hourglass, CircleCheck } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';
import { useI18n } from '@/lib/useI18n';
import { CheckoutCurrency, formatMajorCurrencyValue } from '@/lib/locale-pricing';

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

const SHIPPING_STATUSES = new Set(['paid', 'processing']);
const FINISHED_STATUSES = new Set(['shipped', 'cancelled', 'refunded']);

const getOrderTab = (status?: string | null): OrderTab => {
  if (status === 'unpaid') return 'unpaid';
  if (FINISHED_STATUSES.has(String(status ?? ''))) return 'finished';
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
    const value = String(status ?? '').toLowerCase();
    if (value === 'unpaid') return t('orders.status.unpaid');
    if (value === 'paid') return t('orders.status.paid');
    if (value === 'processing') return t('orders.status.processing');
    if (value === 'shipped') return t('orders.status.shipped');
    if (value === 'cancelled') return t('orders.status.cancelled');
    if (value === 'refunded') return t('orders.status.refunded');
    return t('orders.status.default');
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
      <div className="min-h-[70vh] flex items-center justify-center p-8">
        <div className="text-sm text-gray-500">{t('common.loading')}</div>
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
          <h1 className="text-2xl md:text-3xl font-title text-gray-900">{t('orders.emptyTitle')}</h1>
          <p className="text-gray-600">{t('orders.emptyDescription')}</p>
          <Button size="lg" className="rounded-full px-8" onClick={() => router.push('/')}>
            {t('common.browseBooks')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-10">
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
        <button
          type="button"
          onClick={() => setActiveTab('shipping')}
          className={`rounded-xl border px-4 py-3 text-left transition ${
            activeTab === 'shipping'
              ? 'border-amber-300 bg-amber-50 text-amber-800'
              : 'border-gray-200 bg-white text-gray-700 hover:border-amber-200'
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Truck className="h-4 w-4" />
            {t('orders.inTransit')}
          </div>
          <div className="text-xs mt-1">{grouped.shipping.length} order(s)</div>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('unpaid')}
          className={`rounded-xl border px-4 py-3 text-left transition ${
            activeTab === 'unpaid'
              ? 'border-amber-300 bg-amber-50 text-amber-800'
              : 'border-gray-200 bg-white text-gray-700 hover:border-amber-200'
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Hourglass className="h-4 w-4" />
            {t('orders.pendingPayment')}
          </div>
          <div className="text-xs mt-1">{grouped.unpaid.length} order(s)</div>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('finished')}
          className={`rounded-xl border px-4 py-3 text-left transition ${
            activeTab === 'finished'
              ? 'border-amber-300 bg-amber-50 text-amber-800'
              : 'border-gray-200 bg-white text-gray-700 hover:border-amber-200'
          }`}
        >
          <div className="flex items-center gap-2 text-sm font-semibold">
            <CircleCheck className="h-4 w-4" />
            {t('orders.completed')}
          </div>
          <div className="text-xs mt-1">{grouped.finished.length} order(s)</div>
        </button>
      </div>

      {visibleOrders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center text-sm text-gray-500">
          {t('orders.noCategoryOrders')}
        </div>
      ) : (
        <div className="space-y-4">
          {visibleOrders.map((order) => {
            const currentStatus = String(order.order_status ?? '');
            const isShippingCard = SHIPPING_STATUSES.has(currentStatus);
            const isUnpaidCard = currentStatus === 'unpaid';
            const isFinishedCard = FINISHED_STATUSES.has(currentStatus);

            return (
              <div
                key={order.order_id}
                className="w-full bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
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
                  <img
                    src={order.cover_url || '/Display.png'}
                    alt={order.first_item_name || 'Order'}
                    className="w-16 h-20 rounded-lg object-cover bg-gray-100"
                  />
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
  );
}
