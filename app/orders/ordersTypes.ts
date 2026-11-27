import type { CheckoutCurrency } from '@/lib/locale-pricing'

export type OrderSummary = {
  order_id: string
  display_id?: string | null
  pdf_order_stage?: 'confirmed' | 'pdf_ready' | null
  book_progress?: string | null
  order_status?: string | null
  created_at?: string | null
  total?: number
  display_currency?: CheckoutCurrency
  item_count?: number
  cover_url?: string | null
  cover_status?: 'ready' | 'pending' | 'unavailable'
  cover_cart_item_id?: string | null
  more_covers?: { cart_item_id: string; cover_url: string | null; cover_status: 'ready' | 'pending' | 'unavailable' }[]
  material_tasks?: { cart_item_id: string; title: string; voice: boolean; dedication: boolean }[]
  first_item_name?: string | null
}

export type OrderTab = 'shipping' | 'unpaid' | 'finished'
