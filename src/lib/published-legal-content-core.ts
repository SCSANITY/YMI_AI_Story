import type {
  FooterLegalContent,
  LegalSection,
} from '@/lib/footer-legal-content'
import type {
  CanonicalLegalDocument,
  CanonicalLegalDocumentKey,
} from '@/lib/legal-documents'
import { normalizeLegalRevisionContent } from '@/lib/legal-publishing'

export type FooterLegalContentKey = keyof FooterLegalContent

export type PublishedLegalRevisionCandidate = {
  documentKey: CanonicalLegalDocumentKey
  currentPublishedRevisionId: string
  revisionId: string
  status: string
  contentByLocale: unknown
}

export type PublishedLegalContentStore = {
  loadCurrentPublishedRevisions(): Promise<PublishedLegalRevisionCandidate[]>
}

export type PublishedLegalContentSnapshot = {
  documents: Record<CanonicalLegalDocumentKey, CanonicalLegalDocument>
  footerContent: FooterLegalContent
  footerEffectiveDates: Record<FooterLegalContentKey, string>
}

function formatEffectiveDate(isoDate: string) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00.000Z`))
}

function cloneSnapshot(
  snapshot: PublishedLegalContentSnapshot,
): PublishedLegalContentSnapshot {
  return {
    documents: { ...snapshot.documents },
    footerContent: { ...snapshot.footerContent },
    footerEffectiveDates: { ...snapshot.footerEffectiveDates },
  }
}

export async function resolvePublishedLegalContentSnapshot(
  store: PublishedLegalContentStore,
  fallback: PublishedLegalContentSnapshot,
): Promise<PublishedLegalContentSnapshot> {
  let candidates: PublishedLegalRevisionCandidate[]
  try {
    candidates = await store.loadCurrentPublishedRevisions()
  } catch {
    return cloneSnapshot(fallback)
  }

  const snapshot = cloneSnapshot(fallback)

  for (const key of Object.keys(snapshot.documents) as CanonicalLegalDocumentKey[]) {
    const candidate = candidates.find(
      (item) =>
        item.documentKey === key &&
        item.status === 'published' &&
        item.revisionId === item.currentPublishedRevisionId,
    )
    if (!candidate) continue

    try {
      const content = normalizeLegalRevisionContent(candidate.contentByLocale).en
      const effectiveDate = formatEffectiveDate(content.effectiveDate)

      snapshot.documents[key] = {
        ...snapshot.documents[key],
        sections: content.sections,
        effectiveDate,
        version: content.version,
      }
      snapshot.footerContent[key] = content.sections as LegalSection[]
      snapshot.footerEffectiveDates[key] = effectiveDate
    } catch {
      // A malformed live revision must not blank or partially corrupt a public policy.
    }
  }

  return snapshot
}
