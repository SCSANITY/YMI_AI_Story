import 'server-only'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type OriginalFormat = 'digital' | 'basic' | 'supreme'
export type OriginalOffer = { format: OriginalFormat; priceCents: number; priceVersion: number; sourceVersion: string; coverPath: string }

export function originalCheckoutEnabled() {
  return process.env.ORIGINAL_BOOK_CHECKOUT_ENABLED === 'true'
}

export async function originalBookOffers(story: string): Promise<OriginalOffer[]> {
  if (!originalCheckoutEnabled()) return []
  const { data, error } = await supabaseAdmin.from('original_book_offers')
    .select('format, price_usd, price_version, source_version, cover_path')
    .eq('template_id', story).eq('language', 'en')
  if (error) throw new Error('Original book offers unavailable')
  return (data ?? []).map(row => ({
    format: row.format, priceCents: Math.round(Number(row.price_usd) * 100),
    priceVersion: Number(row.price_version), sourceVersion: row.source_version, coverPath: row.cover_path,
  }))
}
