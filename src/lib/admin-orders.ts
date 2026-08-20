import { isFinalJobReleased } from '@/lib/final-job-release'

export const ADMIN_ORDER_VIEW_OPTIONS = [
  ['active', 'Active orders'],
  ['delivered', 'Delivered'],
  ['unpaid', 'Pending payment'],
  ['cancelled', 'Cancelled'],
  ['refunded', 'Refunded'],
] as const

export type AdminOrderView = (typeof ADMIN_ORDER_VIEW_OPTIONS)[number][0]

export const ADMIN_ORDER_VIEW_STATUSES: Record<AdminOrderView, string[]> = {
  active: ['paid', 'production', 'shipped'],
  delivered: ['delivered'],
  unpaid: ['unpaid'],
  cancelled: ['cancelled'],
  refunded: ['refunded'],
}

export const READONLY_ADMIN_ORDER_VIEWS = new Set<AdminOrderView>([
  'unpaid',
  'cancelled',
  'refunded',
])

export type AdminOrderCartItem = {
  cart_item_id: string
  generation_job_id: string | null
  product_type: string | null
  package_type: string | null
  quantity: number | null
}

export type AdminOrderFinalJob = {
  final_job_id: string
  job_id: string
  review_status: string | null
  released_at: string | null
  print_status: string | null
  print_released_at: string | null
}

export type AdminOrderProductionProgress = {
  itemCount: number
  assetCount: number
  missingJobCount: number
  pdfReleasedCount: number
  pdfTotalCount: number
  printReleasedCount: number
  printTotalCount: number
}

export function normalizeAdminOrderView(value: unknown): AdminOrderView {
  const normalized = String(value ?? '').trim().toLowerCase()
  return ADMIN_ORDER_VIEW_OPTIONS.some(([candidate]) => candidate === normalized)
    ? (normalized as AdminOrderView)
    : 'active'
}

export function normalizeAdminOrderSearch(value: unknown) {
  return String(value ?? '')
    .trim()
    .slice(0, 100)
    .replace(/[^\p{L}\p{N}@._+'# -]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeAdminOrderPage(value: unknown) {
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1
}

export function normalizeAdminOrderPageSize(value: unknown) {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) return 20
  return Math.min(Math.max(parsed, 10), 50)
}

export function adminOrderMatchesView(status: unknown, view: AdminOrderView) {
  return ADMIN_ORDER_VIEW_STATUSES[view].includes(String(status ?? '').trim().toLowerCase())
}

export function resolveAdminOrderViewForStatus(status: unknown): AdminOrderView {
  const normalized = String(status ?? '').trim().toLowerCase()
  return ADMIN_ORDER_VIEW_OPTIONS.find(([view]) =>
    ADMIN_ORDER_VIEW_STATUSES[view].includes(normalized)
  )?.[0] ?? 'active'
}

function isPhysicalItem(item: AdminOrderCartItem) {
  return (
    item.product_type === 'physical' ||
    item.package_type === 'basic' ||
    item.package_type === 'supreme'
  )
}

export function aggregateAdminOrderProgress(
  items: AdminOrderCartItem[],
  finalJobs: AdminOrderFinalJob[]
): AdminOrderProductionProgress {
  const assets = new Map<string, { finalJobId: string | null; requiresPrint: boolean }>()
  let itemCount = 0

  for (const item of items) {
    const quantity = Number(item.quantity)
    itemCount += Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1

    const assetKey = item.generation_job_id
      ? `job:${item.generation_job_id}`
      : `item:${item.cart_item_id}`
    const existing = assets.get(assetKey)
    assets.set(assetKey, {
      finalJobId: item.generation_job_id,
      requiresPrint: Boolean(existing?.requiresPrint || isPhysicalItem(item)),
    })
  }

  const finalJobsById = new Map(finalJobs.map((job) => [job.job_id, job]))
  let missingJobCount = 0
  let pdfReleasedCount = 0
  let printReleasedCount = 0
  let printTotalCount = 0

  for (const asset of assets.values()) {
    const finalJob = asset.finalJobId ? finalJobsById.get(asset.finalJobId) : null
    if (!finalJob) missingJobCount += 1
    if (isFinalJobReleased(finalJob)) pdfReleasedCount += 1

    if (asset.requiresPrint) {
      printTotalCount += 1
      if (finalJob?.print_released_at || finalJob?.print_status === 'released') {
        printReleasedCount += 1
      }
    }
  }

  return {
    itemCount,
    assetCount: assets.size,
    missingJobCount,
    pdfReleasedCount,
    pdfTotalCount: assets.size,
    printReleasedCount,
    printTotalCount,
  }
}
