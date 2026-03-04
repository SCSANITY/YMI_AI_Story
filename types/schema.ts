export type CartItemStatus = 'draft' | 'cart' | 'ordered'

export type TransactionStatus =
  | 'unpaid'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'cancelled'
  | 'refunded'

export interface CartItemRow {
  cart_item_id: string
  owner_type: 'anon' | 'customer'
  anon_session_id?: string | null
  customer_id?: string | null
  product_type: 'ebook' | 'physical' | 'audio'
  status: CartItemStatus
  quantity: number
  creation_id?: string | null
  payment_id?: string | null
  price_at_purchase?: number | null
  final_job_id?: string | null
  order_id?: string | null
  created_at?: string
  updated_at?: string
}

export interface CreationRow {
  creation_id: string
  owner_type?: 'anon' | 'customer'
  customer_id?: string | null
  anon_session_id?: string | null
  template_id: string
  customize_snapshot: Record<string, unknown>
  preview_job_id?: string | null
  is_archived?: boolean | null
  deleted_at?: string | null
  created_at?: string
  updated_at?: string
}

export interface OrderRow {
  order_id: string
  display_id?: string | null
  payment_id?: string | null
  customer_id?: string | null
  email?: string | null
  shipping_address: Record<string, unknown>
  billing_address?: Record<string, unknown> | null
  order_status: TransactionStatus
  created_at?: string
}

export interface OrderReviewRow {
  review_id: string
  order_id: string
  customer_id?: string | null
  template_id: string
  rating: number
  comment?: string | null
  created_at?: string
  updated_at?: string
}

export interface VerificationCodeRow {
  verification_id: string
  email: string
  code: string
  expires_at: string
  created_at?: string
}
