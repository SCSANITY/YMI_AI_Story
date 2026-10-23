import { requireAdminCustomer } from '@/lib/adminAuth'
import { noStoreJson } from '@/lib/http-response'
import { parseShippingDiscountPercent } from '@/lib/shipping-pricing'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const RULE_FIELDS = 'rule_id, rule_name, method_code, zone_code, discount_percent, min_charge_hkd, enabled'

export async function GET() {
  if (!await requireAdminCustomer()) return noStoreJson({ error: 'Forbidden' }, 403)
  const { data, error } = await supabaseAdmin.from('shipping_pricing_rules')
    .select(RULE_FIELDS).order('rule_name', { ascending: true })
  if (error) return noStoreJson({ error: 'Failed to load shipping discount.' }, 500)
  return noStoreJson({ rules: data ?? [] })
}

export async function PATCH(request: Request) {
  if (!await requireAdminCustomer()) return noStoreJson({ error: 'Forbidden' }, 403)
  const body = await request.json().catch(() => null)
  let discountPercent: number
  try {
    discountPercent = parseShippingDiscountPercent(body?.discountPercent)
  } catch (error) {
    return noStoreJson({ error: (error as Error).message }, 400)
  }

  // One statement updates existing rules together, including disabled rules, so
  // enabling an existing rule later does not revive an old promotional percentage.
  // No tariff, minimum, routing, coupon, paid-order or base-rate field is changed.
  const { data, error } = await supabaseAdmin.from('shipping_pricing_rules')
    .update({ discount_percent: discountPercent }).not('rule_id', 'is', null)
    .select(RULE_FIELDS)
  if (error) return noStoreJson({ error: 'Failed to save shipping discount.' }, 500)
  if (!data?.length) return noStoreJson({ error: 'No shipping pricing rules are configured.' }, 409)
  return noStoreJson({ rules: data })
}
