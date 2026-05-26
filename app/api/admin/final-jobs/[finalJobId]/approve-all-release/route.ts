import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  getFinalPagePath,
  refreshFinalJobApprovalState,
  releaseFinalJob,
  type FinalReleaseMode,
} from '@/lib/finalReview'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

async function resolveFinalPageNumber(finalJobId: string, pageIndex: number) {
  const { data, error } = await supabaseAdmin
    .from('final_job_pages')
    .select('page_index')
    .eq('final_job_id', finalJobId)
    .order('page_index', { ascending: true })

  if (error || !data?.length) {
    throw new Error(error?.message || 'Failed to resolve final page order')
  }

  const resolved = data.findIndex((row) => row.page_index === pageIndex)
  return resolved >= 0 ? resolved + 1 : null
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
  const releaseMode = String(body?.releaseMode ?? 'job_auto') as FinalReleaseMode
  const allowedModes: FinalReleaseMode[] = ['manual', 'job_auto', 'story_auto', 'global_auto']
  if (!allowedModes.includes(releaseMode)) {
    return NextResponse.json({ error: 'Invalid release mode' }, { status: 400 })
  }

  const { data: finalJob, error: finalJobError } = await supabaseAdmin
    .from('final_jobs')
    .select('final_job_id, order_id, status, review_status, total_pages')
    .eq('final_job_id', finalJobId)
    .maybeSingle()
  if (finalJobError || !finalJob?.final_job_id) {
    return NextResponse.json({ error: finalJobError?.message || 'Final job not found' }, { status: 404 })
  }

  const { data: pages, error: pagesError } = await supabaseAdmin
    .from('final_job_pages')
    .select(
      'final_job_page_id, page_index, status, ai_output_path, manual_output_path, approved_output_path, approved_source'
    )
    .eq('final_job_id', finalJobId)
    .order('page_index', { ascending: true })

  if (pagesError || !pages?.length) {
    return NextResponse.json({ error: pagesError?.message || 'Final pages not found' }, { status: 404 })
  }

  const now = new Date().toISOString()
  for (const page of pages) {
    if (page.status === 'processing' || page.status === 'rerunning' || page.status === 'failed') {
      return NextResponse.json({ error: `Page ${page.page_index} is not ready for approval` }, { status: 409 })
    }

    const sourcePath = page.manual_output_path || page.ai_output_path
    if (!sourcePath) {
      return NextResponse.json({ error: `Page ${page.page_index} has no output image` }, { status: 409 })
    }
    const finalPageNumber = await resolveFinalPageNumber(finalJobId, page.page_index)
    if (!finalPageNumber) {
      return NextResponse.json({ error: `Unable to resolve page order for ${page.page_index}` }, { status: 404 })
    }

    const approvedPath = getFinalPagePath(finalJob.order_id, finalPageNumber)
    if (sourcePath !== approvedPath) {
      await supabaseAdmin.storage.from('raw-private').remove([approvedPath])
      const { error: copyError } = await supabaseAdmin.storage
        .from('raw-private')
        .copy(sourcePath, approvedPath)
      if (copyError) {
        return NextResponse.json(
          { error: copyError.message || `Failed to approve page ${page.page_index}` },
          { status: 500 }
        )
      }
    }

    const { error: updateError } = await supabaseAdmin
      .from('final_job_pages')
      .update({
        status: 'approved',
        approved_output_path: approvedPath,
        approved_source: page.manual_output_path ? 'manual' : 'ai',
        reviewed_by: admin.customer_id,
        reviewed_at: now,
        error_message: null,
        updated_at: now,
      })
      .eq('final_job_page_id', page.final_job_page_id)

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || `Failed to update page ${page.page_index}` },
        { status: 500 }
      )
    }
  }

  await refreshFinalJobApprovalState(finalJobId)

  try {
    const result = await releaseFinalJob({
      finalJobId,
      releaseMode,
      approvedByCustomerId: admin.customer_id,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to release final job' },
      { status: 500 }
    )
  }
}
