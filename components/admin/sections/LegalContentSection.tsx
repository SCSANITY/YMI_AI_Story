'use client'

import { DatabaseZap, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { CanonicalLegalDocumentKey } from '@/lib/legal-documents'
import type {
  LegalDocumentState,
  LegalDocumentSummary,
} from '@/lib/legal-publishing'
import { LegalDocumentEditor } from '@/components/admin/legal/LegalDocumentEditor'
import { LegalDocumentPicker } from '@/components/admin/legal/LegalDocumentPicker'
import { LegalRevisionHistory } from '@/components/admin/legal/LegalRevisionHistory'
import { ADMIN_SECONDARY_BUTTON_CLASS } from '@/components/admin/legal/legalUi'

function updateSummary(
  documents: LegalDocumentSummary[],
  state: LegalDocumentState,
) {
  return documents.map((document) =>
    document.documentKey === state.document.documentKey
      ? state.document
      : document,
  )
}

export function LegalContentSection() {
  const [documents, setDocuments] = useState<LegalDocumentSummary[]>([])
  const [selectedKey, setSelectedKey] = useState<CanonicalLegalDocumentKey | null>(null)
  const [detail, setDetail] = useState<LegalDocumentState | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [bootstrapPending, setBootstrapPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRequestIntentRef = useRef(0)
  const detailRequestIntentRef = useRef(0)
  const detailAbortControllerRef = useRef<AbortController | null>(null)

  const loadDocuments = useCallback(async () => {
    const requestIntent = ++listRequestIntentRef.current
    setListLoading(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/legal-documents', {
        cache: 'no-store',
      })
      const data = await response.json().catch(() => null)
      if (listRequestIntentRef.current !== requestIntent) return
      if (!response.ok || !Array.isArray(data?.documents)) {
        throw new Error(data?.error || 'Failed to load legal documents')
      }

      const nextDocuments = data.documents as LegalDocumentSummary[]
      setDocuments(nextDocuments)
      setSelectedKey((current) => {
        if (current && nextDocuments.some((item) => item.documentKey === current)) {
          return current
        }
        return nextDocuments.find((item) => item.documentKey === 'privacy')?.documentKey
          ?? nextDocuments[0]?.documentKey
          ?? null
      })
    } catch (loadError) {
      if (listRequestIntentRef.current !== requestIntent) return
      setError(loadError instanceof Error ? loadError.message : 'Failed to load legal documents')
    } finally {
      if (listRequestIntentRef.current === requestIntent) setListLoading(false)
    }
  }, [])

  const loadDetail = useCallback(async (documentKey: CanonicalLegalDocumentKey) => {
    const requestIntent = ++detailRequestIntentRef.current
    detailAbortControllerRef.current?.abort()
    const controller = new AbortController()
    detailAbortControllerRef.current = controller
    setDetailLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/admin/legal-documents/${documentKey}`, {
        cache: 'no-store',
        signal: controller.signal,
      })
      const data = await response.json().catch(() => null)
      if (
        controller.signal.aborted ||
        detailRequestIntentRef.current !== requestIntent
      ) {
        return
      }
      if (!response.ok || !data?.document) {
        throw new Error(data?.error || 'Failed to load legal document')
      }
      setDetail(data.document as LegalDocumentState)
    } catch (loadError) {
      if (
        controller.signal.aborted ||
        detailRequestIntentRef.current !== requestIntent
      ) {
        return
      }
      setDetail(null)
      setError(loadError instanceof Error ? loadError.message : 'Failed to load legal document')
    } finally {
      if (detailRequestIntentRef.current === requestIntent) setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDocuments()
    return () => {
      listRequestIntentRef.current += 1
      detailRequestIntentRef.current += 1
      detailAbortControllerRef.current?.abort()
    }
  }, [loadDocuments])

  useEffect(() => {
    const summary = documents.find((item) => item.documentKey === selectedKey)
    if (!selectedKey || !summary?.currentPublishedRevisionId) {
      setDetail(null)
      return
    }
    void loadDetail(selectedKey)
  }, [documents, loadDetail, selectedKey])

  const bootstrap = async () => {
    if (bootstrapPending) return
    setBootstrapPending(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/legal-documents', {
        method: 'POST',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !Array.isArray(data?.documents)) {
        throw new Error(data?.error || 'Failed to initialize legal content')
      }
      const nextDocuments = data.documents as LegalDocumentSummary[]
      setDocuments(nextDocuments)
      const nextKey = selectedKey ?? 'privacy'
      setSelectedKey(nextKey)
      await loadDetail(nextKey)
    } catch (bootstrapError) {
      setError(
        bootstrapError instanceof Error
          ? bootstrapError.message
          : 'Failed to initialize legal content',
      )
    } finally {
      setBootstrapPending(false)
    }
  }

  const handleCommitted = (state: LegalDocumentState) => {
    setDetail(state)
    setDocuments((current) => updateSummary(current, state))
  }

  const needsBootstrap =
    documents.length > 0 &&
    documents.some((document) => !document.currentPublishedRevisionId)

  if (listLoading) {
    return (
      <div role="status" className="rounded-lg border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-slate-400">
        Loading legal publishing workspace...
      </div>
    )
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-amber-300/20 bg-amber-300/[0.06] p-4 text-xs text-amber-100 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-3xl leading-5">
          Drafts and immutable revisions are managed here. Customer-facing legal
          surfaces read only the current published revision, with the code-owned
          policies retained as an emergency fallback.
        </p>
        <button
          type="button"
          onClick={() => void loadDocuments()}
          disabled={listLoading}
          className={ADMIN_SECONDARY_BUTTON_CLASS}
        >
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {error ? (
        <p role="alert" className="rounded-md border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </p>
      ) : null}

      {needsBootstrap ? (
        <section className="rounded-lg border border-white/10 bg-slate-950/55 p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-amber-300/15 text-amber-200">
            <DatabaseZap aria-hidden="true" className="h-5 w-5" />
          </div>
          <h2 className="mt-4 text-lg font-bold text-white">Initialize legal publishing</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Create the first immutable database revisions from the current live English
            policies. Public legal surfaces will continue showing the same text through
            the published-content store after initialization.
          </p>
          <button
            type="button"
            onClick={() => void bootstrap()}
            disabled={bootstrapPending}
            className="mt-5 inline-flex min-h-10 items-center justify-center rounded-md bg-amber-300 px-4 text-xs font-black text-slate-950 disabled:opacity-50"
          >
            {bootstrapPending ? 'Initializing...' : 'Initialize from live policies'}
          </button>
        </section>
      ) : null}

      {documents.length === 0 && !error ? (
        <p className="rounded-lg border border-white/10 bg-white/[0.03] p-6 text-sm text-slate-400">
          No legal documents are available. Apply the S4 SQL foundation first.
        </p>
      ) : null}

      {documents.length > 0 && !needsBootstrap ? (
        <div className="grid min-w-0 gap-4 xl:grid-cols-[14rem_minmax(0,1fr)_18rem] xl:items-start">
          <div className="xl:sticky xl:top-0">
            <LegalDocumentPicker
              documents={documents}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
            />
          </div>

          <div className="min-w-0">
            {detailLoading || !detail || detail.document.documentKey !== selectedKey ? (
              <div role="status" className="rounded-lg border border-white/10 bg-white/[0.03] p-8 text-center text-sm text-slate-400">
                Loading document revision...
              </div>
            ) : (
              <LegalDocumentEditor
                key={[
                  detail.document.documentKey,
                  detail.document.currentPublishedRevisionId,
                  detail.document.draftRevisionId ?? 'live',
                  detail.document.draftVersion ?? 0,
                ].join(':')}
                state={detail}
                onCommitted={handleCommitted}
                onReload={() => void loadDetail(detail.document.documentKey)}
              />
            )}
          </div>

          <div className="min-w-0 xl:sticky xl:top-0">
            {detail && detail.document.documentKey === selectedKey ? (
              <LegalRevisionHistory state={detail} onCommitted={handleCommitted} />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
