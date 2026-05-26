import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { getFinalPagePrintPath, refreshFinalJobPrintState } from '@/lib/finalReview'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const STORAGE_BUCKET = 'raw-private'

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
  context: { params: Promise<{ finalJobId: string; pageIndex: string }> | { finalJobId: string; pageIndex: string } }
) {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { finalJobId, pageIndex } = await Promise.resolve(context.params)
  const numericPageIndex = Number(pageIndex)
  if (!Number.isInteger(numericPageIndex) || numericPageIndex < 0) {
    return NextResponse.json({ error: 'Invalid page index' }, { status: 400 })
  }

  const formData = await request.formData().catch(() => null)
  const file = formData?.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing print page file' }, { status: 400 })
  }

  const { data: finalJob, error: finalJobError } = await supabaseAdmin
    .from('final_jobs')
    .select('final_job_id, order_id, released_at, print_status')
    .eq('final_job_id', finalJobId)
    .maybeSingle()

  if (finalJobError || !finalJob) {
    return NextResponse.json({ error: finalJobError?.message || 'Final job not found' }, { status: 404 })
  }

  if (!finalJob.released_at || finalJob.print_status === 'locked') {
    return NextResponse.json({ error: 'PDF version must be released before uploading print pages' }, { status: 409 })
  }

  if (finalJob.print_status === 'released') {
    return NextResponse.json({ error: 'Print version has already been released' }, { status: 409 })
  }

  const { data: page, error: pageError } = await supabaseAdmin
    .from('final_job_pages')
    .select('final_job_page_id')
    .eq('final_job_id', finalJobId)
    .eq('page_index', numericPageIndex)
    .maybeSingle()

  if (pageError || !page) {
    return NextResponse.json({ error: pageError?.message || 'Final page not found' }, { status: 404 })
  }

  const finalPageNumber = await resolveFinalPageNumber(finalJobId, numericPageIndex)
  if (!finalPageNumber) {
    return NextResponse.json({ error: 'Final page order not found' }, { status: 404 })
  }

  const storagePath = getFinalPagePrintPath(finalJob.order_id, finalPageNumber)
  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await supabaseAdmin.storage.from(STORAGE_BUCKET).upload(storagePath, buffer, {
    contentType: file.type || 'image/png',
    upsert: true,
  })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message || 'Failed to upload print page' }, { status: 500 })
  }

  const now = new Date().toISOString()
  const { error: updateError } = await supabaseAdmin
    .from('final_job_pages')
    .update({
      print_output_path: storagePath,
      print_status: 'completed',
      reviewed_by: admin.customer_id,
      reviewed_at: now,
      updated_at: now,
    })
    .eq('final_job_page_id', page.final_job_page_id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message || 'Failed to update print page' }, { status: 500 })
  }

  try {
    await refreshFinalJobPrintState(finalJobId)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to refresh print status' },
      { status: 500 }
    )
  }

  const { data: signed } = await supabaseAdmin.storage.from(STORAGE_BUCKET).createSignedUrl(storagePath, 60 * 20)

  return NextResponse.json({
    ok: true,
    print_output_path: storagePath,
    print_url: signed?.signedUrl ?? null,
    printPath: storagePath,
    printUrl: signed?.signedUrl ?? null,
  })
}
