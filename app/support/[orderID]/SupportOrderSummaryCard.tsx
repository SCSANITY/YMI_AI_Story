import { formatMajorCurrencyValue, type CheckoutCurrency } from '@/lib/locale-pricing'

export type SupportOrderSummary = {
  id: string
  displayId?: string | null
  status?: string | null
  total?: number | null
  displayCurrency?: CheckoutCurrency
  createdAt?: string | null
}

type SupportOrderSummaryCardProps = {
  loading: boolean
  order: SupportOrderSummary | null
  t: (key: string, params?: Record<string, string | number>) => string
}

export function SupportOrderSummaryCard({ loading, order, t }: SupportOrderSummaryCardProps) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
      <h2 className="mb-3 text-lg font-bold text-gray-900">{t('supportDetail.summary')}</h2>
      {loading ? (
        <p className="text-sm text-gray-500">{t('supportDetail.loadingOrder')}</p>
      ) : order ? (
        <div className="space-y-2 text-sm text-gray-600">
          <div><span className="font-semibold">{t('supportDetail.status')}:</span> {order.status ?? t('common.unknown')}</div>
          <div><span className="font-semibold">{t('supportDetail.total')}:</span> {formatMajorCurrencyValue(order.total ?? 0, order.displayCurrency ?? 'USD')}</div>
          <div>
            <span className="font-semibold">{t('supportDetail.placed')}:</span>{' '}
            {order.createdAt ? new Date(order.createdAt).toLocaleString() : t('common.unknown')}
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">{t('supportDetail.notFound')}</p>
      )}
      <div className="mt-4 text-xs text-gray-500">{t('supportDetail.replyHint')}</div>
    </div>
  )
}
