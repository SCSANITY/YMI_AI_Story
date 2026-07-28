import { isFinalJobReleased } from '@/lib/final-job-release'
import { normalizeOrderStatus } from '@/lib/order-status'

type OrderRow = {
  order_id: string
  order_status: string | null
}

type OrderedCartItemRow = {
  cart_item_id: string
  final_job_id: string | null
}

type FinalJobReleaseRow = {
  job_id: string | null
  review_status: string | null
  released_at: string | null
}

export type OrderProductionTransitionStore = {
  loadAffectedOrderIds(jobId: string): Promise<string[]>
  loadOrder(orderId: string): Promise<OrderRow | null>
  loadOrderedCartItems(orderId: string): Promise<OrderedCartItemRow[]>
  loadFinalJobs(jobIds: string[]): Promise<FinalJobReleaseRow[]>
  promotePaidOrder(orderId: string, changedAt: string): Promise<boolean>
  recordTransition(params: {
    orderId: string
    changedByAdminId: string | null
  }): Promise<void>
}

export function areAllOrderPdfsReleased(
  items: OrderedCartItemRow[],
  finalJobs: FinalJobReleaseRow[]
) {
  if (items.length === 0 || items.some((item) => !item.final_job_id)) return false

  const requiredJobIds = new Set(items.map((item) => String(item.final_job_id)))
  const releasedJobIds = new Set(
    finalJobs
      .filter((finalJob) => finalJob.job_id && isFinalJobReleased(finalJob))
      .map((finalJob) => String(finalJob.job_id))
  )

  return Array.from(requiredJobIds).every((jobId) => releasedJobIds.has(jobId))
}

export async function advanceOrdersToProductionAfterPdfRelease(
  params: {
    jobId?: string | null
    orderIds?: string[]
    changedByAdminId?: string | null
  },
  store: OrderProductionTransitionStore
) {
  const orderIds = new Set((params.orderIds ?? []).filter(Boolean))
  if (params.jobId) {
    const affectedOrderIds = await store.loadAffectedOrderIds(params.jobId)
    affectedOrderIds.forEach((orderId) => orderIds.add(orderId))
  }

  const readyOrderIds: string[] = []
  const promotedOrderIds: string[] = []

  for (const orderId of orderIds) {
    const order = await store.loadOrder(orderId)
    if (!order || normalizeOrderStatus(order.order_status) !== 'paid') continue

    const items = await store.loadOrderedCartItems(orderId)
    const jobIds = Array.from(
      new Set(items.map((item) => item.final_job_id).filter((jobId): jobId is string => Boolean(jobId)))
    )
    const finalJobs = await store.loadFinalJobs(jobIds)
    if (!areAllOrderPdfsReleased(items, finalJobs)) continue

    readyOrderIds.push(orderId)
    const changedAt = new Date().toISOString()
    const promoted = await store.promotePaidOrder(orderId, changedAt)
    if (!promoted) continue

    promotedOrderIds.push(orderId)
    try {
      await store.recordTransition({
        orderId,
        changedByAdminId: params.changedByAdminId ?? null,
      })
    } catch (error) {
      console.error('[orders] automatic PDF-release status event failed', { orderId, error })
    }
  }

  return {
    readyOrderIds,
    promotedOrderIds,
  }
}
