import { isPaidLikeOrderStatus, normalizeOrderStatus } from '@/lib/order-status'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type PurchaseState = 'purchased' | 'refunded' | 'unpurchased'

export type FinalJobReleaseLike = {
  released_at?: string | null
  review_status?: string | null
}

export type ReleasedFinalPdfAsset = {
  jobId: string
  pdfPath: string
  createdAt: string | null
}

export type PurchaseSummary = {
  purchaseState: PurchaseState
  latestOrderId: string | null
  latestOrderDisplayId: string | null
  latestOrderStatus: string | null
  finalJobId: string | null
  finalReady: boolean
  finalReviewStatus: string | null
  finalReleasedAt: string | null
}

export type CreationPhotoLockState = {
  purchaseState: PurchaseState
  hasCartAttachment: boolean
}

type CartPurchaseRow = {
  cart_item_id: string
  creation_id: string | null
  order_id: string | null
  final_job_id: string | null
  status: string | null
  created_at: string | null
}

type OrderPurchaseRow = {
  order_id: string
  display_id: string | null
  order_status: string | null
  created_at: string | null
}

type FinalJobSummaryRow = {
  final_job_id: string
  creation_id: string | null
  order_id: string | null
  review_status: string | null
  released_at: string | null
  pdf_path: string | null
  status: string | null
  created_at: string | null
}

type PurchaseEntry = {
  cartItem: CartPurchaseRow
  order: OrderPurchaseRow
}

export function isFinalJobReleased(finalJob: FinalJobReleaseLike | null | undefined) {
  return Boolean(finalJob?.released_at || finalJob?.review_status === 'released')
}

export function classifyPurchaseState(orderRows: Array<{ order_status?: string | null }>): PurchaseState {
  if (orderRows.some((row) => isPaidLikeOrderStatus(row.order_status))) return 'purchased'
  if (orderRows.some((row) => normalizeOrderStatus(row.order_status) === 'refunded')) return 'refunded'
  return 'unpurchased'
}

export function getEmptyPurchaseSummary(): PurchaseSummary {
  return {
    purchaseState: 'unpurchased',
    latestOrderId: null,
    latestOrderDisplayId: null,
    latestOrderStatus: null,
    finalJobId: null,
    finalReady: false,
    finalReviewStatus: null,
    finalReleasedAt: null,
  }
}

export async function loadCreationPhotoLockState(
  creationId: string
): Promise<CreationPhotoLockState> {
  const { data: cartItems, error: cartItemsError } = await supabaseAdmin
    .from('cart_items')
    .select('cart_item_id, order_id, status')
    .eq('creation_id', creationId)

  if (cartItemsError) {
    throw new Error(`Failed to load creation cart state: ${cartItemsError.message}`)
  }

  const rows = cartItems ?? []
  const orderIds = Array.from(
    new Set(
      rows
        .map((item) => (item.order_id ? String(item.order_id) : null))
        .filter((orderId): orderId is string => Boolean(orderId))
    )
  )

  if (!orderIds.length) {
    return {
      purchaseState: 'unpurchased',
      hasCartAttachment: rows.length > 0,
    }
  }

  const { data: orders, error: ordersError } = await supabaseAdmin
    .from('orders')
    .select('order_status')
    .in('order_id', orderIds)

  if (ordersError) {
    throw new Error(`Failed to load creation order state: ${ordersError.message}`)
  }

  return {
    purchaseState: classifyPurchaseState(orders ?? []),
    // Add-to-Cart is the commit boundary for photo selection, including draft cart rows.
    hasCartAttachment: rows.length > 0,
  }
}

export async function loadReleasedFinalPdfAssetsByJobId(
  jobIds: string[]
): Promise<Map<string, ReleasedFinalPdfAsset>> {
  const assetsByJobId = new Map<string, ReleasedFinalPdfAsset>()
  const uniqueJobIds = Array.from(new Set(jobIds.filter(Boolean)))
  if (!uniqueJobIds.length) return assetsByJobId

  const { data: finalJobs } = await supabaseAdmin
    .from('final_jobs')
    .select('job_id, pdf_path, review_status, released_at, created_at')
    .in('job_id', uniqueJobIds)

  for (const finalJob of finalJobs ?? []) {
    const jobId = String(finalJob.job_id || '')
    const pdfPath = String(finalJob.pdf_path || '')
    if (!jobId || !pdfPath || !isFinalJobReleased(finalJob)) continue
    assetsByJobId.set(jobId, {
      jobId,
      pdfPath,
      createdAt: finalJob.created_at ?? null,
    })
  }

  return assetsByJobId
}

export function resolveLatestReleasedFinalPdfPath(
  jobIds: Array<string | null | undefined>,
  assetsByJobId: Map<string, ReleasedFinalPdfAsset>
) {
  const assets = jobIds
    .map((jobId) => (jobId ? assetsByJobId.get(jobId) : null))
    .filter((asset): asset is ReleasedFinalPdfAsset => Boolean(asset))
    .sort((a, b) => {
      const aTime = Date.parse(String(a.createdAt || '')) || 0
      const bTime = Date.parse(String(b.createdAt || '')) || 0
      return bTime - aTime
    })

  return assets[0]?.pdfPath ?? null
}

export async function loadPurchaseSummaryByCreation(creationIds: string[]): Promise<Map<string, PurchaseSummary>> {
  const summaryByCreation = new Map<string, PurchaseSummary>()
  const uniqueCreationIds = Array.from(new Set(creationIds.filter(Boolean)))
  if (!uniqueCreationIds.length) return summaryByCreation

  const { data: cartItems } = await supabaseAdmin
    .from('cart_items')
    .select('cart_item_id, creation_id, order_id, final_job_id, status, created_at')
    .in('creation_id', uniqueCreationIds)

  const linkedCartItems = ((cartItems ?? []) as CartPurchaseRow[]).filter((item) => item.creation_id && item.order_id)
  const orderIds = Array.from(new Set(linkedCartItems.map((item) => item.order_id).filter(Boolean)))
  const orderById = new Map<string, OrderPurchaseRow>()

  if (orderIds.length > 0) {
    const { data: orders } = await supabaseAdmin
      .from('orders')
      .select('order_id, display_id, order_status, created_at')
      .in('order_id', orderIds)

    for (const order of (orders ?? []) as OrderPurchaseRow[]) {
      if (order.order_id) orderById.set(String(order.order_id), order)
    }
  }

  const { data: finalJobs } = await supabaseAdmin
    .from('final_jobs')
    .select('final_job_id, creation_id, order_id, review_status, released_at, pdf_path, status, created_at')
    .in('creation_id', uniqueCreationIds)

  const finalJobByCreation = new Map<string, FinalJobSummaryRow>()
  for (const finalJob of (finalJobs ?? []) as FinalJobSummaryRow[]) {
    const creationId = String(finalJob.creation_id || '')
    if (!creationId) continue
    const current = finalJobByCreation.get(creationId)
    const isReady = isFinalJobReleased(finalJob)
    const currentReady = isFinalJobReleased(current)
    const createdAt = Date.parse(String(finalJob.created_at || '')) || 0
    const currentCreatedAt = Date.parse(String(current?.created_at || '')) || 0
    if (!current || (isReady && !currentReady) || (isReady === currentReady && createdAt > currentCreatedAt)) {
      finalJobByCreation.set(creationId, finalJob)
    }
  }

  for (const creationId of uniqueCreationIds) {
    const rows = linkedCartItems
      .filter((item) => item.creation_id === creationId)
      .map((item) => ({
        cartItem: item,
        order: orderById.get(String(item.order_id || '')),
      }))
      .filter((entry): entry is PurchaseEntry => Boolean(entry.order?.order_id))

    const orderRows = rows.map((entry) => entry.order)
    const purchaseState = classifyPurchaseState(orderRows)
    const eligibleRows = rows.filter((entry) => {
      if (purchaseState === 'purchased') return isPaidLikeOrderStatus(entry.order.order_status)
      if (purchaseState === 'refunded') return normalizeOrderStatus(entry.order.order_status) === 'refunded'
      return false
    })
    const latest = eligibleRows
      .slice()
      .sort((a, b) => {
        const aTime = Date.parse(String(a.order.created_at || a.cartItem.created_at || '')) || 0
        const bTime = Date.parse(String(b.order.created_at || b.cartItem.created_at || '')) || 0
        return bTime - aTime
      })[0]

    const finalJob = finalJobByCreation.get(creationId)
    summaryByCreation.set(creationId, {
      purchaseState,
      latestOrderId: latest?.order.order_id ?? null,
      latestOrderDisplayId: latest?.order.display_id ?? null,
      latestOrderStatus: latest?.order.order_status ?? null,
      finalJobId: finalJob?.final_job_id ?? null,
      finalReady: isFinalJobReleased(finalJob),
      finalReviewStatus: finalJob?.review_status ?? null,
      finalReleasedAt: finalJob?.released_at ?? null,
    })
  }

  return summaryByCreation
}
