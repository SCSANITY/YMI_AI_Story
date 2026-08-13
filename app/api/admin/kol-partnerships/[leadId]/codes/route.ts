import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { loadAdminKolCodes } from '@/lib/admin-kol-codes-server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/support-ticket'

type EffectType = 'fixed_amount' | 'percentage'

function jsonNoStore(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function parseEffectType(value: unknown): EffectType | null {
  return value === 'fixed_amount' || value === 'percentage' ? value : null
}

function parsePositiveNumber(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function parseOptionalPositiveInteger(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN
}

function parseOptionalFutureTimestamp(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string') return undefined
  const timestamp = new Date(value)
  if (!Number.isFinite(timestamp.getTime()) || timestamp.getTime() <= Date.now()) {
    return undefined
  }
  return timestamp.toISOString()
}

function parseCodeMutation(body: Record<string, unknown>, includeCode: boolean) {
  const effectType = parseEffectType(body.effectType)
  const value = parsePositiveNumber(body.value)
  const expiresAt = parseOptionalFutureTimestamp(body.expiresAt)
  const maxRedemptions = parseOptionalPositiveInteger(body.maxRedemptions)
  const maxRedemptionsPerCustomer = parseOptionalPositiveInteger(
    body.maxRedemptionsPerCustomer
  )
  const code = includeCode ? String(body.code || '').trim().toUpperCase() : null

  if (!effectType || value === null) return { error: 'Enter a valid Code effect' } as const
  if (effectType === 'percentage' && value > 100) {
    return { error: 'Percentage must be between 0 and 100' } as const
  }
  if (expiresAt === undefined) return { error: 'Expiry must be a future date' } as const
  if (Number.isNaN(maxRedemptions) || Number.isNaN(maxRedemptionsPerCustomer)) {
    return { error: 'Usage limits must be positive whole numbers' } as const
  }
  if (includeCode && !/^[A-Z0-9][A-Z0-9_-]{3,31}$/.test(code || '')) {
    return { error: 'Code must contain 4-32 letters, numbers, underscores, or hyphens' } as const
  }

  return {
    value: {
      code,
      effectType,
      value,
      expiresAt,
      maxRedemptions,
      maxRedemptionsPerCustomer,
    },
  } as const
}

function rpcErrorResponse(error: { code?: string; message?: string }) {
  if (error.code === '23505' || error.code === '40001') {
    return jsonNoStore({ error: error.message || 'The KOL Code changed or is already reserved' }, 409)
  }
  if (error.code === 'P0002') {
    return jsonNoStore({ error: error.message || 'KOL Code not found' }, 404)
  }
  if (error.code === '22023') {
    return jsonNoStore({ error: error.message || 'Invalid KOL Code settings' }, 400)
  }
  console.error('KOL Code RPC failed', error)
  return jsonNoStore({ error: 'Unable to update partnership Code' }, 500)
}

async function committedCodes(leadId: string) {
  return jsonNoStore({ ok: true, codes: await loadAdminKolCodes(leadId) })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ leadId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)

  const { leadId } = await context.params
  if (!isUuid(leadId)) return jsonNoStore({ error: 'Invalid partnership lead id' }, 400)

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const action = body.action === 'rotate' ? 'rotate' : body.action === 'create' ? 'create' : null
  if (!action) return jsonNoStore({ error: 'Unsupported KOL Code action' }, 400)
  const mutation = parseCodeMutation(body, true)
  if ('error' in mutation) return jsonNoStore({ error: mutation.error }, 400)

  try {
    if (action === 'create') {
      const { error } = await supabaseAdmin.rpc('create_kol_collaboration_code', {
        p_admin_customer_id: admin.customer_id,
        p_lead_id: leadId,
        p_code: mutation.value.code,
        p_effect_type: mutation.value.effectType,
        p_value: mutation.value.value,
        p_expires_at: mutation.value.expiresAt,
        p_max_redemptions: mutation.value.maxRedemptions,
        p_max_redemptions_per_customer: mutation.value.maxRedemptionsPerCustomer,
      })
      if (error) return rpcErrorResponse(error)
    } else {
      const currentInstrumentId = String(body.currentInstrumentId || '')
      const expectedUpdatedAt = String(body.expectedUpdatedAt || '')
      if (!isUuid(currentInstrumentId) || !expectedUpdatedAt) {
        return jsonNoStore({ error: 'The active Code and version are required for rotation' }, 400)
      }
      const { error } = await supabaseAdmin.rpc('rotate_kol_collaboration_code', {
        p_admin_customer_id: admin.customer_id,
        p_lead_id: leadId,
        p_current_instrument_id: currentInstrumentId,
        p_expected_updated_at: expectedUpdatedAt,
        p_code: mutation.value.code,
        p_effect_type: mutation.value.effectType,
        p_value: mutation.value.value,
        p_expires_at: mutation.value.expiresAt,
        p_max_redemptions: mutation.value.maxRedemptions,
        p_max_redemptions_per_customer: mutation.value.maxRedemptionsPerCustomer,
      })
      if (error) return rpcErrorResponse(error)
    }

    return await committedCodes(leadId)
  } catch (error) {
    console.error('Failed to commit KOL Code', error)
    return jsonNoStore({ error: 'Unable to update partnership Code' }, 500)
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ leadId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, 403)

  const { leadId } = await context.params
  if (!isUuid(leadId)) return jsonNoStore({ error: 'Invalid partnership lead id' }, 400)

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const instrumentId = String(body.instrumentId || '')
  const expectedUpdatedAt = String(body.expectedUpdatedAt || '')
  if (!isUuid(instrumentId) || !expectedUpdatedAt || typeof body.isActive !== 'boolean') {
    return jsonNoStore({ error: 'The Code, version, and active state are required' }, 400)
  }
  const mutation = parseCodeMutation(body, false)
  if ('error' in mutation) return jsonNoStore({ error: mutation.error }, 400)

  try {
    const { error } = await supabaseAdmin.rpc('update_kol_collaboration_code', {
      p_admin_customer_id: admin.customer_id,
      p_lead_id: leadId,
      p_instrument_id: instrumentId,
      p_expected_updated_at: expectedUpdatedAt,
      p_effect_type: mutation.value.effectType,
      p_value: mutation.value.value,
      p_expires_at: mutation.value.expiresAt,
      p_max_redemptions: mutation.value.maxRedemptions,
      p_max_redemptions_per_customer: mutation.value.maxRedemptionsPerCustomer,
      p_is_active: body.isActive,
    })
    if (error) return rpcErrorResponse(error)
    return await committedCodes(leadId)
  } catch (error) {
    console.error('Failed to edit KOL Code', error)
    return jsonNoStore({ error: 'Unable to update partnership Code' }, 500)
  }
}
