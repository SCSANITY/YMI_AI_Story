import 'server-only'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { hasCompleteSignatureVoiceBinding } from '@/lib/purchase-configuration'
import { type MaterialAccess, newMaterialCredential, materialAccessPath } from '@/lib/order-materials-access'
import { MaterialError, materialUuid, parseOrderMaterials, parseMaterialDedication, parseDedicationWrite } from '@/lib/order-materials'
import { resolvePersonalizedBookTitle } from '@/lib/personalized-book-title'
import { createGeneratedPreviewCoverMap, getGeneratedPreviewCover } from '@/lib/order-covers'

function accessArgs(orderId: string,access: MaterialAccess) {
  return { p_order:materialUuid(orderId),p_customer:access.customerId,p_hash:access.tokenHash }
}
function failure(error: {code?: string;message?: string}): never {
  const message=error.message ?? ''
  if (error.code==='42501' || message.includes('materials_access_denied')) throw new MaterialError('material_access_denied',403)
  if (error.code==='PT409') throw new MaterialError('dedication_revision_conflict',409)
  if (message.includes('materials_dedication_closed')) throw new MaterialError('dedication_closed',409)
  if (message.includes('materials_voice_not_unbound')) throw new MaterialError('voice_already_bound',409)
  if (message.includes('materials_voice_') || error.code==='23514') throw new MaterialError('invalid_material',400)
  throw new MaterialError('materials_unavailable',503)
}
async function rpc(name: string,args: Record<string,unknown>): Promise<unknown> {
  const {data,error}=await supabaseAdmin.rpc(name,args)
  if (error) failure(error)
  return data
}
export async function loadOrderMaterials(orderId: string,access: MaterialAccess) {
  const result=parseOrderMaterials(await rpc('materials_read',accessArgs(orderId,access)))
  if (result.order_id!==orderId) throw new MaterialError('materials_unavailable',503)
  return result
}
// Enrich only the already-authorized material lines, not a whole order/customer.
// Mail and other material readers do not need thumbnail signing.
export async function loadOrderMaterialsPage(orderId:string,access:MaterialAccess) {
  const result=await loadOrderMaterials(orderId,access)
  const ids=[...new Set(result.items.map(item=>item.creation_id))]
  const {data,error}=await supabaseAdmin.from('creations')
    .select('creation_id,template_id,customize_snapshot,preview_job_id,templates:templates(name)')
    .in('creation_id',ids)
  if (error || data?.length!==ids.length) throw new MaterialError('materials_unavailable',503)
  const creations=new Map(data.map(row=>[row.creation_id,row]))
  const covers=await createGeneratedPreviewCoverMap(data.map(row=>row.preview_job_id).filter((id):id is string=>typeof id==='string'))
  return {...result,items:result.items.map(item=>{
    const creation=creations.get(item.creation_id)!
    const template=Array.isArray(creation.templates)?creation.templates[0]:creation.templates
    const cover=getGeneratedPreviewCover(covers,creation.preview_job_id)
    return {...item,book:{title:resolvePersonalizedBookTitle({templateId:creation.template_id,
      templateName:template?.name,customizeSnapshot:creation.customize_snapshot}),cover_url:cover.url,cover_status:cover.status}}
  })}
}
export async function loadOrderLineDedications(orderId: string,access: MaterialAccess) {
  return (await loadOrderMaterials(orderId,access)).items.map(item=>({
    cartItemId:item.cart_item_id,creationId:item.creation_id,...item.dedication,
  }))
}
// Paid consumers authorize the order first. Creation is provenance, not the source key.
export async function loadOrderLineVoiceBindings(orderId: string,itemIds: readonly string[]) {
  const ids=[...new Set(itemIds.map(materialUuid))]
  if (!ids.length) return []
  if (ids.length>100) throw new MaterialError('invalid_material',400)
  const {data,error}=await supabaseAdmin.from('order_line_voice').select(
    'cart_item_id,creation_id,customer_id,revision,voice_asset_id,voice_sample_duration_seconds,voice_consent_version,voice_consent_accepted_at,voice_bound_at,voice_subject_name,voice_subject_relationship,voice_capture_authorization_id,voice_speaker_kind,voice_admin_authorization_id,binding_origin,snapshot_rejected_reason'
  ).eq('order_id',materialUuid(orderId)).in('cart_item_id',ids)
  if (error || data?.length!==ids.length) throw new MaterialError('materials_unavailable',503)
  return data.map(row=>({ ...row,voiceReady:row.voice_consent_version==='signature-voice-admin-declaration-v1'
    ? Boolean(row.binding_origin==='admin_replacement' && row.voice_admin_authorization_id && row.voice_asset_id
      && Number(row.voice_sample_duration_seconds)>0 && row.voice_bound_at && row.voice_subject_name
      && row.voice_subject_relationship && row.voice_speaker_kind==='admin_declared'
      && row.voice_capture_authorization_id===null && row.voice_consent_accepted_at===null)
    : hasCompleteSignatureVoiceBinding(row) }))
}
export async function assertOrderLineVoiceDownload(request:Request,orderId:string,itemId:string,assetId:string) {
  const { resolveMaterialAccess }=await import('@/lib/order-materials-access')
  const materials=await loadOrderMaterials(materialUuid(orderId),await resolveMaterialAccess(request))
  if (!materials.items.some(item=>item.cart_item_id===materialUuid(itemId))) throw new MaterialError('material_access_denied',403)
  const [binding]=await loadOrderLineVoiceBindings(orderId,[itemId])
  if (binding.voice_asset_id!==materialUuid(assetId)) throw new MaterialError('material_access_denied',403)
}
export async function saveOrderDedication(orderId: string,access: MaterialAccess,value: unknown) {
  const input=parseDedicationWrite(value)
  return parseMaterialDedication(await rpc('materials_save_dedication',{
    ...accessArgs(orderId,access),p_item:input.itemId,p_expected:input.expectedRevision,p_body:input.body,
  }))
}
export async function bindOrderVoice(orderId: string,access: MaterialAccess,input: {
  itemId: unknown;assetId: unknown;authorizationId: unknown;expectedAssetId:unknown;expectedRevision:unknown
}) {
  const itemId=materialUuid(input.itemId),assetId=materialUuid(input.assetId),authorizationId=materialUuid(input.authorizationId)
  const expectedAssetId=input.expectedAssetId===null?null:materialUuid(input.expectedAssetId)
  if(!Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision)<1) throw new MaterialError('invalid_material',400)
  const expectedRevision=Number(input.expectedRevision)
  let result:unknown,error:{code?:string;message?:string}|null=null
  try {
    const response=await supabaseAdmin.rpc('materials_bind_voice',{...accessArgs(orderId,access),p_item:itemId,
      p_asset:assetId,p_authorization:authorizationId,p_expected_asset:expectedAssetId,p_expected_revision:expectedRevision})
    result=response.data;error=response.error
  } catch { error={} } // Transport failure has an unknown outcome, never retry the write.
  if(error?.code==='PT409') {
    const message=error.message ?? ''
    throw new MaterialError(message.includes('window_closed')?'voice_window_closed':message.includes('shipped')?'voice_shipped':'voice_revision_conflict',409)
  }
  if(error && (error.code==='42501' || ['23514','22023','P0001','P0002'].includes(error.code ?? ''))) failure(error)
  if(!error && result && typeof result==='object' && !Array.isArray(result)) {
    const saved=result as Record<string,unknown>
    if(saved.asset_id===assetId && saved.revision===expectedRevision+1) return {assetId,revision:expectedRevision+1}
  }
  // A read-back is the sole recovery for timeout/unknown result. Re-prove scope
  // before the private binding read; never delete possibly committed bytes.
  try {
    const materials=await loadOrderMaterials(orderId,access)
    if(!materials.items.some(item=>item.cart_item_id===itemId)) throw new MaterialError('material_access_denied',403)
    const [current]=await loadOrderLineVoiceBindings(orderId,[itemId])
    if(current.voice_asset_id===assetId && current.voice_capture_authorization_id===authorizationId
      && current.revision===expectedRevision+1) return {assetId,revision:expectedRevision+1}
  } catch(readError) {
    if(readError instanceof MaterialError && readError.status===403) throw readError
  }
  throw new MaterialError('voice_update_unknown',503)
}
export async function completeMaterialGrant(orderId: string,access: MaterialAccess) {
  if (!access.tokenHash) throw new MaterialError('material_access_required',401)
  await rpc('materials_complete_grant',{p_order:materialUuid(orderId),p_hash:access.tokenHash})
}
// Called only by trusted confirmation/recovery code, never a public grant-issue
// route. Return raw credential once for delivery; never persist/log/serialize it
// as part of an order read model or managed email context.
export async function issueOrderMaterialLink(orderId: string,itemIds: readonly string[]) {
  const credential=newMaterialCredential()
  await rpc('materials_issue_grant',{p_order:materialUuid(orderId),p_hash:credential.hash,p_items:itemIds.map(materialUuid)})
  return materialAccessPath(orderId,credential.token)
}
export async function recoverOrderMaterialLink(orderId: string,challengeId: string,code: string) {
  if (!/^\d{6}$/.test(code)) throw new MaterialError('invalid_verification',400)
  const credential=newMaterialCredential()
  const verified=await rpc('materials_finish_recovery',{p_order:materialUuid(orderId),
    p_challenge:materialUuid(challengeId),p_code:code,p_new_hash:credential.hash})
  if (verified!==true) throw new MaterialError('invalid_verification',400)
  return materialAccessPath(orderId,credential.token)
}

// Internal fulfillment/Admin callers only: caller must have already authorized
// this order through its existing reader. Never accept an arbitrary client ID.
export async function loadTrustedOrderMaterials(orderId:string) {
  const {data,error}=await supabaseAdmin.from('orders').select('customer_id').eq('order_id',materialUuid(orderId)).maybeSingle()
  if (error || !data?.customer_id) throw new MaterialError('materials_unavailable',503)
  return loadOrderMaterials(orderId,{customerId:materialUuid(data.customer_id),tokenHash:null})
}

export async function loadTrustedOrderLineDedications(orderId:string) {
  const rows=await rpc('materials_read_trusted_lines',{p_order:materialUuid(orderId)})
  if (!Array.isArray(rows) || !rows.length) throw new MaterialError('materials_unavailable',503)
  return rows.map(row=>({cartItemId:materialUuid(row.cart_item_id),creationId:materialUuid(row.creation_id),
    ...parseMaterialDedication(row),deadline:String(row.dedication_deadline)}))
}
