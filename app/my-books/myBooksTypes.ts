export type MyBookPurchaseState = 'purchased' | 'refunded' | 'unpurchased'

export type CreationItem = {
  creation_id: string
  template_id: string
  customize_snapshot?: Record<string, unknown> | null
  preview_job_id?: string | null
  preview_cover_url?: string | null
  is_archived?: boolean | null
  purchaseState?: MyBookPurchaseState
  latestOrderId?: string | null
  latestOrderDisplayId?: string | null
  latestOrderStatus?: string | null
  latestPackageType?: string | null
  finalJobId?: string | null
  finalReady?: boolean
  finalReviewStatus?: string | null
  finalReleasedAt?: string | null
  templates?: TemplateCatalogRow
}
import type { TemplateCatalogRow } from '@/lib/book-catalog'
