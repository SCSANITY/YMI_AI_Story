import { noStoreJson } from '@/lib/http-response'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { parseAdminLogisticsPatch } from '@/lib/order-logistics'
import { loadLogisticsOrder, saveOrderLogistics, notifyLogisticsUpdate } from '@/lib/order-logistics-server'

export async function PATCH(request: Request, context: {params:Promise<{orderId:string}>}) {
  const admin=await requireAdminCustomer()
  if (!admin) return noStoreJson({error:'Forbidden'},{status:403})
  const {orderId}=await context.params
  let parsed
  try { parsed=parseAdminLogisticsPatch(await request.json()) }
  catch (error) { return noStoreJson({error:error instanceof Error?error.message:'Invalid request'},{status:400}) }
  try {
    const order=await loadLogisticsOrder(orderId)
    const result=await saveOrderLogistics(order,admin.customer_id,parsed.expectedUpdatedAt,parsed.patch)
    const updatedOrder=result.order
    const email=await notifyLogisticsUpdate(updatedOrder,result.statusEventId,result)
    return noStoreJson({ok:true,persisted:true,...result,order:updatedOrder,...email})
  } catch (error) {
    const message=error instanceof Error?error.message:'Logistics update rejected'
    return noStoreJson({error:message},{status:message==='Order not found'?404:409})
  }
}
