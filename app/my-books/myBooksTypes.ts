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
  finalJobId?: string | null
  finalReady?: boolean
  finalReviewStatus?: string | null
  finalReleasedAt?: string | null
  templates?: {
    template_id?: string
    name?: string
    description?: string
    cover_image_path?: string
    normalized_cover_image_path?: string
    story_type?: string
    price_cents?: number | null
    compare_at_price_cents?: number | null
    discount_percent?: number | null
    is_discount?: boolean | null
  }
}
