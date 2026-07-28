import type { LegalSection, LegalTextItem } from '@/lib/footer-legal-content'
import type { CanonicalLegalDocumentKey } from '@/lib/legal-documents'

export type LegalRevisionStatus = 'draft' | 'published' | 'archived'

export type LegalLocaleContent = {
  sections: LegalSection[]
  effectiveDate: string
  version: string
}

export type LegalRevisionContent = {
  en: LegalLocaleContent
}

export type LegalRevision = {
  revisionId: string
  documentId: string
  revisionNumber: number
  status: LegalRevisionStatus
  content: LegalRevisionContent
  draftVersion: number
  basePublishedRevisionId: string | null
  sourceRevisionId: string | null
  createdByCustomerId: string | null
  createdAt: string
  updatedByCustomerId: string | null
  updatedAt: string
  publishedByCustomerId: string | null
  publishedAt: string | null
}

export type LegalDocumentSummary = {
  documentId: string
  documentKey: CanonicalLegalDocumentKey
  currentPublishedRevisionId: string | null
  currentRevisionNumber: number | null
  draftRevisionId: string | null
  draftVersion: number | null
  updatedAt: string
}

export type LegalDocumentState = {
  document: LegalDocumentSummary
  currentPublished: LegalRevision | null
  draft: LegalRevision | null
  publishedHistory: LegalRevision[]
}

export type SaveLegalDraftCommand = {
  documentKey: CanonicalLegalDocumentKey
  content: LegalRevisionContent
  expectedDraftRevisionId: string | null
  expectedDraftVersion: number | null
  basePublishedRevisionId: string
  actorCustomerId: string
}

export type PublishLegalDraftCommand = {
  documentKey: CanonicalLegalDocumentKey
  draftRevisionId: string
  expectedDraftVersion: number
  basePublishedRevisionId: string
  actorCustomerId: string
}

export type RollbackLegalRevisionCommand = {
  documentKey: CanonicalLegalDocumentKey
  sourceRevisionId: string
  expectedCurrentPublishedRevisionId: string
  actorCustomerId: string
}

export type LegalPublishingStore = {
  loadDocument(documentKey: CanonicalLegalDocumentKey): Promise<LegalDocumentState | null>
  saveDraft(command: SaveLegalDraftCommand): Promise<LegalDocumentState>
  publishDraft(command: PublishLegalDraftCommand): Promise<LegalDocumentState>
  rollback(command: RollbackLegalRevisionCommand): Promise<LegalDocumentState>
}

export class LegalPublishingValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LegalPublishingValidationError'
  }
}

export class LegalPublishingConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LegalPublishingConflictError'
  }
}

const HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/i
const MAX_SECTIONS = 50
const MAX_ITEMS_PER_GROUP = 50
const MAX_TOTAL_CONTENT_BYTES = 200_000

function normalizePlainText(
  value: unknown,
  label: string,
  options: { required?: boolean; maxLength: number },
) {
  const normalized = typeof value === 'string'
    ? value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim()
    : ''

  if (options.required && !normalized) {
    throw new LegalPublishingValidationError(`${label} is required`)
  }
  if (normalized.length > options.maxLength) {
    throw new LegalPublishingValidationError(
      `${label} must be ${options.maxLength} characters or fewer`,
    )
  }
  if (HTML_TAG_PATTERN.test(normalized)) {
    throw new LegalPublishingValidationError(`${label} must not contain HTML`)
  }

  return normalized
}

function normalizeHref(value: unknown, label: string) {
  const normalized = normalizePlainText(value, label, { maxLength: 2_048 })
  if (!normalized) return undefined

  let url: URL
  try {
    url = new URL(normalized)
  } catch {
    throw new LegalPublishingValidationError(`${label} must be a valid HTTPS URL`)
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new LegalPublishingValidationError(`${label} must be a public HTTPS URL`)
  }
  return url.toString()
}

function normalizeTextItems(
  value: unknown,
  label: string,
): LegalTextItem[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    throw new LegalPublishingValidationError(`${label} must be a list`)
  }
  if (value.length > MAX_ITEMS_PER_GROUP) {
    throw new LegalPublishingValidationError(
      `${label} must contain ${MAX_ITEMS_PER_GROUP} items or fewer`,
    )
  }

  const items = value.map((rawItem, index) => {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      throw new LegalPublishingValidationError(`${label} item ${index + 1} is invalid`)
    }
    const item = rawItem as Record<string, unknown>
    const text = normalizePlainText(item.text, `${label} item ${index + 1} text`, {
      required: true,
      maxLength: 8_000,
    })
    const itemLabel = normalizePlainText(
      item.label,
      `${label} item ${index + 1} label`,
      { maxLength: 240 },
    )
    const href = normalizeHref(item.href, `${label} item ${index + 1} link`)

    return {
      ...(itemLabel ? { label: itemLabel } : {}),
      text,
      ...(href ? { href } : {}),
    }
  })

  return items.length > 0 ? items : undefined
}

export function normalizeLegalSections(value: unknown): LegalSection[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new LegalPublishingValidationError('At least one legal section is required')
  }
  if (value.length > MAX_SECTIONS) {
    throw new LegalPublishingValidationError(
      `Legal content must contain ${MAX_SECTIONS} sections or fewer`,
    )
  }

  return value.map((rawSection, index) => {
    if (!rawSection || typeof rawSection !== 'object' || Array.isArray(rawSection)) {
      throw new LegalPublishingValidationError(`Section ${index + 1} is invalid`)
    }
    const section = rawSection as Record<string, unknown>
    const title = normalizePlainText(section.title, `Section ${index + 1} title`, {
      maxLength: 300,
    })
    const paragraphs = normalizeTextItems(
      section.paragraphs,
      `Section ${index + 1} paragraphs`,
    )
    const bullets = normalizeTextItems(section.bullets, `Section ${index + 1} bullets`)

    if (!title && !paragraphs?.length && !bullets?.length) {
      throw new LegalPublishingValidationError(`Section ${index + 1} is empty`)
    }

    return {
      ...(title ? { title } : {}),
      ...(paragraphs ? { paragraphs } : {}),
      ...(bullets ? { bullets } : {}),
    }
  })
}

function normalizeIsoDate(value: unknown) {
  const normalized = normalizePlainText(value, 'Effective date', {
    required: true,
    maxLength: 10,
  })
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new LegalPublishingValidationError('Effective date must use YYYY-MM-DD')
  }
  const parsed = new Date(`${normalized}T00:00:00.000Z`)
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== normalized) {
    throw new LegalPublishingValidationError('Effective date is invalid')
  }
  return normalized
}

export function normalizeLegalRevisionContent(value: unknown): LegalRevisionContent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LegalPublishingValidationError('Legal revision content is invalid')
  }
  const content = value as Record<string, unknown>
  if (!content.en || typeof content.en !== 'object' || Array.isArray(content.en)) {
    throw new LegalPublishingValidationError('English legal content is required')
  }
  const english = content.en as Record<string, unknown>
  const normalized: LegalRevisionContent = {
    en: {
      sections: normalizeLegalSections(english.sections),
      effectiveDate: normalizeIsoDate(english.effectiveDate),
      version: normalizePlainText(english.version, 'Version', {
        required: true,
        maxLength: 80,
      }),
    },
  }

  if (new TextEncoder().encode(JSON.stringify(normalized)).byteLength > MAX_TOTAL_CONTENT_BYTES) {
    throw new LegalPublishingValidationError('Legal content is too large')
  }
  return normalized
}

export function getLegalPublishReadiness(state: LegalDocumentState) {
  if (!state.currentPublished) {
    return { ready: false as const, reason: 'Bootstrap the live revision first' }
  }
  if (!state.draft) {
    return { ready: false as const, reason: 'Save a draft before publishing' }
  }
  if (
    state.draft.basePublishedRevisionId !== state.document.currentPublishedRevisionId
  ) {
    return {
      ready: false as const,
      reason: 'The live revision changed after this draft was created',
    }
  }

  try {
    normalizeLegalRevisionContent(state.draft.content)
  } catch (error) {
    return {
      ready: false as const,
      reason: error instanceof Error ? error.message : 'The draft is invalid',
    }
  }

  return { ready: true as const, reason: null }
}

export async function saveLegalDraft(
  command: SaveLegalDraftCommand,
  store: LegalPublishingStore,
) {
  const content = normalizeLegalRevisionContent(command.content)
  if (!command.basePublishedRevisionId || !command.actorCustomerId) {
    throw new LegalPublishingValidationError('Draft ownership metadata is incomplete')
  }

  return store.saveDraft({ ...command, content })
}

export async function publishLegalDraft(
  command: PublishLegalDraftCommand,
  store: LegalPublishingStore,
) {
  const state = await store.loadDocument(command.documentKey)
  if (!state) throw new LegalPublishingValidationError('Legal document was not found')

  const readiness = getLegalPublishReadiness(state)
  if (!readiness.ready) throw new LegalPublishingValidationError(readiness.reason)
  if (
    state.document.currentPublishedRevisionId !== command.basePublishedRevisionId ||
    state.draft?.revisionId !== command.draftRevisionId ||
    state.draft.draftVersion !== command.expectedDraftVersion
  ) {
    throw new LegalPublishingConflictError(
      'The legal draft or live revision changed. Reload before publishing.',
    )
  }

  return store.publishDraft(command)
}

export async function rollbackLegalRevision(
  command: RollbackLegalRevisionCommand,
  store: LegalPublishingStore,
) {
  const state = await store.loadDocument(command.documentKey)
  if (!state?.currentPublished) {
    throw new LegalPublishingValidationError('Legal document was not found')
  }
  if (state.document.currentPublishedRevisionId !== command.expectedCurrentPublishedRevisionId) {
    throw new LegalPublishingConflictError(
      'The live revision changed. Reload before rolling back.',
    )
  }
  if (command.sourceRevisionId === command.expectedCurrentPublishedRevisionId) {
    throw new LegalPublishingValidationError('The selected revision is already live')
  }
  if (!state.publishedHistory.some((revision) => revision.revisionId === command.sourceRevisionId)) {
    throw new LegalPublishingValidationError('Rollback source revision was not found')
  }

  return store.rollback(command)
}
