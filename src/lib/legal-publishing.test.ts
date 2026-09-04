import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getCanonicalLegalDocumentEffectiveDateIso,
  getCanonicalLegalDocuments,
} from './legal-documents'
import {
  LegalPublishingConflictError,
  LegalPublishingValidationError,
  getLegalPublishReadiness,
  normalizeLegalRevisionContent,
  publishLegalDraft,
  rollbackLegalRevision,
  saveLegalDraft,
  type LegalDocumentState,
  type LegalPublishingStore,
  type LegalRevision,
  type LegalRevisionContent,
} from './legal-publishing'

test('all code-owned canonical policies are valid bootstrap content', () => {
  for (const document of getCanonicalLegalDocuments()) {
    const content = normalizeLegalRevisionContent({
      en: {
        sections: document.sections,
        effectiveDate: getCanonicalLegalDocumentEffectiveDateIso(document),
        version: document.version,
      },
    })

    assert.equal(content.en.version, document.version)
    assert.ok(content.en.sections.length > 0)
  }
})

const contentA: LegalRevisionContent = {
  en: {
    effectiveDate: '2026-07-28',
    version: '2026-07-28',
    sections: [{ title: 'Privacy', paragraphs: [{ text: 'First published text.' }] }],
  },
}

const contentB: LegalRevisionContent = {
  en: {
    effectiveDate: '2026-08-01',
    version: '2026-08-01',
    sections: [{ title: 'Privacy', paragraphs: [{ text: 'Updated draft text.' }] }],
  },
}

function revision(
  revisionId: string,
  revisionNumber: number,
  status: LegalRevision['status'],
  content: LegalRevisionContent,
  options: Partial<LegalRevision> = {},
): LegalRevision {
  return {
    revisionId,
    documentId: 'document-privacy',
    revisionNumber,
    status,
    content,
    draftVersion: status === 'draft' ? 1 : 0,
    basePublishedRevisionId: null,
    sourceRevisionId: null,
    createdByCustomerId: 'admin-a',
    createdAt: '2026-07-28T00:00:00.000Z',
    updatedByCustomerId: 'admin-a',
    updatedAt: '2026-07-28T00:00:00.000Z',
    publishedByCustomerId: status === 'published' ? 'admin-a' : null,
    publishedAt: status === 'published' ? '2026-07-28T00:00:00.000Z' : null,
    ...options,
  }
}

class MemoryLegalPublishingStore implements LegalPublishingStore {
  state: LegalDocumentState

  constructor() {
    const published = revision('published-1', 1, 'published', contentA)
    this.state = {
      document: {
        documentId: 'document-privacy',
        documentKey: 'privacy',
        currentPublishedRevisionId: published.revisionId,
        currentRevisionNumber: published.revisionNumber,
        draftRevisionId: null,
        draftVersion: null,
        updatedAt: published.updatedAt,
      },
      currentPublished: published,
      draft: null,
      publishedHistory: [published],
    }
  }

  async loadDocument() {
    return structuredClone(this.state)
  }

  async saveDraft(command: Parameters<LegalPublishingStore['saveDraft']>[0]) {
    if (this.state.document.currentPublishedRevisionId !== command.basePublishedRevisionId) {
      throw new LegalPublishingConflictError('Live revision conflict')
    }

    if (this.state.draft) {
      if (
        this.state.draft.revisionId !== command.expectedDraftRevisionId ||
        this.state.draft.draftVersion !== command.expectedDraftVersion
      ) {
        throw new LegalPublishingConflictError('Draft conflict')
      }
      this.state.draft = {
        ...this.state.draft,
        content: structuredClone(command.content),
        draftVersion: this.state.draft.draftVersion + 1,
      }
    } else {
      if (command.expectedDraftRevisionId || command.expectedDraftVersion !== null) {
        throw new LegalPublishingConflictError('Draft conflict')
      }
      this.state.draft = revision('draft-2', 2, 'draft', command.content, {
        basePublishedRevisionId: command.basePublishedRevisionId,
      })
    }

    this.syncSummary()
    return structuredClone(this.state)
  }

  async publishDraft(command: Parameters<LegalPublishingStore['publishDraft']>[0]) {
    if (
      this.state.document.currentPublishedRevisionId !== command.basePublishedRevisionId ||
      this.state.draft?.revisionId !== command.draftRevisionId ||
      this.state.draft.draftVersion !== command.expectedDraftVersion
    ) {
      throw new LegalPublishingConflictError('Publish conflict')
    }

    const previousHistory = structuredClone(this.state.publishedHistory)
    const draft = this.state.draft
    const published = revision('published-3', 3, 'published', draft.content, {
      basePublishedRevisionId: command.basePublishedRevisionId,
      sourceRevisionId: draft.revisionId,
    })
    this.state.currentPublished = published
    this.state.publishedHistory = [published, ...previousHistory]
    this.state.draft = null
    this.syncSummary()
    return structuredClone(this.state)
  }

  async rollback(command: Parameters<LegalPublishingStore['rollback']>[0]) {
    if (
      this.state.document.currentPublishedRevisionId !==
      command.expectedCurrentPublishedRevisionId
    ) {
      throw new LegalPublishingConflictError('Rollback conflict')
    }
    const source = this.state.publishedHistory.find(
      (item) => item.revisionId === command.sourceRevisionId,
    )
    if (!source) throw new LegalPublishingValidationError('Missing source')

    const previousHistory = structuredClone(this.state.publishedHistory)
    const nextNumber = Math.max(...previousHistory.map((item) => item.revisionNumber)) + 1
    const republished = revision(
      `published-${nextNumber}`,
      nextNumber,
      'published',
      structuredClone(source.content),
      {
        basePublishedRevisionId: command.expectedCurrentPublishedRevisionId,
        sourceRevisionId: source.revisionId,
      },
    )
    this.state.currentPublished = republished
    this.state.publishedHistory = [republished, ...previousHistory]
    this.state.draft = null
    this.syncSummary()
    return structuredClone(this.state)
  }

  private syncSummary() {
    this.state.document.currentPublishedRevisionId =
      this.state.currentPublished?.revisionId ?? null
    this.state.document.currentRevisionNumber =
      this.state.currentPublished?.revisionNumber ?? null
    this.state.document.draftRevisionId = this.state.draft?.revisionId ?? null
    this.state.document.draftVersion = this.state.draft?.draftVersion ?? null
  }
}

test('normalizes structured legal content and rejects executable HTML or unsafe links', () => {
  const normalized = normalizeLegalRevisionContent({
    en: {
      effectiveDate: '2026-07-28',
      version: '2026-07-28',
      sections: [
        {
          title: ' Privacy ',
          paragraphs: [
            {
              text: ' Policy text ',
              href: 'https://policies.google.com/privacy',
              ignored: 'removed',
            },
          ],
          ignored: true,
        },
      ],
      ignored: true,
    },
    fr: { sections: [] },
  })

  assert.deepEqual(normalized, {
    en: {
      effectiveDate: '2026-07-28',
      version: '2026-07-28',
      sections: [
        {
          title: 'Privacy',
          paragraphs: [
            {
              text: 'Policy text',
              href: 'https://policies.google.com/privacy',
            },
          ],
        },
      ],
    },
  })
  assert.throws(
    () =>
      normalizeLegalRevisionContent({
        en: {
          effectiveDate: '2026-07-28',
          version: 'v1',
          sections: [{ paragraphs: [{ text: '<script>alert(1)</script>' }] }],
        },
      }),
    LegalPublishingValidationError,
  )
})

test('draft saves never change the published pointer or published content', async () => {
  const store = new MemoryLegalPublishingStore()
  const originalPublished = structuredClone(store.state.currentPublished)

  const state = await saveLegalDraft(
    {
      documentKey: 'privacy',
      content: contentB,
      expectedDraftRevisionId: null,
      expectedDraftVersion: null,
      basePublishedRevisionId: 'published-1',
      actorCustomerId: 'admin-a',
    },
    store,
  )

  assert.equal(state.document.currentPublishedRevisionId, 'published-1')
  assert.deepEqual(state.currentPublished, originalPublished)
  assert.deepEqual(state.draft?.content, contentB)
})

test('publish readiness and optimistic checks reject stale drafts', async () => {
  const store = new MemoryLegalPublishingStore()
  await saveLegalDraft(
    {
      documentKey: 'privacy',
      content: contentB,
      expectedDraftRevisionId: null,
      expectedDraftVersion: null,
      basePublishedRevisionId: 'published-1',
      actorCustomerId: 'admin-a',
    },
    store,
  )

  assert.deepEqual(getLegalPublishReadiness(store.state), { ready: true, reason: null })
  await assert.rejects(
    publishLegalDraft(
      {
        documentKey: 'privacy',
        draftRevisionId: 'draft-2',
        expectedDraftVersion: 1,
        basePublishedRevisionId: 'stale-published',
        actorCustomerId: 'admin-a',
      },
      store,
    ),
    LegalPublishingConflictError,
  )
})

test('publishing creates a new immutable history entry and one current pointer', async () => {
  const store = new MemoryLegalPublishingStore()
  const firstPublished = structuredClone(store.state.currentPublished)
  await saveLegalDraft(
    {
      documentKey: 'privacy',
      content: contentB,
      expectedDraftRevisionId: null,
      expectedDraftVersion: null,
      basePublishedRevisionId: 'published-1',
      actorCustomerId: 'admin-a',
    },
    store,
  )

  const state = await publishLegalDraft(
    {
      documentKey: 'privacy',
      draftRevisionId: 'draft-2',
      expectedDraftVersion: 1,
      basePublishedRevisionId: 'published-1',
      actorCustomerId: 'admin-a',
    },
    store,
  )

  assert.equal(state.document.currentPublishedRevisionId, 'published-3')
  assert.equal(
    state.publishedHistory.filter(
      (item) => item.revisionId === state.document.currentPublishedRevisionId,
    ).length,
    1,
  )
  assert.deepEqual(state.publishedHistory[1], firstPublished)
  assert.equal(state.draft, null)
})

test('rollback republishes prior content without mutating history', async () => {
  const store = new MemoryLegalPublishingStore()
  await saveLegalDraft(
    {
      documentKey: 'privacy',
      content: contentB,
      expectedDraftRevisionId: null,
      expectedDraftVersion: null,
      basePublishedRevisionId: 'published-1',
      actorCustomerId: 'admin-a',
    },
    store,
  )
  await publishLegalDraft(
    {
      documentKey: 'privacy',
      draftRevisionId: 'draft-2',
      expectedDraftVersion: 1,
      basePublishedRevisionId: 'published-1',
      actorCustomerId: 'admin-a',
    },
    store,
  )
  const historyBeforeRollback = structuredClone(store.state.publishedHistory)

  const state = await rollbackLegalRevision(
    {
      documentKey: 'privacy',
      sourceRevisionId: 'published-1',
      expectedCurrentPublishedRevisionId: 'published-3',
      actorCustomerId: 'admin-a',
    },
    store,
  )

  assert.equal(state.currentPublished?.sourceRevisionId, 'published-1')
  assert.deepEqual(state.currentPublished?.content, contentA)
  assert.deepEqual(state.publishedHistory.slice(1), historyBeforeRollback)
  assert.equal(state.publishedHistory.length, historyBeforeRollback.length + 1)
})
