import { noStoreJson } from '@/lib/http-response'
import { MaterialError,materialRecord,materialUuid } from '@/lib/order-materials'
import { readMaterialWrite } from '@/lib/order-materials-access'
import { requestMaterialRecovery } from '@/lib/order-materials-recovery'
import { recoverOrderMaterialLink } from '@/lib/order-materials-server'

export const runtime='nodejs'
// No GET handler: link prefetch never creates or rotates grants or sends OTP.
export async function POST(request: Request,context:{params:Promise<{orderId:string}>}) {
  try {
    const orderId=materialUuid((await context.params).orderId)
    const body=materialRecord(await readMaterialWrite(request))
    if (body.action==='request') {
      return noStoreJson({accepted:true,...await requestMaterialRecovery(request,orderId,body.email)},202)
    }
    if (body.action==='verify' && typeof body.code==='string' && typeof body.challengeId==='string') {
      const accessPath=await recoverOrderMaterialLink(orderId,body.challengeId,body.code)
      return noStoreJson({accessPath})
    }
    throw new MaterialError('invalid_verification',400)
  } catch (error) {
    return error instanceof MaterialError
      ? noStoreJson({error:error.code},error.status)
      : noStoreJson({error:'materials_unavailable'},503)
  }
}
