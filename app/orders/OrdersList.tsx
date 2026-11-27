'use client'

import Link from 'next/link'
import styles from './OrderMaterialsAttention.module.css'
import { BookOpen, ChevronRight, Feather, Loader2, Mic } from 'lucide-react'
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
}

type PendingOrderAction = {
  orderId: string
  action: 'open' | 'continue' | 'delete'
} | null

export function OrdersList({
  orders,
  pendingAction,
  t,
  onOpenOrder,
  onContinuePayment,
  onDeletePending,
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

        const extraBooks = Math.max(0, (order.item_count ?? 1) - 1)
        const layers = Math.min(2, extraBooks)

        return (
          <div
            key={order.order_id}
            className="glass-panel w-full rounded-2xl p-5"
          >
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <button
                type="button"
                onClick={() => {
                  if (hasPendingAction) return
                  if (isShippingCard || isFinishedCard) {
                    onOpenOrder(order.order_id)
                  }
                }}
                disabled={hasPendingAction}
                className="flex min-w-0 items-center gap-4 text-left flex-1"
              >
                <span className={styles.covers} data-layers={layers}>
                  {Array.from({length: layers}, (_, index) => {
                    const back = order.more_covers?.[index]
                    return <span key={index} className={styles.back} aria-hidden="true">
                      {back?.cover_url && <OrderCoverImage src={back.cover_url} status={back.cover_status}
                        alt="" sizes="64px" className="h-full w-full" placeholderLabel="" />}
                    </span>
                  })}
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
                </span></span>
                <div className="min-w-0">
                  <div className="text-xs font-medium tabular-nums tracking-[0.06em] text-gray-500">
                    #{order.display_id ?? order.order_id}
                  </div>
                  <div className="text-lg font-semibold text-gray-900">
                    {order.first_item_name || t('common.personalizedStorybook')}{extraBooks > 0 && <> <span className={styles.more}>
                      {t(order.item_count === 2 ? 'orders.oneMoreBook' : 'orders.moreBooks', {count: extraBooks})}
                    </span></>}
                  </div>
                  <div className="text-xs text-gray-500">
                    {order.item_count ?? 0} item{(order.item_count ?? 0) === 1 ? '' : 's'} |{' '}
                    {formatMajorCurrencyValue(Number(order.total ?? 0), order.display_currency ?? 'USD')}
                  </div>
                  <div className="text-xs mt-1 text-amber-700 font-semibold">
                    {t(order.pdf_order_stage
                      ? getOrderStatusLabelKey('paid', order.pdf_order_stage)
                      : getOrderStatusLabelKey(order.order_status, order.book_progress))}
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
                {(isShippingCard || isFinishedCard) && (
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
                {(isShippingCard || isFinishedCard) && <ChevronRight className="h-4 w-4 text-gray-400" />}
              </div>
            </div>
            {order.material_tasks?.map(task => {
              const kind = task.voice ? (task.dedication ? 'both' : 'voice') : 'dedication'
              const Icon = task.voice ? (task.dedication ? BookOpen : Mic) : Feather
              return <div key={task.cart_item_id} className={styles.task}>
                <Icon size={16} aria-hidden="true" />
                <span className={styles.copy}><strong>{t('orders.materials.' + kind)}</strong><small>{task.title}</small></span>
                <Link href={`/orders/${order.order_id}/materials?book=${task.cart_item_id}`} aria-label={`${t('orders.materials.' + kind + 'Action')} — ${task.title}`}>
                  {t('orders.materials.' + kind + 'Action')} <span aria-hidden="true">→</span>
                </Link>
              </div>
            })}
          </div>
        )
      })}
    </div>
  )
}
