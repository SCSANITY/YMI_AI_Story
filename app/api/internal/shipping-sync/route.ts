import { noStoreJson } from '@/lib/http-response'
import { isInternalRequestAuthorized } from '@/lib/internal-request-auth'
import { runShippingSyncBatch } from '@/lib/order-shipping-server'

export const maxDuration=60
export async function GET(request:Request) {
  if (!isInternalRequestAuthorized(request)) return noStoreJson({error:'Forbidden'},{status:403})
  try { return noStoreJson(await runShippingSyncBatch()) }
  catch { return noStoreJson({error:'Shipping sync unavailable'},{status:503}) }
}
