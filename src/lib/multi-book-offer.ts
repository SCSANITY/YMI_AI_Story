// Server-only rule loader for the multi-book offer. Imports supabaseAdmin and
// must never enter a client bundle; client code uses ./multi-book-offer-core
// and receives the rule via /api/multi-book-offer or a server render.

import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  normalizeMultiBookOfferRule,
  type MultiBookOfferRule,
} from '@/lib/multi-book-offer-core'

export const MULTI_BOOK_OFFER_SINGLETON_KEY = 'global'

export async function getMultiBookOfferRule(): Promise<MultiBookOfferRule | null> {
  const { data, error } = await supabaseAdmin
    .from('multi_book_offer_rule')
    .select('enabled, effect_type, value, min_items')
    .eq('singleton_key', MULTI_BOOK_OFFER_SINGLETON_KEY)
    .maybeSingle()
  if (error) {
    throw new Error(`Failed to load multi-book offer rule: ${error.message}`)
  }
  return normalizeMultiBookOfferRule(data)
}
