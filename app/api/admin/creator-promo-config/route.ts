import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  CREATOR_PROMO_DISCOUNT_USD,
  CREATOR_PROMO_FIRST_ORDER_ONLY,
} from '@/lib/creator-promo-policy'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const SETTING_KEY = 'creator_promo_config'
const DEFAULT_CONFIG = {
  enabled: true,
  suffix: '-YMI',
}

function normalizeConfig(value: unknown) {
  const input = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  const suffix = String(input.suffix ?? DEFAULT_CONFIG.suffix).trim().toUpperCase() || DEFAULT_CONFIG.suffix
  return {
    enabled: input.enabled !== false,
    suffix: suffix.startsWith('-') ? suffix : `-${suffix}`,
    discount_amount_usd: CREATOR_PROMO_DISCOUNT_USD,
    first_order_only: CREATOR_PROMO_FIRST_ORDER_ONLY,
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
      suffix: body.suffix ?? current.suffix,
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
