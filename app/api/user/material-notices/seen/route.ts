import { checkoutOwnerErrorResponse, resolveCheckoutOwner } from '@/lib/checkout-owner'
import { noStoreJson } from '@/lib/http-response'
import { MaterialError, materialRecord, materialUuid } from '@/lib/order-materials'
import { readMaterialWrite } from '@/lib/order-materials-access'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: Request) {
  try {
    const customerId = materialUuid(request.headers.get('X-YMI-Customer'))
    const owner = await resolveCheckoutOwner(request, {
      allowAnon: false, requireCustomer: true, expectedCustomerId: customerId,
    })
    if (owner?.ownerType !== 'customer') return noStoreJson({ error: 'Sign in required' }, 401)
    const url = new URL(request.url)
    const expectedOrigin = url.protocol + '//' + (request.headers.get('host') ?? url.host)
    const batch = await readMaterialWrite(request, expectedOrigin)
    if (!Array.isArray(batch) || !batch.length || batch.length > 20) throw new MaterialError('invalid_batch', 400)
    const seen = batch.map(value => {
      const item = materialRecord(value)
      if (typeof item.voice !== 'boolean' || typeof item.dedication !== 'boolean' || !(item.voice || item.dedication)) {
        throw new MaterialError('invalid_task', 400)
      }
      return { order_id: materialUuid(item.order_id), cart_item_id: materialUuid(item.cart_item_id), voice: item.voice, dedication: item.dedication }
    })
    const { error } = await supabaseAdmin.rpc('mark_customer_material_notices_seen', { p_customer: owner.customerId, p_seen: seen })
    if (error) {
      console.error('[material-notices/seen] Write failed', error.code)
      return noStoreJson({error: 'Could not mark notices as seen'}, 503)
    }
    return noStoreJson({ saved: true })
  } catch (error) {
    if (error instanceof MaterialError) return noStoreJson({ error: error.code }, error.status)
    return checkoutOwnerErrorResponse(error) ?? noStoreJson({ error: 'Could not mark notices as seen' }, 500)
  }
}
