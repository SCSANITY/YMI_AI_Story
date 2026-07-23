import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const SETTING_KEY = 'creator_promo_config'
const DEFAULT_CONFIG = {
  enabled: true,
  suffix: '-YMI',
  discount_amount_usd: 1,
  first_order_only: true,
}

function normalizeConfig(value: unknown) {
  const input = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const discount = Number(input.discount_amount_usd ?? input.discountAmountUsd ?? DEFAULT_CONFIG.discount_amount_usd)
  const suffix = String(input.suffix ?? DEFAULT_CONFIG.suffix).trim().toUpperCase() || DEFAULT_CONFIG.suffix
  return {
    enabled: input.enabled !== false,
    suffix: suffix.startsWith('-') ? suffix : `-${suffix}`,
    discount_amount_usd: Number.isFinite(discount) && discount > 0 ? discount : DEFAULT_CONFIG.discount_amount_usd,
    first_order_only: input.first_order_only !== false && input.firstOrderOnly !== false,
  }
}

async function loadConfig() {
  const { data, error } = await supabaseAdmin
    .from('admin_settings')
    .select('setting_value')
    .eq('setting_key', SETTING_KEY)
    .maybeSingle()
  if (error) throw error
  return normalizeConfig(data?.setting_value)
}

export async function GET() {
  const admin = await requireAdminCustomer()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    const config = await loadConfig()
    return NextResponse.json(
      { ok: true, config },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load creator promo config'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdminCustomer()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await request.json().catch(() => ({}))
    const current = await loadConfig()
    const next = normalizeConfig({
      ...current,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : current.enabled,
      discount_amount_usd:
        body.discountAmountUsd != null || body.discount_amount_usd != null
          ? Number(body.discountAmountUsd ?? body.discount_amount_usd)
          : current.discount_amount_usd,
      suffix: body.suffix ?? current.suffix,
      first_order_only:
        typeof body.firstOrderOnly === 'boolean'
          ? body.firstOrderOnly
          : typeof body.first_order_only === 'boolean'
            ? body.first_order_only
            : current.first_order_only,
    })

    const { error } = await supabaseAdmin.from('admin_settings').upsert({
      setting_key: SETTING_KEY,
      setting_value: next,
      updated_by: admin.customer_id,
      updated_at: new Date().toISOString(),
    })

    if (error) throw error
    return NextResponse.json({ ok: true, config: next })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update creator promo config'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
