import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  MANUAL_PRINT_PDF_BUCKET,
  ManualPrintArtifactError,
  assertStoredManualPrintMetadata,
  isUuid,
  verifyRemotePdfHeader,
} from '@/lib/manual-print-artifact'
import {
  MANUAL_PRINT_ARTIFACT_SELECT,
  buildManualPrintArtifactClient,
  type ManualPrintArtifactRow,
} from '@/lib/manual-print-artifact-server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

async function rejectArtifact(finalJobId: string, artifactId: string, reason: string, adminId: string) {
  await supabaseAdmin.rpc('reject_final_print_artifact', {
    p_final_job_id: finalJobId,
    p_artifact_id: artifactId,
    p_failure_reason: reason,
    p_admin_customer_id: adminId,
  })
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
  const artifactId = body?.artifactId
  if (!isUuid(artifactId)) {
    return jsonNoStore({ error: 'Invalid print PDF revision' }, { status: 400 })
  }

  const { data: artifact, error: artifactError } = await supabaseAdmin
    .from('final_print_artifacts')
    .select(MANUAL_PRINT_ARTIFACT_SELECT)
    .eq('artifact_id', artifactId)
    .eq('final_job_id', finalJobId)
    .maybeSingle()
  if (artifactError || !artifact) {
    return jsonNoStore(
      { error: artifactError?.message || 'Print PDF revision not found' },
      { status: 404 }
    )
  }

  const row = artifact as ManualPrintArtifactRow
  if (row.status === 'verified' || row.status === 'released') {
    try {
      return jsonNoStore({ artifact: await buildManualPrintArtifactClient(row) })
    } catch (error) {
      return jsonNoStore(
        { error: error instanceof Error ? error.message : 'Failed to load print PDF' },
        { status: 500 }
      )
    }
  }
  if (row.status !== 'pending') {
    return jsonNoStore({ error: 'This print PDF revision is no longer pending.' }, { status: 409 })
  }

  let verified
  try {
    const { data: info, error: infoError } = await supabaseAdmin.storage
      .from(MANUAL_PRINT_PDF_BUCKET)
      .info(row.storage_path)
    if (infoError || !info) {
      throw new ManualPrintArtifactError(infoError?.message || 'Uploaded print PDF was not found.')
    }
    verified = assertStoredManualPrintMetadata(info, Number(row.declared_size_bytes))

    await verifyRemotePdfHeader({
      getSignedUrl: async () => {
        const { data: signed, error: signedError } = await supabaseAdmin.storage
          .from(MANUAL_PRINT_PDF_BUCKET)
          .createSignedUrl(row.storage_path, 60)
        if (signedError || !signed?.signedUrl) {
          throw new ManualPrintArtifactError(
            signedError?.message || 'Unable to inspect uploaded print PDF.'
          )
        }
        return signed.signedUrl
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Print PDF verification failed.'
    await rejectArtifact(finalJobId, artifactId, message, admin.customer_id)
    return jsonNoStore({ error: message }, { status: 409 })
  }

  const { error: commitError } = await supabaseAdmin.rpc('commit_final_print_artifact', {
    p_final_job_id: finalJobId,
    p_artifact_id: artifactId,
    p_verified_size_bytes: verified.sizeBytes,
    p_content_type: verified.contentType,
    p_admin_customer_id: admin.customer_id,
  })
  if (commitError) {
    return jsonNoStore(
      { error: commitError.message || 'Failed to commit print PDF revision' },
      { status: /released|no longer|does not match/i.test(commitError.message) ? 409 : 500 }
    )
  }

  const { data: committed, error: committedError } = await supabaseAdmin
    .from('final_print_artifacts')
    .select(MANUAL_PRINT_ARTIFACT_SELECT)
    .eq('artifact_id', artifactId)
    .eq('final_job_id', finalJobId)
    .maybeSingle()
  if (committedError || !committed) {
    return jsonNoStore(
      { error: committedError?.message || 'Committed print PDF could not be reloaded' },
      { status: 500 }
    )
  }

  try {
    return jsonNoStore({
      artifact: await buildManualPrintArtifactClient(committed as ManualPrintArtifactRow),
    })
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Failed to sign print PDF' },
      { status: 500 }
    )
  }
}
