import { supabaseAdmin } from '@/lib/supabaseAdmin'

// The direct-order writer binds an immutable purchase to this exact order line.
// A retired ebook or a client-supplied customization snapshot cannot qualify it.
export async function readOriginalBookPurchase(orderId: string, lineId: string): Promise<{ format: 'digital' | 'basic' | 'supreme'; coverPath: string } | null> {
  const { data, error } = await supabaseAdmin.rpc('read_original_book_purchase', {
    p_order: orderId,
    p_line: lineId,
  })
  // Until the companion DB contract is installed, retired digital lines stay retired.
  if (error?.code === 'PGRST202') return null
  if (error) throw new Error('Could not verify the original edition purchase')
  if (!data || !['digital', 'basic', 'supreme'].includes(data.format) || typeof data.coverPath !== 'string' || !data.coverPath) return null
  return { format: data.format, coverPath: data.coverPath }
}
