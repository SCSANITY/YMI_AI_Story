import { revalidatePath } from 'next/cache'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { noStoreJson } from '@/lib/http-response'
import { MULTI_BOOK_OFFER_SINGLETON_KEY } from '@/lib/multi-book-offer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const RULE_FIELDS = 'rule_id, singleton_key, enabled, effect_type, value, min_items, updated_at'
const EFFECT_TYPES = new Set(['percentage', 'fixed_amount'])

export async function GET() {
  if (!await requireAdminCustomer()) return noStoreJson({ error: 'Forbidden' }, 403)
  const { data, error } = await supabaseAdmin.from('multi_book_offer_rule')
    .select(RULE_FIELDS).eq('singleton_key', MULTI_BOOK_OFFER_SINGLETON_KEY).maybeSingle()
  if (error) return noStoreJson({ error: 'Failed to load multi-book offer.' }, 500)
  if (!data) return noStoreJson({ error: 'No multi-book offer rule is configured.' }, 409)
  return noStoreJson({ rule: data })
}

export async function PATCH(request: Request) {
  if (!await requireAdminCustomer()) return noStoreJson({ error: 'Forbidden' }, 403)
  const body = await request.json().catch(() => null)

  const enabled = body?.enabled === true
  const effectType = String(body?.effectType || '')
  const value = Number(body?.value)
  const minItems = Number(body?.minItems)

  if (!EFFECT_TYPES.has(effectType)) {
    return noStoreJson({ error: 'Offer type must be percentage or fixed_amount.' }, 400)
  }
  if (!Number.isFinite(value) || value <= 0) {
    return noStoreJson({ error: 'Value must be a positive number.' }, 400)
  }
  if (effectType === 'percentage' && value > 100) {
    return noStoreJson({ error: 'Percentage cannot exceed 100.' }, 400)
  }
  if (!Number.isInteger(minItems) || minItems < 2) {
    return noStoreJson({ error: 'Minimum books must be a whole number of at least 2.' }, 400)
  }

  // All access is keyed on the singleton; concurrent saves serialize on the one row.
  const { data, error } = await supabaseAdmin.from('multi_book_offer_rule')
    .update({
      enabled,
      effect_type: effectType,
      value,
      min_items: minItems,
      updated_at: new Date().toISOString(),
    })
    .eq('singleton_key', MULTI_BOOK_OFFER_SINGLETON_KEY)
    .select(RULE_FIELDS)
  if (error) return noStoreJson({ error: 'Failed to save multi-book offer.' }, 500)
  if (!data?.length) return noStoreJson({ error: 'No multi-book offer rule is configured.' }, 409)

  // The home page is ISR-cached; drop the cached render so the banner follows
  // the toggle on the next visit instead of waiting out the revalidate window.
  revalidatePath('/', 'page')

  return noStoreJson({ rule: data[0] })
}
