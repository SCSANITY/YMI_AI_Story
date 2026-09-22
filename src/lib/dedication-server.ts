import 'server-only'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { ownerFilter, type CheckoutOwner } from '@/lib/checkout-owner'
import { type DedicationChoice } from '@/lib/dedication'

export async function loadOwnedDedicationChoices(owner: CheckoutOwner, creationIds: string[]): Promise<DedicationChoice[]> {
  const ids = [...new Set(creationIds)]
  if (!ids.length) return []
  const filter = ownerFilter(owner)
  const { data: creations, error: creationError } = await supabaseAdmin
    .from('creations').select('creation_id').in('creation_id', ids)
    .eq('owner_type', filter.owner_type).eq(filter.column, filter.value)
  if (creationError || !creations || creations.length !== ids.length) {
    throw new Error('Creation not found for current owner')
  }
  const [{ data: rows, error: choiceError }, { data: paidItems, error: paidError }] = await Promise.all([
    supabaseAdmin.from('creation_dedications').select('creation_id,decision,body,revision').in('creation_id', ids),
    supabaseAdmin.from('cart_items').select('creation_id').in('creation_id', ids).not('payment_id', 'is', null),
  ])
  if (choiceError || paidError) throw new Error('Unable to load dedication choices')
  const byId = new Map((rows || []).map(row => [String(row.creation_id), row]))
  const purchasedIds = new Set((paidItems || []).map(row => String(row.creation_id)))
  return ids.map(creationId => {
    const row = byId.get(creationId)
    return {
      creationId,
      decision: row?.decision === 'confirmed' ? 'confirmed' : row?.decision === 'skipped' ? 'skipped' : 'undecided',
      body: row?.decision === 'confirmed' ? String(row.body || '') : null,
      revision: row ? Number(row.revision) : null,
      previouslyPurchased: purchasedIds.has(creationId),
    }
  })
}

export async function prepareOrderDedications(orderId: string, owner: CheckoutOwner) {
  const ownerId = owner.ownerType === 'customer' ? owner.customerId : owner.anonSessionId
  const { data, error } = await supabaseAdmin.rpc('dedication_prepare_order', {
    p_order_id: orderId, p_owner_type: owner.ownerType, p_owner_id: ownerId,
  })
  if (error || !data) throw new Error(error?.message || 'Dedication choice is required before payment')
  return data
}
