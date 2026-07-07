import type { CheckoutCurrency } from '@/lib/locale-pricing'

export type OrderSummary = {
  order_id: string
  display_id?: string | null
  order_status?: string | null
  created_at?: string | null
  total?: number
  display_currency?: CheckoutCurrency
  item_count?: number
  cover_url?: string | null
  cover_status?: 'ready' | 'pending' | 'unavailable'
  cover_cart_item_id?: string | null
  first_item_name?: string | null
}

export type OrderTab = 'shipping' | 'unpaid' | 'finished'
