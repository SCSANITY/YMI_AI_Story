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
    </div>
    </div>
  );
}
