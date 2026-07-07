'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/Button';
import { useI18n } from '@/lib/useI18n';
import type { CheckoutCurrency } from '@/lib/locale-pricing';
import { SupportOrderMessageSection } from './SupportOrderMessageSection';
import { SupportOrderSummaryCard, type SupportOrderSummary } from './SupportOrderSummaryCard';

export default function SupportOrderPage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams();
  const orderId = params?.orderID as string | undefined;
  const [order, setOrder] = useState<SupportOrderSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/orders/${orderId}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (!data?.order) {
          setOrder(null);
          return;
        }
        setOrder({
          id: data.order.id,
          displayId: data.order.displayId ?? null,
          status: data.order.status ?? null,
          total: Number(data.total ?? 0),
          displayCurrency: (data.order.displayCurrency ?? 'USD') as CheckoutCurrency,
          createdAt: data.order.createdAt ?? null,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setOrder(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-8 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Button variant="ghost" size="sm" onClick={() => router.push('/support')} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> {t('supportDetail.back')}
        </Button>
        <div>
          <h1 className="text-2xl md:text-3xl font-title text-gray-900">{t('supportDetail.ticketTitle')}</h1>
          <p className="text-gray-500 text-sm">
            {t('supportDetail.reference')}:{' '}
            <span className="font-mono tabular-nums tracking-wide">
              {order?.displayId ?? orderId}
            </span>
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-8">
        <SupportOrderMessageSection t={t} />
        <SupportOrderSummaryCard loading={loading} order={order} t={t} />
      </div>
    </div>
  );
}
