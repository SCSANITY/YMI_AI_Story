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

  const { data: finalJob } = await supabaseAdmin
    .from('final_jobs')
    .select('final_job_id, job_id, order_id, review_status')
    .eq('final_job_id', finalJobId)
    .maybeSingle()
  if (!finalJob?.job_id) {
    return NextResponse.json({ error: 'Final job not found' }, { status: 404 })
  }

  const { data: page } = await supabaseAdmin
    .from('final_job_pages')
    .select('final_job_page_id, page_index, status, attempt_count')
    .eq('final_job_id', finalJobId)
    .eq('page_index', pageIndex)
    .maybeSingle()
  if (!page?.final_job_page_id) {
    return NextResponse.json({ error: 'Final page not found' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const nextAttemptCount = Number(page.attempt_count ?? 0) + 1
  const { error: pageUpdateError } = await supabaseAdmin
    .from('final_job_pages')
    .update({
      status: 'rerunning',
      review_note: reviewNote || null,
      reviewed_by: admin.customer_id,
      reviewed_at: now,
      attempt_count: nextAttemptCount,
      error_message: null,
      updated_at: now,
    })
    .eq('final_job_page_id', page.final_job_page_id)

  if (pageUpdateError) {
    return NextResponse.json({ error: pageUpdateError.message || 'Failed to mark page for rerun' }, { status: 500 })
  }

  const { data: currentJob } = await supabaseAdmin
    .from('jobs')
    .select('input_snapshot, output_assets, status, progress')
    .eq('job_id', finalJob.job_id)
    .maybeSingle()

  const inputSnapshot = (currentJob?.input_snapshot || {}) as Record<string, unknown>
  const existingPageIndices = Array.isArray(inputSnapshot.final_page_indices)
    ? inputSnapshot.final_page_indices
    : []

  const { error: jobUpdateError } = await supabaseAdmin
    .from('jobs')
    .update({
      status: 'queued',
      progress: 0,
      input_snapshot: {
        ...inputSnapshot,
        final_page_indices: [pageIndex],
        final_rerun_page_index: pageIndex,
      },
      updated_at: now,
    })
    .eq('job_id', finalJob.job_id)

  if (jobUpdateError) {
    return NextResponse.json({ error: jobUpdateError.message || 'Failed to requeue final job' }, { status: 500 })
  }

  await supabaseAdmin
    .from('final_jobs')
    .update({
      status: 'needs_fix',
      review_status: 'needs_fix',
      updated_at: now,
    })
    .eq('final_job_id', finalJobId)

  return NextResponse.json({
    ok: true,
    requeuedPageIndex: pageIndex,
    previousFinalPageIndices: existingPageIndices,
  })
}
