import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrCreateAnonSession } from '@/lib/session'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeEmail(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const email = normalizeEmail(body?.email)

  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
  }

  const [supabase, anonSessionId] = await Promise.all([
    createServerSupabase(),
    getOrCreateAnonSession().catch(() => null),
  ])
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let customerId: string | null = null
  if (user?.id) {
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('customer_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    customerId = customer?.customer_id ?? null
  }

  const now = new Date().toISOString()
  const { error } = await supabaseAdmin
    .from('newsletter_subscribers')
    .upsert(
      {
        email,
        customer_id: customerId,
        anon_session_id: customerId ? null : anonSessionId,
        source: 'footer',
        status: 'active',
        subscribed_at: now,
        updated_at: now,
      },
      { onConflict: 'email' }
    )

  if (error) {
    return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
