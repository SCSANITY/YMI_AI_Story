import type { MaterialItem } from '@/lib/order-materials'

// SD-036: date language follows the English UI,never navigator.language.
export const MATERIAL_UI_LANGUAGE = 'en'
export function formatMaterialTime(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat(MATERIAL_UI_LANGUAGE, {
    year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone,timeZoneName:'long',
  }).formatToParts(new Date(value))
  const label=timeZone==='UTC'?'UTC':parts.find(part=>part.type==='timeZoneName')?.value
  return `${parts.filter(part=>part.type!=='timeZoneName').map(part=>part.value).join('').trim()} (${label})`
}

export function distinctMaterialNames(items: readonly {child_name?:string|null}[]): string[] {
  return [...new Set(items.map(item=>item.child_name?.trim()).filter((name):name is string=>Boolean(name)))]
}
// Capture both fields at edit intent, never from a later refreshed DTO at commit.
export function recordingIntent(item: MaterialItem) {
  if (!item.can_submit_voice || item.voice_revision === null) return null
  return { itemId: item.cart_item_id, expectedAssetId: item.voice_asset_id, expectedRevision: item.voice_revision }
}

export function materialWriteError(code: string | undefined) {
  switch (code) {
    case 'dedication_closed': return 'The message editing window has closed.'
    case 'dedication_revision_conflict': return 'This message changed in another window. Check the latest version before saving again.'
    case 'voice_window_closed': return 'The recording replacement window has closed. Your current recording is unchanged.'
    case 'voice_shipped': return 'Your book has shipped. Please contact our team about recording changes.'
    case 'voice_revision_conflict': return 'This recording changed in another window or with our team. Check the latest recording before starting a new update.'
    case 'voice_update_unknown': return 'We could not confirm this update. Check the current recording below before starting another upload. We have not retried it.'
    default: return 'Your changes could not be saved. Please check the current status before trying again.'
  }
}

export type PlaybackFailureReason='network'|'access'|'not-current'|'format'|'unavailable'
export class RecordingPlaybackError extends Error {
  constructor(public readonly reason:PlaybackFailureReason){super(reason)}
}
export function playbackHttpReason(status:number):PlaybackFailureReason {
  if(status===401||status===403)return 'access'
  if(status===409)return 'not-current'
  return status>=500?'network':'unavailable'
}
export function playbackMediaReason(code:number|undefined):PlaybackFailureReason {
  if(code===1||code===2)return 'network'
  return code===3||code===4?'format':'unavailable'
}
// Audio elements cannot attach the scoped grant. Keep it in a header, never a URL.
export async function fetchMaterialRecording(orderId: string, itemId: string, assetId: string, token: string | null | undefined, signal: AbortSignal) {
  const params = new URLSearchParams({ orderId, itemId })
  let response:Response
  try {
    response=await fetch(`/api/user-assets/${encodeURIComponent(assetId)}/download?${params}`, {
      credentials:'include',cache:'no-store',redirect:'error',signal,
      headers:token?{Authorization:`Bearer ${token}`}:{},
    })
  } catch {throw new RecordingPlaybackError('network')}
  if(!response.ok)throw new RecordingPlaybackError(playbackHttpReason(response.status))
  try {return await response.blob()}catch {throw new RecordingPlaybackError('network')}
}

export type MaterialShipment={shipped_at?:string|null;order_status?:string|null}
export function isMaterialOrderShipped(order:MaterialShipment|null|undefined):boolean {
  return Boolean(order?.shipped_at)||order?.order_status==='shipped'||order?.order_status==='delivered'
}
