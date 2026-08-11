import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/support-ticket'

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
  const orderId = body?.orderId == null || body?.orderId === '' ? null : String(body.orderId)
  if (!question) {
    return NextResponse.json({ error: 'Please enter your question.' }, { status: 400 })
  }
  if (orderId && !isUuid(orderId)) {
    return NextResponse.json({ error: 'Invalid order reference.' }, { status: 400 })
  }

  const { data: customer, error: customerError } = await supabaseAdmin
    .from('customers')
    .select('customer_id, email, display_name')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (customerError || !customer?.customer_id) {
    return NextResponse.json({ error: 'Customer profile not found.' }, { status: 404 })
  }

  const { data: ticket, error } = await supabaseAdmin.rpc('create_support_question', {
    p_customer_id: customer.customer_id,
    p_email: customer.email || user.email || '',
    p_display_name: customer.display_name || '',
    p_question: question,
    p_order_id: orderId,
  })

  if (error) {
    if (error.message?.includes('support_rate_limited')) {
      return NextResponse.json(
        { error: 'You have submitted several questions recently. Please try again later.' },
        { status: 429 }
      )
    }
    if (error.message?.includes('support_order_not_owned')) {
      return NextResponse.json({ error: 'This order is not linked to your account.' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Failed to submit your question.' }, { status: 500 })
  }

  const createdTicket = Array.isArray(ticket) ? ticket[0] : ticket
  return NextResponse.json({
    success: true,
    ticketCode: createdTicket?.ticket_code || null,
  })
}
