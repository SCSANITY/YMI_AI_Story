import type { CheckoutCurrency } from '@/lib/locale-pricing'

export type OrderItem = {
  cart_item_id: string
  creation_id: string
  quantity: number
  price_at_purchase?: number | null
  display_unit_price?: number | null
  display_currency?: CheckoutCurrency
  template_name?: string | null
  cover_url?: string | null
  preview_cover_url?: string | null
  cover_status?: 'ready' | 'pending' | 'unavailable'
  preview_cover_status?: 'ready' | 'pending' | 'unavailable'
}

export type OrderDetail = {
  order_id: string
  display_id?: string | null
  order_status?: string | null
  created_at?: string | null
  email?: string | null
  cover_url?: string | null
  total?: number
  final_pdf_url?: string | null
  display_currency?: CheckoutCurrency
  item_count?: number
  shipping_address?: {
    firstName?: string
    lastName?: string
    addressLine1?: string
    addressLine2?: string
    city?: string
    region?: string
    zip?: string
    country?: string
  } | null
  tracking_number?: string | null
  tracking_carrier?: string | null
  tracking_url?: string | null
  logistics_note?: string | null
  logistics_updated_at?: string | null
  items?: OrderItem[]
}
