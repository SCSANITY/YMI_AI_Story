import { requireAdminCustomer } from '@/lib/adminAuth'
import { noStoreJson } from '@/lib/http-response'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: Request, context: { params: Promise<{ finalJobId: string }> }) {
  if (!await requireAdminCustomer()) return noStoreJson({ error:'Admin access required' },{ status:403 })
  const { finalJobId } = await context.params
  const body = await request.json().catch(()=>null)
  if (!Number.isSafeInteger(body?.draft) || body.draft < 2 ||
      (body.token !== undefined && (typeof body.token !== 'string' || !/^[0-9a-f]{32}$/.test(body.token)))) {
    return noStoreJson({ error:'Invalid draft confirmation' },{ status:400 })
  }
  const { data,error } = await supabaseAdmin.rpc('cancel_final_proof_corrections',{
    p_job:finalJobId,p_draft:body.draft,p_confirm:body.token ?? null
  })
  return error ? noStoreJson({ error:error.message },{ status:error.code==='PT409'?409:500 }) : noStoreJson(data)
}
