import assert from 'node:assert/strict'
import { test } from 'node:test'
import type {
  CanonicalLegalDocument,
  CanonicalLegalDocumentKey,
} from '@/lib/legal-documents'
import {
  resolvePublishedLegalContentSnapshot,
  type PublishedLegalContentSnapshot,
  type PublishedLegalContentStore,
  type PublishedLegalRevisionCandidate,
} from '@/lib/published-legal-content-core'

const keys: CanonicalLegalDocumentKey[] = [
  'privacy',
  'terms',
  'shipping',
  'refund',
]

function makeFallback(): PublishedLegalContentSnapshot {
  const documents = Object.fromEntries(
    keys.map((key) => [
      key,
      {
        key,
        title: `${key} title`,
        shortTitle: key,
        description: `${key} description`,
        path: `/${key}`,
        effectiveDate: 'January 1, 2026',
        version: 'fallback',
        sections: [{ title: `${key} fallback` }],
      } satisfies CanonicalLegalDocument,
    ]),
  ) as Record<CanonicalLegalDocumentKey, CanonicalLegalDocument>

  return {
    documents,
    footerContent: {
      privacy: documents.privacy.sections,
      terms: documents.terms.sections,
      shipping: documents.shipping.sections,
      refund: documents.refund.sections,
      ourStory: [{ title: 'Our story fallback' }],
      safety: [{ title: 'Safety fallback' }],
      impact: [{ title: 'Impact fallback' }],
    },
    footerEffectiveDates: {
      privacy: 'January 1, 2026',
      terms: 'January 1, 2026',
      shipping: 'January 1, 2026',
      refund: 'January 1, 2026',
      ourStory: 'January 1, 2026',
      safety: 'January 1, 2026',
      impact: 'January 1, 2026',
    },
  }
}

function makeCandidate(
  overrides: Partial<PublishedLegalRevisionCandidate> = {},
): PublishedLegalRevisionCandidate {
  return {
    documentKey: 'privacy',
    currentPublishedRevisionId: 'published-revision',
    revisionId: 'published-revision',
    status: 'published',
    contentByLocale: {
      en: {
        sections: [{ title: 'Published privacy' }],
        effectiveDate: '2026-08-01',
        version: '2026-08-01',
      },
    },
    ...overrides,
  }
}

function storeReturning(
  candidates: PublishedLegalRevisionCandidate[],
): PublishedLegalContentStore {
  return {
    async loadCurrentPublishedRevisions() {
      return candidates
    },
  }
}

test('published legal content replaces the matching code-owned fallback', async () => {
  const snapshot = await resolvePublishedLegalContentSnapshot(
    storeReturning([makeCandidate()]),
    makeFallback(),
  )

  assert.equal(snapshot.documents.privacy.sections[0]?.title, 'Published privacy')
  assert.equal(snapshot.documents.privacy.effectiveDate, 'August 1, 2026')
  assert.equal(snapshot.documents.privacy.version, '2026-08-01')
  assert.equal(snapshot.footerContent.privacy[0]?.title, 'Published privacy')
  assert.equal(snapshot.footerEffectiveDates.privacy, 'August 1, 2026')
  assert.equal(snapshot.documents.terms.version, 'fallback')
})

test('store failure returns meaningful code-owned content for every document', async () => {
  const fallback = makeFallback()
  const snapshot = await resolvePublishedLegalContentSnapshot(
    {
      async loadCurrentPublishedRevisions() {
        throw new Error('database unavailable')
      },
    },
    fallback,
  )

  for (const key of keys) {
    assert.equal(snapshot.documents[key].version, 'fallback')
    assert.ok(snapshot.documents[key].sections.length > 0)
  }
})

test('missing current published revision falls back only for that document', async () => {
  const snapshot = await resolvePublishedLegalContentSnapshot(
    storeReturning([]),
    makeFallback(),
  )

  assert.equal(snapshot.documents.privacy.sections[0]?.title, 'privacy fallback')
  assert.equal(snapshot.footerContent.privacy[0]?.title, 'privacy fallback')
})

test('draft and stale-pointer candidates can never reach a public snapshot', async () => {
  const snapshot = await resolvePublishedLegalContentSnapshot(
    storeReturning([
      makeCandidate({
        status: 'draft',
        contentByLocale: {
          en: {
            sections: [{ title: 'Draft must stay private' }],
            effectiveDate: '2026-09-01',
            version: 'draft',
          },
        },
      }),
      makeCandidate({
        currentPublishedRevisionId: 'another-revision',
        contentByLocale: {
          en: {
            sections: [{ title: 'Stale pointer must stay private' }],
            effectiveDate: '2026-09-01',
            version: 'stale',
          },
        },
      }),
    ]),
    makeFallback(),
  )

  assert.equal(snapshot.documents.privacy.sections[0]?.title, 'privacy fallback')
  assert.equal(snapshot.documents.privacy.version, 'fallback')
})

test('malformed or locale-missing live content falls back without mixing revisions', async () => {
  const snapshot = await resolvePublishedLegalContentSnapshot(
    storeReturning([
      makeCandidate({
        contentByLocale: {
          cn_s: {
            sections: [{ title: 'Incomplete locale' }],
          },
        },
      }),
    ]),
    makeFallback(),
  )

  assert.equal(snapshot.documents.privacy.sections[0]?.title, 'privacy fallback')
  assert.equal(snapshot.footerEffectiveDates.privacy, 'January 1, 2026')
})
