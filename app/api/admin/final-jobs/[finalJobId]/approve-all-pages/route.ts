import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { getFinalPagePath, refreshFinalJobApprovalState } from '@/lib/finalReview'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type PageIntentMap = Record<string, string>
type ApprovalTask = {
  finalJobPageId: string
  pageIndex: number
  sourcePath: string
  approvedPath: string
  approvedSource: 'ai' | 'manual'
  reviewIntentId: string
}

function getPageIntent(pageIntents: PageIntentMap, pageIndex: number) {
  const value = pageIntents[String(pageIndex)]
  return typeof value === 'string' && value.trim() ? value.trim() : crypto.randomUUID()
}

export async function POST(
  request: Request,
  context: { params: Promise<{ finalJobId: string }> | { finalJobId: string } }
) {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { finalJobId } = await Promise.resolve(context.params)
  const body = await request.json().catch(() => ({}))
  const pageIntents = (body?.pageIntents && typeof body.pageIntents === 'object' ? body.pageIntents : {}) as PageIntentMap

  const { data: finalJob, error: finalJobError } = await supabaseAdmin
    .from('final_jobs')
    .select('final_job_id, order_id')
    .eq('final_job_id', finalJobId)
    .maybeSingle()
  if (finalJobError || !finalJob?.order_id) {
    return NextResponse.json({ error: finalJobError?.message || 'Final job not found' }, { status: 404 })
  }

  const { data: pages, error: pagesError } = await supabaseAdmin
    .from('final_job_pages')
    .select('final_job_page_id, page_index, status, ai_output_path, manual_output_path')
    .eq('final_job_id', finalJobId)
    .order('page_index', { ascending: true })

  if (pagesError || !pages?.length) {
    return NextResponse.json({ error: pagesError?.message || 'Final pages not found' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const results: Array<{
    pageIndex: number
    approvedPath?: string
    superseded?: boolean
    skipped?: boolean
    error?: string
  }> = []
  const tasks: ApprovalTask[] = []

  for (const [orderIndex, page] of pages.entries()) {
    if (page.status === 'processing' || page.status === 'rerunning' || page.status === 'failed') {
      results.push({ pageIndex: page.page_index, skipped: true, error: `Page status is ${page.status}` })
      continue
    }

    const sourcePath = page.manual_output_path || page.ai_output_path
    if (!sourcePath) {
      results.push({ pageIndex: page.page_index, skipped: true, error: 'Page has no output image' })
      continue
    }

    const reviewIntentId = getPageIntent(pageIntents, page.page_index)
    const approvedSource = page.manual_output_path ? 'manual' : 'ai'
    const approvedPath = getFinalPagePath(finalJob.order_id, orderIndex + 1)
    tasks.push({
      finalJobPageId: page.final_job_page_id,
      pageIndex: page.page_index,
      sourcePath,
      approvedPath,
      approvedSource,
      reviewIntentId,
    })
  }

  for (const task of tasks) {
    const { error: intentError } = await supabaseAdmin
      .from('final_job_pages')
      .update({
        review_intent_id: task.reviewIntentId,
        review_intent_type: 'approve_all',
        review_intent_at: now,
        updated_at: now,
      })
      .eq('final_job_page_id', task.finalJobPageId)

    if (intentError) {
      results.push({ pageIndex: task.pageIndex, error: intentError.message || 'Failed to set review intent' })
    }
  }

  const blockedPageIndexes = new Set(results.map((result) => result.pageIndex))
  for (const task of tasks) {
    if (blockedPageIndexes.has(task.pageIndex)) continue

    if (task.sourcePath !== task.approvedPath) {
      await supabaseAdmin.storage.from('raw-private').remove([task.approvedPath])
      const { error: copyError } = await supabaseAdmin.storage.from('raw-private').copy(task.sourcePath, task.approvedPath)
      if (copyError) {
        results.push({ pageIndex: task.pageIndex, error: copyError.message || 'Failed to copy approved image' })
        continue
      }
    }

    const { data: updatedPage, error: updateError } = await supabaseAdmin
      .from('final_job_pages')
      .update({
        status: 'approved',
        approved_output_path: task.approvedPath,
        approved_source: task.approvedSource,
        reviewed_by: admin.customer_id,
        reviewed_at: now,
        error_message: null,
        updated_at: now,
      })
      .eq('final_job_page_id', task.finalJobPageId)
      .eq('review_intent_id', task.reviewIntentId)
      .select('final_job_page_id')
      .maybeSingle()

    if (updateError) {
      results.push({ pageIndex: task.pageIndex, error: updateError.message || 'Failed to approve page' })
      continue
    }
    if (!updatedPage?.final_job_page_id) {
      results.push({ pageIndex: task.pageIndex, approvedPath: task.approvedPath, superseded: true })
      continue
    }

    results.push({ pageIndex: task.pageIndex, approvedPath: task.approvedPath, superseded: false })
  }

  await refreshFinalJobApprovalState(finalJobId)

  return NextResponse.json({
    ok: true,
    results,
    approvedPageIndexes: results
      .filter((result) => result.approvedPath && !result.superseded && !result.error)
      .map((result) => result.pageIndex),
  })
}
