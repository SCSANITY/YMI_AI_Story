'use client'

import { ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/Button'
import OrderCoverImage from '@/components/OrderCoverImage'
import { formatMajorCurrencyValue } from '@/lib/locale-pricing'
import {
  getOrderStatusLabelKey,
  isFinishedOrderStatus,
  isShippingOrderStatus,
  normalizeOrderStatus,
} from '@/lib/order-status'
import type { OrderSummary } from './ordersTypes'

type OrdersListProps = {
  orders: OrderSummary[]
  pendingAction: PendingOrderAction
  t: (key: string, params?: Record<string, string | number | null | undefined>) => string
  onOpenOrder: (orderId: string) => void
  onContinuePayment: (orderId: string) => void
  onDeletePending: (orderId: string) => void
  onReview: (orderId: string) => void
}

type PendingOrderAction = {
  orderId: string
  action: 'open' | 'continue' | 'delete' | 'review'
} | null

export function OrdersList({
  orders,
  pendingAction,
  t,
  onOpenOrder,
  onContinuePayment,
  onDeletePending,
  onReview,
}: OrdersListProps) {
  if (orders.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-amber-100/80 bg-white/60 p-10 text-center text-sm text-gray-500">
        {t('orders.noCategoryOrders')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {orders.map((order) => {
        const currentStatus = normalizeOrderStatus(order.order_status)
        const isShippingCard = isShippingOrderStatus(currentStatus)
        const isUnpaidCard = currentStatus === 'unpaid'
        const isFinishedCard = isFinishedOrderStatus(currentStatus)
        const activeAction = pendingAction?.orderId === order.order_id ? pendingAction.action : null
        const hasPendingAction = Boolean(activeAction)

        return (
          <div
            key={order.order_id}
            className="glass-panel w-full rounded-2xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
          >
            <button
              type="button"
              onClick={() => {
                if (hasPendingAction) return
                if (isShippingCard || isFinishedCard) {
                  onOpenOrder(order.order_id)
                }
              }}
              disabled={hasPendingAction}
              className="flex items-center gap-4 text-left flex-1"
            >
              <span className="relative block h-20 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                <OrderCoverImage
                  cartItemId={order.cover_cart_item_id}
                  src={order.cover_url}
                  status={order.cover_status}
                  alt={order.first_item_name || 'Order'}
                  sizes="64px"
                  className="h-full w-full"
                  imageClassName="object-cover"
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
                <div className="text-xs mt-1 text-amber-700 font-semibold">
                  {t(getOrderStatusLabelKey(order.order_status))}
                </div>
              </div>
            </button>

            <div className="flex items-center gap-2">
              {isUnpaidCard && (
                <>
                  <Button
                    size="sm"
                    className="rounded-full"
                    disabled={hasPendingAction}
                    onClick={() => onContinuePayment(order.order_id)}
                  >
                    {activeAction === 'continue' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {t('orders.continuePayment')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full border-red-200 text-red-600 hover:border-red-300 hover:text-red-700"
                    disabled={hasPendingAction}
                    onClick={() => onDeletePending(order.order_id)}
                  >
                    {activeAction === 'delete' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {t('orders.deletePending')}
                  </Button>
                </>
              )}
              {isShippingCard && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  disabled={hasPendingAction}
                  onClick={() => onOpenOrder(order.order_id)}
                >
                  {activeAction === 'open' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t('orders.viewDetails')}
                </Button>
              )}
              {isFinishedCard && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  disabled={hasPendingAction}
                  onClick={() => onReview(order.order_id)}
                >
                  {activeAction === 'review' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {t('orders.rateReview')}
                </Button>
              )}
              {(isShippingCard || isFinishedCard) && <ChevronRight className="h-4 w-4 text-gray-400" />}
            </div>
          </div>
        )
      })}
    </div>
  )
}
