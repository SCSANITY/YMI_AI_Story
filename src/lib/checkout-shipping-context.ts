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
  const values = [input.shippingAmountUsd, input.shippingMethod, input.shippingRateSnapshot, input.shippingZoneCode]
  if (values.every(value => value === undefined)) return
  // Never turn an unhydrated client's 0/null placeholders into persisted
  // shipping. A real zero-priced quote still has its method and snapshot.
  if (typeof input.shippingAmountUsd !== 'number' || !Number.isFinite(input.shippingAmountUsd) || input.shippingAmountUsd < 0 ||
      !['standard', 'speedy'].includes(String(input.shippingMethod)) ||
      !input.shippingRateSnapshot || typeof input.shippingRateSnapshot !== 'object' || Array.isArray(input.shippingRateSnapshot) ||
      typeof input.shippingZoneCode !== 'string' || !input.shippingZoneCode.trim()) {
    throw new Error('Please complete your shipping details before applying an offer.')
  }
  const updates = {
    shipping_amount_usd: input.shippingAmountUsd,
    shipping_method: input.shippingMethod,
    shipping_rate_snapshot: input.shippingRateSnapshot,
    shipping_zone_code: input.shippingZoneCode,
  }

  const { error } = await supabaseAdmin
    .from('orders')
    .update(updates)
    .eq('order_id', orderId)
    .eq('order_status', 'unpaid')
  if (error) throw new Error('Failed to save shipping details.')
}
