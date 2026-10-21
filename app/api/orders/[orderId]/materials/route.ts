import { noStoreJson } from '@/lib/http-response'
import { MaterialError, materialRecord, materialUuid } from '@/lib/order-materials'
import { resolveMaterialAccess,readMaterialWrite } from '@/lib/order-materials-access'
import { loadOrderMaterials,saveOrderDedication,bindOrderVoice,completeMaterialGrant } from '@/lib/order-materials-server'

export const runtime='nodejs'
type Context={params:Promise<{orderId:string}>}
function errorResponse(error: unknown) {
  return error instanceof MaterialError
    ? noStoreJson({error:error.code},error.status)
    : noStoreJson({error:'materials_unavailable'},503)
}
// No grant/cookie creation,OTP,refresh,completion or write on GET/prefetch.
export async function GET(request: Request,context: Context) {
  try {
    const orderId=materialUuid((await context.params).orderId)
    const access=await resolveMaterialAccess(request)
    return noStoreJson(await loadOrderMaterials(orderId,access))
  } catch (error) {return errorResponse(error)}
}
export async function POST(request: Request,context: Context) {
  try {
    const orderId=materialUuid((await context.params).orderId)
    const access=await resolveMaterialAccess(request)
    const body=materialRecord(await readMaterialWrite(request))
    if (body.action==='dedication') {
      return noStoreJson({dedication:await saveOrderDedication(orderId,access,body)})
    }
    if (body.action==='voice') {
      await bindOrderVoice(orderId,access,{itemId:body.itemId,assetId:body.assetId,authorizationId:body.authorizationId})
      return noStoreJson({saved:true})
    }
    if (body.action==='complete') {
      await completeMaterialGrant(orderId,access)
      return noStoreJson({completed:true})
    }
    throw new MaterialError('invalid_material',400)
  } catch (error) {return errorResponse(error)}
}
