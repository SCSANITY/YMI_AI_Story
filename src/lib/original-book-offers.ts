import 'server-only'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export type OriginalFormat = 'digital' | 'basic' | 'supreme'
export type OriginalOffer = { format: OriginalFormat; priceCents: number; listPriceCents: number; discountPercent: number | null; priceVersion: number; sourceVersion: string | null; coverPath: string | null }

export function originalCheckoutEnabled() {
  return process.env.ORIGINAL_BOOK_CHECKOUT_ENABLED === 'true'
}

export async function originalBookOffers(story: string): Promise<OriginalOffer[]> {
  if (!originalCheckoutEnabled()) return []
  const { data, error } = await supabaseAdmin.from('original_book_offers')
    .select('format, price_usd, list_price_usd, sale_price_usd, display_discount_percent, price_version, source_version, cover_path, templates!inner(is_active, is_coming_soon)')
    .eq('template_id', story).eq('language', 'en').eq('is_placeholder', false)
    .eq('templates.is_active', true).eq('templates.is_coming_soon', false)
  if (error) throw new Error('Original book offers unavailable')
  return (data ?? []).map(row => ({
    format: row.format, priceCents: Math.round(Number(row.price_usd) * 100),
    listPriceCents: Math.round(Number(row.list_price_usd ?? row.price_usd) * 100),
    discountPercent: row.sale_price_usd == null ? null : Number(row.display_discount_percent ?? Math.round((1 - Number(row.price_usd) / Number(row.list_price_usd)) * 100)),
    priceVersion: Number(row.price_version), sourceVersion: row.source_version, coverPath: row.cover_path,
  }))
}
