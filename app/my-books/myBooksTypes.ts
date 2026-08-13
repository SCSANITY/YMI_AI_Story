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
    package_prices?: Array<{
      package_type?: string | null
      list_price_usd?: number | null
      sale_price_usd?: number | null
      display_discount_percent?: number | null
      row_version?: number | null
    }> | null
  }
}
