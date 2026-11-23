import { requireAdminCustomer } from '@/lib/adminAuth'
import { noStoreJson } from '@/lib/http-response'
import { isUuid } from '@/lib/manual-print-artifact'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: Request, context: { params: Promise<{ finalJobId: string }> }) {
  const admin = await requireAdminCustomer()
  if (!admin) return noStoreJson({ error: 'Admin access required' }, { status: 403 })
  const { finalJobId } = await context.params
  const body = await request.json().catch(() => null)
  if (!isUuid(finalJobId) || !Number.isSafeInteger(body?.proofRevision) || body.proofRevision < 1
    || !Number.isSafeInteger(body?.voiceRevision) || body.voiceRevision < 1) {
    return noStoreJson({ error: 'Invalid book revision' }, { status: 400 })
  }
  const { data, error } = await supabaseAdmin.rpc('confirm_original_standard_narration', {
    p_job: finalJobId, p_proof: body.proofRevision, p_voice: body.voiceRevision, p_actor: admin.customer_id,
  })
  if (error?.code === 'PT409') return noStoreJson({ error: 'This book has changed. Refresh and review its narration.' }, { status: 409 })
  if (error || !data?.confirmedAt) return noStoreJson({ error: 'Could not confirm standard narration' }, { status: error?.code === '42501' ? 403 : 500 })
  return noStoreJson({ choice: data })
}
