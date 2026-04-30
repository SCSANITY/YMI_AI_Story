import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function normalizeQuestion(value: unknown) {
  return String(value ?? '').trim().slice(0, 4000)
}

export async function POST(request: Request) {
  const supabase = await createServerSupabase()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user?.id) {
    return NextResponse.json({ error: 'Please log in before submitting a question.' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const question = normalizeQuestion(body?.question)
  if (!question) {
    return NextResponse.json({ error: 'Please enter your question.' }, { status: 400 })
  }

  const { data: customer, error: customerError } = await supabaseAdmin
    .from('customers')
    .select('customer_id, email, display_name')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (customerError || !customer?.customer_id) {
    return NextResponse.json({ error: 'Customer profile not found.' }, { status: 404 })
  }

  const { error } = await supabaseAdmin.from('support_questions').insert({
    customer_id: customer.customer_id,
    email: customer.email || user.email,
    display_name: customer.display_name || null,
    question,
    status: 'new',
  })

  if (error) {
    return NextResponse.json({ error: 'Failed to submit your question.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
