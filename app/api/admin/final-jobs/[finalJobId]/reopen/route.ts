import { requireAdminCustomer } from '@/lib/adminAuth'
import { noStoreJson } from '@/lib/http-response'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: Request, context: { params: Promise<{ finalJobId: string }> }) {
  if (!await requireAdminCustomer()) return noStoreJson({ error: 'Admin access required' }, { status: 403 })
  const { finalJobId } = await context.params
  const body = await request.json().catch(() => null)
  if (!Number.isSafeInteger(body?.revision) || body.revision < 1) {
    return noStoreJson({ error: 'Select the published revision' }, { status: 400 })
  }
  const { error } = await supabaseAdmin.rpc('reopen_final_proof', { p_job: finalJobId, p_revision: body.revision })
  return error ? noStoreJson({ error: error.message }, { status: error.code === 'PT409' ? 409 : 500 })
    : noStoreJson({ ok: true })
}
