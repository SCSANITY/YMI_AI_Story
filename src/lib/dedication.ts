export type DedicationDecision = 'undecided' | 'skipped' | 'confirmed'

export type DedicationChoice = {
  creationId: string
  decision: DedicationDecision
  body: string | null
  revision: number | null
  previouslyPurchased: boolean
}

export const DEDICATION_SAMPLE = 'May your story always be filled with wonder, kindness, and courage. Wherever life takes you, remember how deeply you are loved.'
export const DEDICATION_MAX_CHARACTERS = 300
export const DEDICATION_MAX_LINE_BREAKS = 8

export function normalizeDedicationBody(value: string) {
  return value.replace(/\r\n?/g, '\n').trim()
}

export function dedicationBodyMetrics(value: string) {
  const normalized = normalizeDedicationBody(value)
  return {
    normalized,
    characters: Array.from(normalized).length,
    lineBreaks: (normalized.match(/\n/g) || []).length,
  }
}

export function validDedicationBody(value: string) {
  const { characters, lineBreaks } = dedicationBodyMetrics(value)
  return characters > 0 && characters <= DEDICATION_MAX_CHARACTERS && lineBreaks <= DEDICATION_MAX_LINE_BREAKS
}

const acknowledgementKey = (creationId: string) => `ymi_dedication_ack_${creationId}`

export function rememberDedicationAcknowledgement(creationId: string, acknowledgement: { decision: 'skipped' | 'confirmed'; revision: number }) {
  try { window.sessionStorage.setItem(acknowledgementKey(creationId), JSON.stringify(acknowledgement)) } catch { /* private browsing */ }
}

export function readDedicationAcknowledgement(creationId: string) {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(acknowledgementKey(creationId)) || 'null')
    return (value?.decision === 'skipped' || value?.decision === 'confirmed') && Number.isSafeInteger(value?.revision)
      ? value as { decision: 'skipped' | 'confirmed'; revision: number } : null
  } catch { return null }
}

export function clearDedicationAcknowledgement(creationId: string) {
  try { window.sessionStorage.removeItem(acknowledgementKey(creationId)) } catch { /* private browsing */ }
}
