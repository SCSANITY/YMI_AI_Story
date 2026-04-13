export type InternalBookType = 'digital' | 'basic' | 'premium' | 'supreme'

export type SelectedBookTypeDisplay =
  | 'Cloud Explorer'
  | 'Classic'
  | 'Immersive'
  | 'Signature Voice'

export function mapBookTypeToDisplay(value: unknown): SelectedBookTypeDisplay {
  const raw = String(value ?? '').trim().toLowerCase()

  if (raw === 'digital' || raw === 'cloud explorer') return 'Cloud Explorer'
  if (raw === 'premium' || raw === 'immersive') return 'Immersive'
  if (
    raw === 'supreme' ||
    raw === 'legacy signature' ||
    raw === 'signature voice'
  ) {
    return 'Signature Voice'
  }

  return 'Classic'
}
