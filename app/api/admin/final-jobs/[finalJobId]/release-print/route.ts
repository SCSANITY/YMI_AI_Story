import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { isUuid } from '@/lib/manual-print-artifact'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { dispatchPrintNotice } from '@/lib/print-release-notice-server'

export async function POST(
  request: Request,
  context: { params: Promise<{ finalJobId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return jsonNoStore({ error: 'Admin access required' }, { status: 403 })
  }

  const { finalJobId } = await Promise.resolve(context.params)
  const body = await request.json().catch(() => ({}))
  if (!isUuid(body?.expectedArtifactId)) {
    return jsonNoStore({ error: 'Select a verified print PDF before release' }, { status: 400 })
  }
  const { data, error } = await supabaseAdmin.rpc('materials_release_print_with_notice', {
    p_final_job_id: finalJobId,
    p_expected_artifact_id: body.expectedArtifactId,
    p_admin_customer_id: admin.customer_id,
  })

  if (error) {
    const conflict = /must be released|already been released|upload and verify|not verified|changed before release|signature voice|triage|materials_print_/i.test(error.message)
    return jsonNoStore(
      { error: error.message || 'Failed to release print version' },
      { status: conflict ? 409 : 500 }
    )
  }

  const result = Array.isArray(data) ? data[0] : data
  if (!result?.released_at) {
    return jsonNoStore({ error: 'Print release did not return a release timestamp' }, { status: 500 })
  }

  const noticeStatus = result.release_result === 'released'
    ? await dispatchPrintNotice(finalJobId).catch(() => 'check_status')
    : undefined
  return jsonNoStore({
    ok: true,
    noticeStatus,
    finalJobId,
    artifactId: result.artifact_id ?? null,
    printReleasedAt: result.released_at,
    alreadyReleased: result.release_result === 'already_released',
    releasedBy: admin.customer_id,
  })
}
