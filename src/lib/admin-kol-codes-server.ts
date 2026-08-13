import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { KolPartnershipCode } from '@/lib/kol-partnerships'

const INSTRUMENT_FIELDS = [
  'instrument_id',
  'offer_id',
  'code',
  'is_active',
  'status',
  'max_redemptions',
  'max_redemptions_per_customer',
  'reserved_count',
  'paid_count',
  'created_at',
  'updated_at',
].join(', ')

const OFFER_FIELDS = [
  'offer_id',
  'name',
  'description',
  'effect_type',
  'effect_config',
  'is_active',
  'expires_at',
  'updated_at',
].join(', ')

type InstrumentRow = {
  instrument_id: string
  offer_id: string
  code: string | null
  is_active: boolean
  status: string
  max_redemptions: number | null
  max_redemptions_per_customer: number | null
  reserved_count: number
  paid_count: number
  created_at: string
  updated_at: string
}

type OfferRow = {
  offer_id: string
  name: string
  description: string | null
  effect_type: string
  effect_config: unknown
  is_active: boolean
  expires_at: string | null
  updated_at: string
}

function nullableInteger(value: unknown, field: string) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new Error(`KOL Code ${field} is invalid`)
  }
  return value
}

function requireNumber(value: unknown, field: string) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) {
    throw new Error(`KOL Code ${field} is invalid`)
  }
  return number
}

function readEffectValue(effectType: unknown, config: unknown) {
  if (!config || typeof config !== 'object') {
    throw new Error('KOL Code effect configuration is invalid')
  }
  if (effectType === 'fixed_amount') {
    return requireNumber((config as Record<string, unknown>).amount_usd, 'fixed amount')
  }
  if (effectType === 'percentage') {
    return requireNumber((config as Record<string, unknown>).percent, 'percentage')
  }
  throw new Error('KOL Code effect type is invalid')
}

export async function loadAdminKolCodes(leadId: string): Promise<KolPartnershipCode[]> {
  const { data: instruments, error: instrumentError } = await supabaseAdmin
    .from('discount_instruments')
    .select(INSTRUMENT_FIELDS)
    .eq('collaboration_lead_id', leadId)
    .eq('source', 'collaboration')
    .order('created_at', { ascending: false })

  if (instrumentError) throw new Error('Unable to load partnership Codes')
  const instrumentRows = (instruments ?? []) as unknown as InstrumentRow[]
  if (!instrumentRows.length) return []

  const offerIds = Array.from(new Set(instrumentRows.map((row) => row.offer_id)))
  const { data: offers, error: offerError } = await supabaseAdmin
    .from('discount_offers')
    .select(OFFER_FIELDS)
    .in('offer_id', offerIds)

  if (offerError) throw new Error('Unable to load partnership Code offers')
  const offerRows = (offers ?? []) as unknown as OfferRow[]
  const offerById = new Map(offerRows.map((offer) => [offer.offer_id, offer]))

  return instrumentRows.map((instrument): KolPartnershipCode => {
    const offer = offerById.get(instrument.offer_id)
    if (!offer) throw new Error('KOL Code offer is missing')
    if (
      instrument.status !== 'active' &&
      instrument.status !== 'disabled' &&
      instrument.status !== 'expired' &&
      instrument.status !== 'used'
    ) {
      throw new Error('KOL Code status is invalid')
    }
    if (offer.effect_type !== 'fixed_amount' && offer.effect_type !== 'percentage') {
      throw new Error('KOL Code offer type is invalid')
    }

    return {
      instrument_id: instrument.instrument_id,
      offer_id: instrument.offer_id,
      code: instrument.code || '',
      is_active: Boolean(instrument.is_active),
      status: instrument.status,
      max_redemptions: nullableInteger(instrument.max_redemptions, 'usage limit'),
      max_redemptions_per_customer: nullableInteger(
        instrument.max_redemptions_per_customer,
        'per-customer limit'
      ),
      reserved_count: requireNumber(instrument.reserved_count, 'reserved count'),
      paid_count: requireNumber(instrument.paid_count, 'paid count'),
      created_at: instrument.created_at,
      updated_at: instrument.updated_at,
      offer: {
        name: offer.name,
        description: offer.description ?? null,
        effect_type: offer.effect_type,
        value: readEffectValue(offer.effect_type, offer.effect_config),
        is_active: Boolean(offer.is_active),
        expires_at: offer.expires_at ?? null,
        updated_at: offer.updated_at,
      },
    }
  })
}
