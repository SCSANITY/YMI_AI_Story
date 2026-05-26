import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(
  request: Request,
  context: { params: Promise<{ finalJobId: string; pageIndex: string }> | { finalJobId: string; pageIndex: string } }
) {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { finalJobId, pageIndex: rawPageIndex } = await Promise.resolve(context.params)
  const pageIndex = Number(rawPageIndex)
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    return NextResponse.json({ error: 'Invalid page index' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({}))
  const reviewNote = String(body?.reviewNote ?? body?.note ?? '').trim().slice(0, 1000)
  const reviewIntentId =
    typeof body?.reviewIntentId === 'string' && body.reviewIntentId.trim()
      ? body.reviewIntentId.trim()
      : crypto.randomUUID()

  const now = new Date().toISOString()
  const { error: intentError } = await supabaseAdmin
    .from('final_job_pages')
    .update({
      review_intent_id: reviewIntentId,
      review_intent_type: 'needs_fix',
      review_intent_at: now,
      updated_at: now,
    })
    .eq('final_job_id', finalJobId)
    .eq('page_index', pageIndex)
    .in('status', ['pending_review', 'approved', 'replaced', 'needs_fix'])

  if (intentError) {
    return NextResponse.json({ error: intentError.message || 'Failed to set review intent' }, { status: 500 })
  }

  const { data: updatedPage, error } = await supabaseAdmin
    .from('final_job_pages')
    .update({
      status: 'needs_fix',
      review_note: reviewNote || null,
      reviewed_by: admin.customer_id,
      reviewed_at: now,
      updated_at: now,
    })
    .eq('final_job_id', finalJobId)
    .eq('page_index', pageIndex)
    .eq('review_intent_id', reviewIntentId)
    .select('final_job_page_id')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message || 'Failed to mark page as needs fix' }, { status: 500 })
  }
  if (!updatedPage?.final_job_page_id) {
    return NextResponse.json({ ok: true, superseded: true })
  }

  const { count } = await supabaseAdmin
    .from('final_job_pages')
    .select('final_job_page_id', { count: 'exact', head: true })
    .eq('final_job_id', finalJobId)
    .eq('status', 'approved')

  await supabaseAdmin
    .from('final_jobs')
    .update({
      approved_pages: count ?? 0,
      review_status: 'needs_fix',
      status: 'needs_fix',
      updated_at: now,
    })
    .eq('final_job_id', finalJobId)

  return NextResponse.json({ ok: true, superseded: false, reviewIntentId })
}
