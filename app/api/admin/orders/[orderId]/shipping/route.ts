import { noStoreJson } from '@/lib/http-response'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { parseAdminLogisticsPatch } from '@/lib/order-logistics'
import { loadLogisticsOrder, saveOrderLogistics } from '@/lib/order-logistics-server'
import { readAdminShippingDetails, retryDeliveryNotification, syncOrderShipping } from '@/lib/order-shipping-server'

type Context={params:Promise<{orderId:string}>}
export async function GET(_request:Request,context:Context) {
  if (!await requireAdminCustomer()) return noStoreJson({error:'Forbidden'},{status:403})
  try { return noStoreJson({shipping:await readAdminShippingDetails((await context.params).orderId)}) }
  catch { return noStoreJson({error:'Shipping details unavailable; check migration and order access'},{status:503}) }
}

export async function PATCH(request:Request,context:Context) {
  const admin=await requireAdminCustomer()
  if (!admin) return noStoreJson({error:'Forbidden'},{status:403})
  const {orderId}=await context.params
  let parsed
  try {
    parsed=parseAdminLogisticsPatch(await request.json())
    if (parsed.patch.orderStatus || parsed.patch.trackingNumber!==undefined || parsed.patch.trackingCarrier!==undefined || parsed.patch.trackingUrl!==undefined || parsed.patch.logisticsNote!==undefined) throw new Error('Edit order and tracking fields through the existing logistics form')
    if (parsed.patch.expectedRevision===undefined) throw new Error('Current shipping revision required')
  } catch (error) { return noStoreJson({error:error instanceof Error?error.message:'Invalid request'},{status:400}) }
  try {
    const order=await loadLogisticsOrder(orderId)
    const result=await saveOrderLogistics(order,admin.customer_id,parsed.expectedUpdatedAt,parsed.patch)
    const shipping=await readAdminShippingDetails(orderId).catch(()=>null)
    return noStoreJson({ok:true,persisted:true,...result,shipping,refreshRequired:shipping===null})
  } catch { return noStoreJson({error:'Shipping settings changed or were rejected; reload before saving'},{status:409}) }
}

export async function POST(request:Request,context:Context) {
  if (!await requireAdminCustomer()) return noStoreJson({error:'Forbidden'},{status:403})
  const {orderId}=await context.params
  const body=await request.json().catch(()=>null) as {action?:string}|null
  if (body?.action!=='sync' && body?.action!=='retry_email') return noStoreJson({error:'Invalid shipping action'},{status:400})
  try {
    const result=body.action==='sync'?await syncOrderShipping(orderId,true):await retryDeliveryNotification(orderId)
    const [shipping,order]=await Promise.all([readAdminShippingDetails(orderId).catch(()=>null),loadLogisticsOrder(orderId).catch(()=>null)])
    return noStoreJson({ok:true,result,shipping,order,refreshRequired:shipping===null||order===null})
  } catch { return noStoreJson({error:'Shipping action failed; known information was retained'},{status:503}) }
}
