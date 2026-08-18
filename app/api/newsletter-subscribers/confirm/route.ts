import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function redirect(request: Request, status: 'confirmed' | 'invalid') {
  return NextResponse.redirect(new URL(`/newsletter/${status}`, request.url))
}

export async function GET(request: Request) {
  const token = String(new URL(request.url).searchParams.get('token') || '').trim()
  if (!/^[a-f0-9]{64}$/.test(token)) return redirect(request, 'invalid')

  const hash = createHash('sha256').update(token).digest('hex')
  const now = new Date().toISOString()
  const { data, error } = await supabaseAdmin
    .from('newsletter_subscribers')
    .update({
      status: 'active',
      confirmation_token_hash: null,
      confirmation_expires_at: null,
      subscribed_at: now,
      updated_at: now,
    })
    .eq('status', 'pending')
    .eq('confirmation_token_hash', hash)
    .gt('confirmation_expires_at', now)
    .select('subscriber_id')
    .maybeSingle()

  if (error || !data?.subscriber_id) return redirect(request, 'invalid')
  return redirect(request, 'confirmed')
}
