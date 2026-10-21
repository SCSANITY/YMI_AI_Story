import 'server-only'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { hasCompleteSignatureVoiceBinding } from '@/lib/purchase-configuration'
import { type MaterialAccess, newMaterialCredential, materialAccessPath } from '@/lib/order-materials-access'
import { MaterialError, materialUuid, parseOrderMaterials, parseMaterialDedication, parseDedicationWrite } from '@/lib/order-materials'

function accessArgs(orderId: string,access: MaterialAccess) {
  return { p_order:materialUuid(orderId),p_customer:access.customerId,p_hash:access.tokenHash }
}
function failure(error: {code?: string;message?: string}): never {
  const message=error.message ?? ''
  if (error.code==='42501' || message.includes('materials_access_denied')) throw new MaterialError('material_access_denied',403)
  if (error.code==='40001') throw new MaterialError('dedication_revision_conflict',409)
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
export async function loadOrderLineDedications(orderId: string,access: MaterialAccess) {
  return (await loadOrderMaterials(orderId,access)).items.map(item=>({
    cartItemId:item.cart_item_id,creationId:item.creation_id,...item.dedication,
  }))
}
// Trusted server readers (Admin/fulfillment) must already scope their Creation
// IDs to an authorized order. This reads existing authority, never a copied source.
export async function loadCreationVoiceBindings(creationIds: readonly string[]) {
  const ids=[...new Set(creationIds.map(materialUuid))]
  if (!ids.length) return []
  if (ids.length>100) throw new MaterialError('invalid_material',400)
  const {data,error}=await supabaseAdmin.from('creations').select(
    'creation_id,voice_asset_id,voice_sample_duration_seconds,voice_consent_version,voice_consent_accepted_at,voice_bound_at,voice_subject_name,voice_subject_relationship,voice_capture_authorization_id,voice_speaker_kind'
  ).in('creation_id',ids)
  if (error || data?.length!==ids.length) throw new MaterialError('materials_unavailable',503)
  return data.map(row=>({ ...row,voiceReady:hasCompleteSignatureVoiceBinding(row) }))
}
export async function saveOrderDedication(orderId: string,access: MaterialAccess,value: unknown) {
  const input=parseDedicationWrite(value)
  return parseMaterialDedication(await rpc('materials_save_dedication',{
    ...accessArgs(orderId,access),p_item:input.itemId,p_expected:input.expectedRevision,p_body:input.body,
  }))
}
export async function bindOrderVoice(orderId: string,access: MaterialAccess,input: {
  itemId: unknown;assetId: unknown;authorizationId: unknown
}) {
  await rpc('materials_bind_voice',{...accessArgs(orderId,access),p_item:materialUuid(input.itemId),
    p_asset:materialUuid(input.assetId),p_authorization:materialUuid(input.authorizationId)})
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
