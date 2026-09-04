import {
  CANONICAL_LEGAL_DOCUMENT_KEYS,
  getCanonicalLegalDocuments,
  getCanonicalLegalDocumentEffectiveDateIso,
  type CanonicalLegalDocumentKey,
} from '@/lib/legal-documents'
import {
  LegalPublishingConflictError,
  LegalPublishingValidationError,
  normalizeLegalRevisionContent,
  publishLegalDraft as publishWithStore,
  rollbackLegalRevision as rollbackWithStore,
  saveLegalDraft as saveWithStore,
  type LegalDocumentState,
  type LegalDocumentSummary,
  type LegalPublishingStore,
  type LegalRevision,
  type LegalRevisionStatus,
  type PublishLegalDraftCommand,
  type RollbackLegalRevisionCommand,
  type SaveLegalDraftCommand,
} from '@/lib/legal-publishing'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type LegalDocumentRow = {
  document_id: string
  document_key: string
  current_published_revision_id: string | null
  updated_at: string
}

type LegalRevisionRow = {
  revision_id: string
  document_id: string
  revision_number: number
  status: string
  content_by_locale: unknown
  draft_version: number
  base_published_revision_id: string | null
  source_revision_id: string | null
  created_by_customer_id: string | null
  created_at: string
  updated_by_customer_id: string | null
  updated_at: string
  published_by_customer_id: string | null
  published_at: string | null
}

const DOCUMENT_SELECT =
  'document_id, document_key, current_published_revision_id, updated_at'
const REVISION_SELECT = [
  'revision_id',
  'document_id',
  'revision_number',
  'status',
  'content_by_locale',
  'draft_version',
  'base_published_revision_id',
  'source_revision_id',
  'created_by_customer_id',
  'created_at',
  'updated_by_customer_id',
  'updated_at',
  'published_by_customer_id',
  'published_at',
].join(', ')

export function isCanonicalLegalDocumentKey(
  value: unknown,
): value is CanonicalLegalDocumentKey {
  return CANONICAL_LEGAL_DOCUMENT_KEYS.includes(value as CanonicalLegalDocumentKey)
}

function mapStoreError(error: { code?: string; message?: string } | null, fallback: string): never {
  const message = String(error?.message || fallback)
  if (error?.code === '40001' || /changed|conflict|older live revision/i.test(message)) {
    throw new LegalPublishingConflictError(message)
  }
  if (error?.code === '22023' || error?.code === 'P0002') {
    throw new LegalPublishingValidationError(message)
  }
  throw new Error(message)
}

function mapRevision(row: LegalRevisionRow): LegalRevision {
  const status = String(row.status) as LegalRevisionStatus
  if (!['draft', 'published', 'archived'].includes(status)) {
    throw new Error(`Unknown legal revision status: ${row.status}`)
  }

  return {
    revisionId: String(row.revision_id),
    documentId: String(row.document_id),
    revisionNumber: Number(row.revision_number),
    status,
    content: normalizeLegalRevisionContent(row.content_by_locale),
    draftVersion: Number(row.draft_version || 0),
    basePublishedRevisionId: row.base_published_revision_id
      ? String(row.base_published_revision_id)
      : null,
    sourceRevisionId: row.source_revision_id ? String(row.source_revision_id) : null,
    createdByCustomerId: row.created_by_customer_id
      ? String(row.created_by_customer_id)
      : null,
    createdAt: String(row.created_at),
    updatedByCustomerId: row.updated_by_customer_id
      ? String(row.updated_by_customer_id)
      : null,
    updatedAt: String(row.updated_at),
    publishedByCustomerId: row.published_by_customer_id
      ? String(row.published_by_customer_id)
      : null,
    publishedAt: row.published_at ? String(row.published_at) : null,
  }
}

function buildDocumentState(
  documentRow: LegalDocumentRow,
  revisionRows: LegalRevisionRow[],
): LegalDocumentState {
  const revisions = revisionRows.map(mapRevision)
  const currentPublished = revisions.find(
    (revision) => revision.revisionId === documentRow.current_published_revision_id,
  ) ?? null
  const draft = revisions.find((revision) => revision.status === 'draft') ?? null
  const publishedHistory = revisions
    .filter((revision) => revision.status === 'published')
    .sort((left, right) => right.revisionNumber - left.revisionNumber)

  const document: LegalDocumentSummary = {
    documentId: String(documentRow.document_id),
    documentKey: documentRow.document_key as CanonicalLegalDocumentKey,
    currentPublishedRevisionId: documentRow.current_published_revision_id
      ? String(documentRow.current_published_revision_id)
      : null,
    currentRevisionNumber: currentPublished?.revisionNumber ?? null,
    draftRevisionId: draft?.revisionId ?? null,
    draftVersion: draft?.draftVersion ?? null,
    updatedAt: String(documentRow.updated_at),
  }

  return {
    document,
    currentPublished,
    draft,
    publishedHistory,
  }
}

async function loadDocumentRows(documentKey?: CanonicalLegalDocumentKey) {
  let query = supabaseAdmin
    .from('legal_documents')
    .select(DOCUMENT_SELECT)
    .order('document_key', { ascending: true })

  if (documentKey) query = query.eq('document_key', documentKey)
  const { data, error } = await query
  if (error) mapStoreError(error, 'Failed to load legal documents')
  return (data ?? []) as LegalDocumentRow[]
}

async function loadRevisionRows(documentIds: string[]) {
  if (documentIds.length === 0) return []
  const { data, error } = await supabaseAdmin
    .from('legal_document_revisions')
    .select(REVISION_SELECT)
    .in('document_id', documentIds)
    .in('status', ['draft', 'published'])
    .order('revision_number', { ascending: false })

  if (error) mapStoreError(error, 'Failed to load legal document revisions')
  return (data ?? []) as unknown as LegalRevisionRow[]
}

export async function listAdminLegalDocuments(): Promise<LegalDocumentSummary[]> {
  const documents = await loadDocumentRows()
  const revisions = await loadRevisionRows(documents.map((document) => document.document_id))
  return documents.map((document) => {
    const state = buildDocumentState(
      document,
      revisions.filter((revision) => revision.document_id === document.document_id),
    )
    return state.document
  })
}

export async function loadAdminLegalDocument(
  documentKey: CanonicalLegalDocumentKey,
): Promise<LegalDocumentState | null> {
  const documents = await loadDocumentRows(documentKey)
  const document = documents[0]
  if (!document) return null
  const revisions = await loadRevisionRows([document.document_id])
  return buildDocumentState(document, revisions)
}

async function callLegalRpc(
  name:
    | 'bootstrap_legal_document'
    | 'save_legal_document_draft'
    | 'publish_legal_document_draft'
    | 'rollback_legal_document_revision',
  params: Record<string, unknown>,
) {
  const { data, error } = await supabaseAdmin.rpc(name, params)
  if (error) mapStoreError(error, `Legal publishing operation ${name} failed`)
  if (!data) throw new Error(`Legal publishing operation ${name} returned no revision`)
  return String(data)
}

const supabaseLegalPublishingStore: LegalPublishingStore = {
  loadDocument: loadAdminLegalDocument,

  async saveDraft(command) {
    await callLegalRpc('save_legal_document_draft', {
      p_document_key: command.documentKey,
      p_content_by_locale: command.content,
      p_expected_draft_revision_id: command.expectedDraftRevisionId,
      p_expected_draft_version: command.expectedDraftVersion,
      p_base_published_revision_id: command.basePublishedRevisionId,
      p_actor_customer_id: command.actorCustomerId,
    })
    const state = await loadAdminLegalDocument(command.documentKey)
    if (!state) throw new Error('Saved legal document could not be reloaded')
    return state
  },

  async publishDraft(command) {
    await callLegalRpc('publish_legal_document_draft', {
      p_document_key: command.documentKey,
      p_draft_revision_id: command.draftRevisionId,
      p_expected_draft_version: command.expectedDraftVersion,
      p_base_published_revision_id: command.basePublishedRevisionId,
      p_actor_customer_id: command.actorCustomerId,
    })
    const state = await loadAdminLegalDocument(command.documentKey)
    if (!state) throw new Error('Published legal document could not be reloaded')
    return state
  },

  async rollback(command) {
    await callLegalRpc('rollback_legal_document_revision', {
      p_document_key: command.documentKey,
      p_source_revision_id: command.sourceRevisionId,
      p_expected_current_published_revision_id:
        command.expectedCurrentPublishedRevisionId,
      p_actor_customer_id: command.actorCustomerId,
    })
    const state = await loadAdminLegalDocument(command.documentKey)
    if (!state) throw new Error('Rolled-back legal document could not be reloaded')
    return state
  },
}

export async function bootstrapAdminLegalDocuments(actorCustomerId: string) {
  for (const document of getCanonicalLegalDocuments()) {
    const content = normalizeLegalRevisionContent({
      en: {
        sections: document.sections,
        effectiveDate: getCanonicalLegalDocumentEffectiveDateIso(document),
        version: document.version,
      },
    })
    await callLegalRpc('bootstrap_legal_document', {
      p_document_key: document.key,
      p_content_by_locale: content,
      p_actor_customer_id: actorCustomerId,
    })
  }
  return listAdminLegalDocuments()
}

export function saveAdminLegalDraft(command: SaveLegalDraftCommand) {
  return saveWithStore(command, supabaseLegalPublishingStore)
}

export function publishAdminLegalDraft(command: PublishLegalDraftCommand) {
  return publishWithStore(command, supabaseLegalPublishingStore)
}

export function rollbackAdminLegalRevision(command: RollbackLegalRevisionCommand) {
  return rollbackWithStore(command, supabaseLegalPublishingStore)
}
