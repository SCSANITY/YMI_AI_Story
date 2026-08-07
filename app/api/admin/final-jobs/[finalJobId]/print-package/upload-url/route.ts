import { randomUUID } from 'crypto'
import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  MANUAL_PRINT_PDF_BUCKET,
  ManualPrintArtifactError,
  buildManualPrintStoragePath,
  validateManualPrintUpload,
} from '@/lib/manual-print-artifact'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', 'no-store')
  return NextResponse.json(body, { ...init, headers })
}

export async function POST(
  request: Request,
  context: { params: Promise<{ finalJobId: string }> | { finalJobId: string } }
) {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return jsonNoStore({ error: 'Admin access required' }, { status: 403 })
  }

  const { finalJobId } = await Promise.resolve(context.params)
  const body = await request.json().catch(() => ({}))
  let upload
  try {
    upload = validateManualPrintUpload({
      fileName: body?.fileName,
      sizeBytes: body?.sizeBytes,
      contentType: body?.contentType,
    })
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Invalid print PDF' },
      { status: 400 }
    )
  }

  const { data: finalJob, error: finalJobError } = await supabaseAdmin
    .from('final_jobs')
    .select('final_job_id, order_id, released_at, print_status, print_released_at')
    .eq('final_job_id', finalJobId)
    .maybeSingle()
  if (finalJobError || !finalJob) {
    return jsonNoStore(
      { error: finalJobError?.message || 'Final job not found' },
      { status: 404 }
    )
  }
  if (!finalJob.released_at) {
    return jsonNoStore(
      { error: 'Customer PDF must be released before uploading a print PDF.' },
      { status: 409 }
    )
  }
  if (finalJob.print_status === 'released' || finalJob.print_released_at) {
    return jsonNoStore({ error: 'Print version has already been released.' }, { status: 409 })
  }

  const artifactId = randomUUID()
  let storagePath
  try {
    storagePath = buildManualPrintStoragePath(finalJob.order_id, artifactId)
  } catch (error) {
    const message = error instanceof ManualPrintArtifactError ? error.message : 'Invalid print PDF identity'
    return jsonNoStore({ error: message }, { status: 409 })
  }

  const { data: signed, error: signedError } = await supabaseAdmin.storage
    .from(MANUAL_PRINT_PDF_BUCKET)
    .createSignedUploadUrl(storagePath, { upsert: false })
  if (signedError || !signed) {
    return jsonNoStore({ error: signedError?.message || 'Failed to prepare print PDF upload' }, { status: 500 })
  }

  const { error: createError } = await supabaseAdmin.rpc('create_final_print_artifact', {
    p_final_job_id: finalJobId,
    p_artifact_id: artifactId,
    p_storage_path: storagePath,
    p_original_filename: upload.fileName,
    p_declared_size_bytes: upload.sizeBytes,
    p_content_type: upload.contentType,
    p_admin_customer_id: admin.customer_id,
  })
  if (createError) {
    const conflict = /released|must be released|no longer/i.test(createError.message)
    return jsonNoStore(
      { error: createError.message || 'Failed to register print PDF revision' },
      { status: conflict ? 409 : 500 }
    )
  }

  return jsonNoStore({
    artifactId,
    bucket: MANUAL_PRINT_PDF_BUCKET,
    storagePath,
    token: signed.token,
  })
}
