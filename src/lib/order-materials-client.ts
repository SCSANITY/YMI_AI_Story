import type { MaterialItem } from '@/lib/order-materials'

export function formatMaterialTime(value: string, locale?: string, timeZone?: string): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium', timeStyle: 'long', ...(timeZone ? { timeZone } : {}),
  })
  return `${formatter.format(new Date(value))} (${formatter.resolvedOptions().timeZone})`
}

// Capture both fields at edit intent, never from a later refreshed DTO at commit.
export function recordingIntent(item: MaterialItem) {
  if (!item.can_submit_voice || item.voice_revision === null) return null
  return { itemId: item.cart_item_id, expectedAssetId: item.voice_asset_id, expectedRevision: item.voice_revision }
}

export function recordingStatus(item: MaterialItem, now = Date.now()) {
  if (item.voice_ready) return item.can_replace_voice ? 'replaceable' : 'submitted'
  if (!item.can_submit_voice) return 'unavailable'
  return now >= Date.parse(item.voice_replace_until) ? 'late-first' : 'missing'
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

// Audio elements cannot attach the scoped grant. Keep it in a header, never a URL.
export async function fetchMaterialRecording(orderId: string, itemId: string, assetId: string, token: string | null | undefined, signal: AbortSignal) {
  const params = new URLSearchParams({ orderId, itemId })
  const response = await fetch(`/api/user-assets/${encodeURIComponent(assetId)}/download?${params}`, {
    credentials: 'include', cache: 'no-store', redirect: 'error', signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error('The current recording could not be played. Check your access or reload its status.')
  return response.blob()
}
