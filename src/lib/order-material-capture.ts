import 'server-only'
import type { CheckoutAssetOwner } from '@/lib/checkout-owner'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { resolveMaterialAccess } from '@/lib/order-materials-access'
import { loadOrderMaterials } from '@/lib/order-materials-server'
import { MaterialError, materialRecord, materialUuid } from '@/lib/order-materials'

// A scoped material link never becomes a customer/anonymous login credential.
// Resolve custody on the server; the caller cannot choose an asset owner.
export async function resolveMaterialCaptureOwner(request: Request,body: Record<string,unknown>): Promise<CheckoutAssetOwner | null> {
  if (body.orderMaterial===undefined) return null
  if ((body.asset_type ?? body.assetType)!=='voice_sample' || body.role!=='voice') throw new MaterialError('invalid_material',400)
  const origin=request.headers.get('origin')
  if (origin && origin!==new URL(request.url).origin) throw new MaterialError('material_origin_denied',403)
  const scope=materialRecord(body.orderMaterial),orderId=materialUuid(scope.orderId),itemId=materialUuid(scope.itemId)
  const materials=await loadOrderMaterials(orderId,await resolveMaterialAccess(request))
  const item=materials.items.find(item=>item.cart_item_id===itemId)
  if (!item?.can_submit_voice) throw new MaterialError('material_access_denied',403)
  const {data,error}=await supabaseAdmin.from('orders').select('customer_id')
    .eq('order_id',orderId).maybeSingle()
  if (error || !data) throw new MaterialError('materials_unavailable',503)
  return {ownerType:'customer',customerId:materialUuid(data.customer_id),anonSessionId:null}
}
