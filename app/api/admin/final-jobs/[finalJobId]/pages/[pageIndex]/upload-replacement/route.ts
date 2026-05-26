import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  getFinalPageManualPath,
  getFinalPagePath,
  refreshFinalJobApprovalState,
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

  const formData = await request.formData().catch(() => null)
  const fileValue = formData?.get('file')
  if (!(fileValue instanceof File)) {
    return NextResponse.json({ error: 'Missing replacement file' }, { status: 400 })
  }

  const { data: finalJob } = await supabaseAdmin
    .from('final_jobs')
    .select('final_job_id, order_id')
    .eq('final_job_id', finalJobId)
    .maybeSingle()
  if (!finalJob?.order_id) {
    return NextResponse.json({ error: 'Final job not found' }, { status: 404 })
  }

  const { data: page } = await supabaseAdmin
    .from('final_job_pages')
    .select('final_job_page_id, page_index, status')
    .eq('final_job_id', finalJobId)
    .eq('page_index', pageIndex)
    .maybeSingle()
  if (!page?.final_job_page_id) {
    return NextResponse.json({ error: 'Final page not found' }, { status: 404 })
  }

  const finalPageNumber = await resolveFinalPageNumber(finalJobId, pageIndex)
  if (!finalPageNumber) {
    return NextResponse.json({ error: 'Final page order not found' }, { status: 404 })
  }

  const now = new Date().toISOString()
  const manualPath = getFinalPageManualPath(finalJob.order_id, finalPageNumber)
  const approvedPath = getFinalPagePath(finalJob.order_id, finalPageNumber)
  const fileBuffer = Buffer.from(await fileValue.arrayBuffer())
  const contentType = fileValue.type || 'image/png'

  const { error: manualUploadError } = await supabaseAdmin.storage.from('raw-private').upload(manualPath, fileBuffer, {
    contentType,
    upsert: true,
  })
  if (manualUploadError) {
    return NextResponse.json({ error: manualUploadError.message || 'Failed to upload replacement image' }, { status: 500 })
  }

  const { error: approvedUploadError } = await supabaseAdmin.storage.from('raw-private').upload(approvedPath, fileBuffer, {
    contentType,
    upsert: true,
  })
  if (approvedUploadError) {
    return NextResponse.json({ error: approvedUploadError.message || 'Failed to publish replacement image' }, { status: 500 })
  }

  const { error: updateError } = await supabaseAdmin
    .from('final_job_pages')
    .update({
      status: 'approved',
      manual_output_path: manualPath,
      approved_output_path: approvedPath,
      approved_source: 'manual',
      reviewed_by: admin.customer_id,
      reviewed_at: now,
      error_message: null,
      updated_at: now,
    })
    .eq('final_job_page_id', page.final_job_page_id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message || 'Failed to update replacement page' }, { status: 500 })
  }

  await refreshFinalJobApprovalState(finalJobId)

  const [{ data: signedManual }, { data: signedApproved }] = await Promise.all([
    supabaseAdmin.storage.from('raw-private').createSignedUrl(manualPath, 60 * 20),
    supabaseAdmin.storage.from('raw-private').createSignedUrl(approvedPath, 60 * 20),
  ])

  return NextResponse.json({
    ok: true,
    manualPath,
    approvedPath,
    manualUrl: signedManual?.signedUrl ?? null,
    approvedUrl: signedApproved?.signedUrl ?? null,
  })
}
