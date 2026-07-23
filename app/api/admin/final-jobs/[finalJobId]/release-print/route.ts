import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(
  _request: Request,
  context: { params: Promise<{ finalJobId: string }> | { finalJobId: string } }
) {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { finalJobId } = await Promise.resolve(context.params)
  const { data: finalJob, error: finalJobError } = await supabaseAdmin
    .from('final_jobs')
    .select('final_job_id, total_pages, print_completed_pages, print_status, released_at, print_released_at')
    .eq('final_job_id', finalJobId)
    .maybeSingle()

  if (finalJobError || !finalJob) {
    return NextResponse.json({ error: finalJobError?.message || 'Final job not found' }, { status: 404 })
  }

  if (!finalJob.released_at) {
    return NextResponse.json({ error: 'PDF version must be released before print version release' }, { status: 409 })
  }

  if (finalJob.print_status === 'released') {
    return NextResponse.json({
      ok: true,
      alreadyReleased: true,
      finalJobId,
      printReleasedAt: finalJob.print_released_at,
      printCompletedPages: Number(finalJob.print_completed_pages || 0),
    })
  }

  const { data: pages, error: pagesError } = await supabaseAdmin
    .from('final_job_pages')
    .select('final_job_page_id, page_index, print_status, print_output_path')
    .eq('final_job_id', finalJobId)
    .order('page_index', { ascending: true })

  if (pagesError || !pages?.length) {
    return NextResponse.json({ error: pagesError?.message || 'Final job pages not found' }, { status: 404 })
  }

  const incompletePages = pages.filter((page) => page.print_status !== 'completed' || !page.print_output_path)
  if (incompletePages.length > 0 || pages.length < Number(finalJob.total_pages ?? 0)) {
    return NextResponse.json(
      {
        error: `Print version is not ready (${pages.length - incompletePages.length}/${finalJob.total_pages} completed)`,
      },
      { status: 409 }
    )
  }

  const now = new Date().toISOString()
  const { error: updateError } = await supabaseAdmin
    .from('final_jobs')
    .update({
      print_status: 'released',
      print_completed_pages: pages.length,
      print_released_at: now,
      updated_at: now,
    })
    .eq('final_job_id', finalJobId)

  if (updateError) {
    return NextResponse.json({ error: updateError.message || 'Failed to release print version' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    finalJobId,
    printReleasedAt: now,
    printCompletedPages: pages.length,
    releasedBy: admin.customer_id,
  })
}
