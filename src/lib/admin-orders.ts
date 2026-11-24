export const ADMIN_ORDER_VIEW_OPTIONS = [
  ['active', 'Active orders'],
  ['preview_ready', 'Preview Ready'],
  ['pdf_ready', 'PDF Ready'],
  ['delivered', 'Delivered'],
  ['unpaid', 'Pending payment'],
  ['cancelled', 'Cancelled'],
  ['refunded', 'Refunded'],
] as const

export type AdminOrderView = (typeof ADMIN_ORDER_VIEW_OPTIONS)[number][0]

export const ADMIN_ORDER_VIEW_STATUSES: Record<AdminOrderView, string[]> = {
  active: ['paid', 'production', 'shipped'],
  preview_ready: ['paid'],
  pdf_ready: ['paid'],
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
  creation_id: string | null
  generation_job_id: string | null
  product_type: string | null
  package_type: string | null
  quantity: number | null
}

export type BookReleaseCounts = {
  books: number
  published: number
  printed: number
  physical: number
  missing_jobs: number
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

export function adminOrderMatchesView(status: unknown, view: AdminOrderView, bookProgress?: string | null) {
  if (view === 'preview_ready' || view === 'pdf_ready') return status === 'paid' && bookProgress === view
  if (view === 'active' && status === 'paid' && bookProgress === 'pdf_ready') return false
  return ADMIN_ORDER_VIEW_STATUSES[view].includes(String(status ?? '').trim().toLowerCase())
}

export function resolveAdminOrderViewForStatus(status: unknown, bookProgress?: string | null): AdminOrderView {
  if (status === 'paid' && bookProgress === 'pdf_ready') return 'pdf_ready'
  const normalized = String(status ?? '').trim().toLowerCase()
  return ADMIN_ORDER_VIEW_OPTIONS.find(([view]) =>
    ADMIN_ORDER_VIEW_STATUSES[view].includes(normalized)
  )?.[0] ?? 'active'
}

export function aggregateAdminOrderProgress(items: AdminOrderCartItem[], facts: BookReleaseCounts): AdminOrderProductionProgress {
  const itemCount = items.reduce((total, item) => {
    const quantity = Number(item.quantity)
    return total + (Number.isSafeInteger(quantity) && quantity > 0 ? quantity : 1)
  }, 0)
  return {
    itemCount, assetCount: facts.books, missingJobCount: facts.missing_jobs,
    pdfReleasedCount: facts.published, pdfTotalCount: facts.books,
    printReleasedCount: facts.printed, printTotalCount: facts.physical,
  }
}
