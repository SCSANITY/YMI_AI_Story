import { supabaseAdmin } from '@/lib/supabaseAdmin'

// The direct-order writer binds an immutable purchase to this exact order line.
// A retired ebook or a client-supplied customization snapshot cannot qualify it.
export async function isOriginalPdfCheckout(orderId: string, lineId: string) {
  const { data, error } = await supabaseAdmin.rpc('is_original_pdf_checkout', {
    p_order: orderId,
    p_line: lineId,
  })
  // Until the companion DB contract is installed, retired digital lines stay retired.
  if (error?.code === 'PGRST202') return false
  if (error) throw new Error('Could not verify the original edition purchase')
  return data === true
}
