import 'server-only'

import { supabaseAdmin } from '@/lib/supabaseAdmin'

type ShippingContextInput = {
  shippingAmountUsd?: unknown
  shippingRateSnapshot?: unknown
  shippingMethod?: unknown
  shippingZoneCode?: unknown
}

export async function updateUnpaidOrderShippingContext(
  orderId: string,
  input: ShippingContextInput
) {
  const updates: Record<string, unknown> = {}
  if (input.shippingAmountUsd !== undefined) {
    updates.shipping_amount_usd = Math.max(0, Number(input.shippingAmountUsd ?? 0))
  }
  if (input.shippingRateSnapshot !== undefined) {
    updates.shipping_rate_snapshot = input.shippingRateSnapshot ?? null
  }
  if (input.shippingMethod !== undefined) {
    updates.shipping_method = input.shippingMethod ? String(input.shippingMethod) : null
  }
  if (input.shippingZoneCode !== undefined) {
    updates.shipping_zone_code = input.shippingZoneCode ? String(input.shippingZoneCode) : null
  }
  if (Object.keys(updates).length === 0) return

  await supabaseAdmin
    .from('orders')
    .update(updates)
    .eq('order_id', orderId)
    .eq('order_status', 'unpaid')
}
