import { isUuid } from '@/lib/validators'
import { dedicationBodyMetrics, validDedicationBody } from '@/lib/dedication'

export type MaterialItem = {
  cart_item_id: string
  creation_id: string
  template_id: string
  child_name?:string|null
  package_type: 'basic' | 'supreme'
  dedication: { decision: 'skipped' | 'confirmed'; body: string | null; revision: number }
  can_edit_dedication: boolean
  voice_ready: boolean
  can_submit_voice: boolean
  can_replace_voice: boolean
  voice_asset_id: string | null
  voice_revision: number | null
  voice_uploaded_at: string | null
  voice_replace_until: string
  book?: { title: string; cover_url: string | null; cover_status: 'ready' | 'pending' | 'unavailable' }
}
export type OrderMaterials = { order_id: string; dedication_deadline: string; items: MaterialItem[] }
export class MaterialError extends Error {
  constructor(public readonly code: string, public readonly status: number) { super(code) }
}
export function materialRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MaterialError('invalid_material',400)
  return value as Record<string, unknown>
}
export function materialUuid(value: unknown): string {
  if (typeof value !== 'string' || !isUuid(value)) throw new MaterialError('invalid_material_identity',400)
  return value
}
export function parseMaterialDedication(value: unknown): MaterialItem['dedication'] {
  const row=materialRecord(value)
  if (!Number.isSafeInteger(row.revision) || Number(row.revision)<1) throw new MaterialError('materials_unavailable',503)
  if (row.decision==='skipped' && row.body===null) return { decision:'skipped',body:null,revision:Number(row.revision) }
  if (row.decision==='confirmed' && typeof row.body==='string' && validDedicationBody(row.body)) {
    return { decision:'confirmed',body:row.body,revision:Number(row.revision) }
  }
  throw new MaterialError('materials_unavailable',503)
}
// Explicit projection: even an accidental extra DB field cannot escape into a
// scoped email-link DTO (no receipt/address/owner/asset paths or credentials).
export function parseOrderMaterials(value: unknown): OrderMaterials {
  const row=materialRecord(value)
  const deadline=typeof row.dedication_deadline==='string' ? Date.parse(row.dedication_deadline) : NaN
  if (!Number.isFinite(deadline) || !Array.isArray(row.items) || !row.items.length || row.items.length>100) {
    throw new MaterialError('materials_unavailable',503)
  }
  const items=row.items.map(value=>{
    const item=materialRecord(value)
    if ((item.package_type!=='basic' && item.package_type!=='supreme')
      || typeof item.template_id!=='string' || !item.template_id || item.template_id.length>200
      || typeof item.can_edit_dedication!=='boolean' || typeof item.voice_ready!=='boolean'
      || typeof item.can_submit_voice!=='boolean'
      || typeof item.can_replace_voice!=='boolean'
      || !Number.isFinite(Date.parse(String(item.voice_replace_until)))
      || (item.voice_asset_id!==null && (typeof item.voice_asset_id!=='string' || !isUuid(item.voice_asset_id)))
      || (item.voice_uploaded_at!==null && !Number.isFinite(Date.parse(String(item.voice_uploaded_at))))
      || item.voice_ready!==(item.voice_asset_id!==null)
      || (item.package_type==='supreme' && (!Number.isSafeInteger(item.voice_revision) || Number(item.voice_revision)<1))
      || (item.package_type==='basic' && (item.voice_revision!==null || item.voice_ready || item.can_submit_voice || item.can_replace_voice))
      || (item.can_replace_voice && (!item.voice_ready || !item.can_submit_voice))
      || (item.voice_ready && item.can_submit_voice!==item.can_replace_voice)) {
      throw new MaterialError('materials_unavailable',503)
    }
    let book: MaterialItem['book']
    if (item.book!==undefined) {
      const display=materialRecord(item.book)
      if (typeof display.title!=='string' || !display.title.trim()
        || (display.cover_url!==null && typeof display.cover_url!=='string')
        || !['ready','pending','unavailable'].includes(String(display.cover_status))) {
        throw new MaterialError('materials_unavailable',503)
      }
      book={title:display.title,cover_url:display.cover_url as string|null,
        cover_status:display.cover_status as 'ready'|'pending'|'unavailable'}
    }
    return { cart_item_id:materialUuid(item.cart_item_id),creation_id:materialUuid(item.creation_id),
      template_id:item.template_id,child_name:typeof item.child_name==='string'?item.child_name.trim()||null:null,package_type:item.package_type,
      dedication:parseMaterialDedication(item.dedication),can_edit_dedication:item.can_edit_dedication,
      voice_ready:item.voice_ready,can_submit_voice:item.can_submit_voice,can_replace_voice:item.can_replace_voice,
      voice_asset_id:item.voice_asset_id as string|null,voice_revision:item.voice_revision as number|null,
      voice_uploaded_at:item.voice_uploaded_at as string|null,voice_replace_until:String(item.voice_replace_until),
      ...(book?{book}:{}) } satisfies MaterialItem
  })
  if (new Set(items.map(item=>item.cart_item_id)).size!==items.length) throw new MaterialError('materials_unavailable',503)
  return { order_id:materialUuid(row.order_id),dedication_deadline:new Date(deadline).toISOString(),items }
}
export function parseDedicationWrite(value: unknown) {
  const row=materialRecord(value)
  if (!Number.isSafeInteger(row.expectedRevision) || Number(row.expectedRevision)<1
    || typeof row.body!=='string') throw new MaterialError('invalid_material',400)
  const body=dedicationBodyMetrics(row.body).normalized
  if (body.trim() && !validDedicationBody(body)) throw new MaterialError('invalid_dedication',400)
  return { itemId:materialUuid(row.itemId),expectedRevision:Number(row.expectedRevision),body }
}

export type OrderMaterialsPage = OrderMaterials | {order_id:string;disposition:'shipped'}
export function parseOrderMaterialsPage(value:unknown):OrderMaterialsPage {
  const row=materialRecord(value)
  if(row.disposition==='shipped')return {order_id:materialUuid(row.order_id),disposition:'shipped'}
  return parseOrderMaterials(value)
}
