'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package } from 'lucide-react';
import { useGlobalContext } from '@/contexts/GlobalContext';
import { Button } from '@/components/Button';
import { useI18n } from '@/lib/useI18n';
import {
  isFinishedOrderStatus,
  normalizeOrderStatus,
} from '@/lib/order-status';
import { OrderTabs } from './OrderTabs';
import { OrdersList } from './OrdersList';
import type { OrderSummary, OrderTab } from './ordersTypes';

type PendingOrderAction = {
  orderId: string;
  action: 'open' | 'continue' | 'delete' | 'review';
} | null;

const getOrderTab = (status?: string | null): OrderTab => {
  const normalized = normalizeOrderStatus(status)
  if (normalized === 'unpaid') return 'unpaid';
  if (isFinishedOrderStatus(normalized)) return 'finished';
  return 'shipping';
};

function OrdersLoadingList() {
  return (
    <div className="space-y-4" aria-label="Loading orders">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="rounded-[22px] border border-white/70 bg-white/75 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-3">
              <div className="h-4 w-40 animate-pulse rounded-full bg-gray-200" />
              <div className="h-3 w-56 max-w-full animate-pulse rounded-full bg-gray-100" />
              <div className="h-3 w-32 animate-pulse rounded-full bg-amber-100/80" />
            </div>
            <div className="flex gap-2">
              <div className="h-9 w-24 animate-pulse rounded-full bg-gray-100" />
              <div className="h-9 w-24 animate-pulse rounded-full bg-amber-100/80" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OrdersPage() {
  const router = useRouter();
  const { t } = useI18n();
  const { user, refreshCart } = useGlobalContext();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<OrderTab>('shipping');
  const [pendingAction, setPendingAction] = useState<PendingOrderAction>(null);

  useEffect(() => {
    let cancelled = false;
    const url = user?.customerId ? `/api/orders?customerId=${user.customerId}` : '/api/orders';

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
  }, [user?.customerId]);

  const grouped = useMemo(() => {
    const shipping = orders.filter((order) => getOrderTab(order.order_status) === 'shipping');
    const unpaid = orders.filter((order) => getOrderTab(order.order_status) === 'unpaid');
    const finished = orders.filter((order) => getOrderTab(order.order_status) === 'finished');
    return { shipping, unpaid, finished };
  }, [orders]);

  const visibleOrders = grouped[activeTab];

  const handleDeletePending = async (orderId: string) => {
    if (pendingAction) return;
    const confirmed = window.confirm(t('orders.deletePendingConfirm'));
    if (!confirmed) return;

    setPendingAction({ orderId, action: 'delete' });
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
      setPendingAction(null);
    }
  };

  const handleOpenOrder = (orderId: string) => {
    if (pendingAction) return;
    setPendingAction({ orderId, action: 'open' });
    router.push(`/orders/${orderId}`);
  };

  const handleContinuePayment = (orderId: string) => {
    if (pendingAction) return;
    setPendingAction({ orderId, action: 'continue' });
    router.push(`/checkout?orderId=${encodeURIComponent(orderId)}`);
  };

  const handleReview = (orderId: string) => {
    if (pendingAction) return;
    setPendingAction({ orderId, action: 'review' });
    router.push(`/orders/${orderId}/review`);
  };

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

      {loading ? (
        <OrdersLoadingList />
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 p-8 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
            <Package className="h-6 w-6 text-amber-600" />
          </div>
          <h2 className="text-xl md:text-2xl font-title text-gray-900">{t('orders.emptyTitle')}</h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-600">{t('orders.emptyDescription')}</p>
          <Button size="lg" className="mt-6 px-8" onClick={() => router.push('/')}>
            {t('common.browseBooks')}
          </Button>
        </div>
      ) : (
        <>
          <OrderTabs
            activeTab={activeTab}
            counts={{
              shipping: grouped.shipping.length,
              unpaid: grouped.unpaid.length,
              finished: grouped.finished.length,
            }}
            t={t}
            onChange={setActiveTab}
          />

          <OrdersList
            orders={visibleOrders}
            pendingAction={pendingAction}
            t={t}
            onOpenOrder={handleOpenOrder}
            onContinuePayment={handleContinuePayment}
            onDeletePending={(orderId) => void handleDeletePending(orderId)}
            onReview={handleReview}
          />
        </>
      )}
    </div>
    </div>
  );
}
