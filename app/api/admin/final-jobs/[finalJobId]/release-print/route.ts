import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { isUuid } from '@/lib/manual-print-artifact'
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
  if (!isUuid(body?.expectedArtifactId)) {
    return jsonNoStore({ error: 'Select a verified print PDF before release' }, { status: 400 })
  }
  const { data, error } = await supabaseAdmin.rpc('release_final_print_artifact', {
    p_final_job_id: finalJobId,
    p_expected_artifact_id: body.expectedArtifactId,
    p_admin_customer_id: admin.customer_id,
  })

  if (error) {
    const conflict = /must be released|already been released|upload and verify|not verified|changed before release/i.test(error.message)
    return jsonNoStore(
      { error: error.message || 'Failed to release print version' },
      { status: conflict ? 409 : 500 }
    )
  }

  const result = Array.isArray(data) ? data[0] : data
  if (!result?.released_at) {
    return jsonNoStore({ error: 'Print release did not return a release timestamp' }, { status: 500 })
  }

  return jsonNoStore({
    ok: true,
    finalJobId,
    artifactId: result.artifact_id ?? null,
    printReleasedAt: result.released_at,
    alreadyReleased: result.release_result === 'already_released',
    releasedBy: admin.customer_id,
  })
}
