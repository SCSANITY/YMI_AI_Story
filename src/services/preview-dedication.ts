import type { DedicationChoice } from '@/lib/dedication'

export async function readPreviewDedications(creationIds: string[], signal?: AbortSignal): Promise<DedicationChoice[]> {
  const params = new URLSearchParams()
  for (const id of new Set(creationIds)) params.append('creationId', id)
  const response = await fetch(`/api/dedication?${params}`, { credentials: 'include', cache: 'no-store', signal })
  const data = await response.json().catch(() => null)
  if (!response.ok || !Array.isArray(data?.choices)) throw new Error('Unable to load your message. Please try again.')
  return creationIds.map(id => {
    const choice = data.choices.find((item: DedicationChoice) => item.creationId === id)
    if (!choice) throw new Error('Message identity is unavailable.')
    return choice
  })
}

export async function savePreviewDedication(choice: DedicationChoice, decision: 'confirmed' | 'skipped', body: string | null, signal?: AbortSignal): Promise<DedicationChoice> {
  const response = await fetch('/api/dedication', {
    method: 'POST', credentials: 'include', cache: 'no-store', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creationId: choice.creationId, expectedRevision: choice.revision, decision, body: decision === 'confirmed' ? body : null }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data?.choice) throw new Error(data?.error || 'Unable to save your message. Please try again.')
  return { ...choice, ...data.choice }
}
