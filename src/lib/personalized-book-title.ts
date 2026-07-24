const DEFAULT_BOOK_TITLE = 'Custom Story Book'

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as UnknownRecord
}

function asRelationRecord(value: unknown) {
  if (Array.isArray(value)) return asRecord(value[0])
  return asRecord(value)
}

function firstNonEmptyString(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function titleCaseDisplayText(value: string) {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word) => {
      if (/^[A-Z0-9]+$/.test(word)) return word
      return `${word.charAt(0).toUpperCase()}${word.slice(1)}`
    })
    .join(' ')
}

function possessiveName(name: string) {
  return /s$/i.test(name) ? `${name}'` : `${name}'s`
}

export function resolveChildNameFromCustomization(input: {
  childName?: unknown
  customizeSnapshot?: unknown
  textOverrides?: unknown
}) {
  const directName = firstNonEmptyString(input.childName)
  if (directName) return directName

  const snapshot = asRecord(input.customizeSnapshot)
  const directSnapshotName = firstNonEmptyString(
    snapshot?.childName,
    snapshot?.child_name,
    snapshot?.name
  )
  if (directSnapshotName) return directSnapshotName

  const overrides =
    asRecord(input.textOverrides) ??
    asRecord(snapshot?.textOverrides) ??
    asRecord(snapshot?.text_overrides)

  return firstNonEmptyString(
    overrides?.child_name,
    overrides?.childName,
    overrides?.name
  )
}

export function resolveTemplateDisplayTitle(input: {
  templateName?: unknown
  fallbackTitle?: unknown
  templateId?: unknown
}) {
  const rawTitle = firstNonEmptyString(input.templateName, input.fallbackTitle, input.templateId)
  const displayTitle = titleCaseDisplayText(rawTitle || DEFAULT_BOOK_TITLE)
  return displayTitle || DEFAULT_BOOK_TITLE
}

export function resolvePersonalizedBookTitle(input: {
  templateId?: unknown
  templateName?: unknown
  fallbackTitle?: unknown
  customizeSnapshot?: unknown
  textOverrides?: unknown
  childName?: unknown
}) {
  const baseTitle = resolveTemplateDisplayTitle(input)
  const childName = resolveChildNameFromCustomization(input)
  if (!childName) return baseTitle

  const normalizedBaseTitle = baseTitle.toLowerCase()
  if (normalizedBaseTitle.includes(childName.toLowerCase())) {
    return baseTitle
  }

  return `${possessiveName(childName)} ${baseTitle}`
}

export function resolveCartItemDisplayTitle(input: {
  bookID?: unknown
  book?: unknown
  personalization?: unknown
}) {
  const book = asRecord(input.book)
  const personalization = asRecord(input.personalization)

  return resolvePersonalizedBookTitle({
    templateId: input.bookID,
    templateName: book?.title,
    fallbackTitle: book?.title,
    customizeSnapshot: personalization,
    textOverrides: personalization?.textOverrides ?? personalization?.text_overrides,
    childName: personalization?.childName ?? personalization?.child_name,
  })
}

export function resolveFinalJobDisplayTitle(input: {
  template_id?: unknown
  creations?: unknown
}) {
  const creation = asRelationRecord(input.creations)
  const template = asRelationRecord(creation?.templates)

  return resolvePersonalizedBookTitle({
    templateId: input.template_id,
    templateName: template?.name,
    customizeSnapshot: creation?.customize_snapshot,
  })
}
