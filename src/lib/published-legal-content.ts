import { unstable_cache } from 'next/cache'
import { getFooterLegalContent } from '@/lib/footer-legal-content'
import {
  CANONICAL_LEGAL_DOCUMENT_KEYS,
  getCanonicalLegalDocuments,
  type CanonicalLegalDocumentKey,
} from '@/lib/legal-documents'
import { PUBLISHED_LEGAL_CONTENT_CACHE_TAG } from '@/lib/legal-content-cache'
import {
  resolvePublishedLegalContentSnapshot,
  type FooterLegalContentKey,
  type PublishedLegalContentSnapshot,
  type PublishedLegalContentStore,
  type PublishedLegalRevisionCandidate,
} from '@/lib/published-legal-content-core'

type LegalDocumentPointerRow = {
  document_id: string
  document_key: string
  current_published_revision_id: string | null
}

type PublishedRevisionRow = {
  revision_id: string
  document_id: string
  status: string
  content_by_locale: unknown
}

const FALLBACK_EFFECTIVE_DATES: Record<FooterLegalContentKey, string> = {
  privacy: 'August 28, 2026',
  terms: 'March 12, 2026',
  ourStory: 'March 12, 2026',
  shipping: 'May 11, 2026',
  refund: 'May 11, 2026',
  safety: 'May 11, 2026',
  impact: 'March 12, 2026',
}

function buildCodeOwnedFallback(): PublishedLegalContentSnapshot {
  const documents = getCanonicalLegalDocuments()
  const documentRecord = Object.fromEntries(
    documents.map((document) => [document.key, document]),
  ) as PublishedLegalContentSnapshot['documents']

  return {
    documents: documentRecord,
    footerContent: getFooterLegalContent('en'),
    footerEffectiveDates: { ...FALLBACK_EFFECTIVE_DATES },
  }
}

const supabasePublishedLegalContentStore: PublishedLegalContentStore = {
  async loadCurrentPublishedRevisions() {
    const { supabaseAdmin } = await import('@/lib/supabaseAdmin')
    const { data: documentData, error: documentError } = await supabaseAdmin
      .from('legal_documents')
      .select('document_id, document_key, current_published_revision_id')
      .in('document_key', [...CANONICAL_LEGAL_DOCUMENT_KEYS])

    if (documentError) {
      throw new Error(
        documentError.message || 'Failed to load published legal document pointers',
      )
    }

    const documents = (documentData ?? []) as LegalDocumentPointerRow[]
    const revisionIds = documents
      .map((document) => document.current_published_revision_id)
      .filter((revisionId): revisionId is string => Boolean(revisionId))
    if (revisionIds.length === 0) return []

    const { data: revisionData, error: revisionError } = await supabaseAdmin
      .from('legal_document_revisions')
      .select('revision_id, document_id, status, content_by_locale')
      .in('revision_id', revisionIds)
      .eq('status', 'published')

    if (revisionError) {
      throw new Error(
        revisionError.message || 'Failed to load published legal document revisions',
      )
    }

    const revisions = (revisionData ?? []) as unknown as PublishedRevisionRow[]
    const revisionsById = new Map(
      revisions.map((revision) => [revision.revision_id, revision]),
    )

    return documents.flatMap((document) => {
      const revisionId = document.current_published_revision_id
      if (!revisionId) return []
      const revision = revisionsById.get(revisionId)
      if (
        !revision ||
        revision.document_id !== document.document_id ||
        !CANONICAL_LEGAL_DOCUMENT_KEYS.includes(
          document.document_key as CanonicalLegalDocumentKey,
        )
      ) {
        return []
      }

      return [{
        documentKey: document.document_key as CanonicalLegalDocumentKey,
        currentPublishedRevisionId: revisionId,
        revisionId: revision.revision_id,
        status: revision.status,
        contentByLocale: revision.content_by_locale,
      } satisfies PublishedLegalRevisionCandidate]
    })
  },
}

const loadPublishedLegalContentSnapshot = unstable_cache(
  () =>
    resolvePublishedLegalContentSnapshot(
      supabasePublishedLegalContentStore,
      buildCodeOwnedFallback(),
    ),
  ['ymi-published-legal-content-v1'],
  {
    revalidate: 300,
    tags: [PUBLISHED_LEGAL_CONTENT_CACHE_TAG],
  },
)

export function getPublishedLegalContentSnapshot() {
  return loadPublishedLegalContentSnapshot()
}

export async function getPublishedLegalDocument(
  key: CanonicalLegalDocumentKey,
) {
  const snapshot = await getPublishedLegalContentSnapshot()
  return snapshot.documents[key]
}

export async function getPublishedLegalDocuments() {
  const snapshot = await getPublishedLegalContentSnapshot()
  return CANONICAL_LEGAL_DOCUMENT_KEYS.map((key) => snapshot.documents[key])
}
