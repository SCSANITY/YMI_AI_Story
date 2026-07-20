'use client'

import { MapPin } from 'lucide-react'
import OrderCoverImage from '@/components/OrderCoverImage'
import { formatMajorCurrencyValue } from '@/lib/locale-pricing'
import type { OrderDetail, OrderItem } from './orderDetailTypes'

type OrderDetailPanelsProps = {
  items: OrderItem[]
  order: OrderDetail
  stripeSessionId?: string | null
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string
}

export function OrderDetailPanels({ items, order, stripeSessionId, t }: OrderDetailPanelsProps) {
  const address = order.shipping_address ?? {}

  return (
    <div className="grid md:grid-cols-[1.5fr_1fr] gap-5">
      <div className="glass-panel rounded-3xl p-5 md:p-6 space-y-4">
        <h2 className="text-sm font-bold text-gray-900">{t('orderDetail.items')}</h2>
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.cart_item_id} className="flex items-center gap-4">
              <span className="relative block h-20 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-100 shadow-md shadow-black/10">
                <OrderCoverImage
                  cartItemId={item.cart_item_id}
                  orderId={order.order_id}
                  stripeSessionId={stripeSessionId}
                  src={item.preview_cover_url ?? item.cover_url ?? null}
                  status={item.preview_cover_status ?? item.cover_status}
                  alt={item.template_name || 'Order item'}
                  sizes="64px"
                  className="h-full w-full"
                  imageClassName="object-cover"
                />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-900 leading-snug">
                  {item.template_name || t('common.personalizedStorybook')}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">{t('orderDetail.qty')} {item.quantity}</div>
              </div>
              <div className="text-sm font-bold text-gray-900 shrink-0">
                {formatMajorCurrencyValue(
                  Number(item.display_unit_price ?? item.price_at_purchase ?? 0),
                  item.display_currency ?? order.display_currency ?? 'USD'
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="glass-panel rounded-3xl p-5 md:p-6 space-y-5">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <MapPin className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-slate-400">{t('orderDetail.shipping')}</p>
          </div>
          <div className="text-sm text-gray-700 space-y-0.5 leading-relaxed">
            <div className="font-medium text-gray-900">{`${address.firstName ?? ''} ${address.lastName ?? ''}`.trim() || '-'}</div>
            <div>{[address.addressLine1, address.addressLine2].filter(Boolean).join(', ') || '-'}</div>
            <div>{[address.city, address.region, address.zip].filter(Boolean).join(' ') || '-'}</div>
          </div>
        </div>

        <div className="border-t border-white/60 pt-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{t('orderDetail.items')}</span>
            <span>{order.item_count ?? items.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">{t('common.total')}</span>
            <span className="text-lg font-bold text-amber-600">
              {formatMajorCurrencyValue(Number(order.total ?? 0), order.display_currency ?? 'USD')}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
