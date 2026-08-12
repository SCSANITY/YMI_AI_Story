'use client'

import { RotateCcw } from 'lucide-react'
import { useRef, useState } from 'react'
import type { LegalDocumentState } from '@/lib/legal-publishing'
import { AdminNotice, AdminStatusBadge } from '@/components/admin/AdminUi'
import {
  ADMIN_SECONDARY_BUTTON_CLASS,
  formatAdminTimestamp,
  shortAdminId,
} from './legalUi'

type Props = {
  state: LegalDocumentState
  onCommitted: (state: LegalDocumentState) => void
}

export function LegalRevisionHistory({ state, onCommitted }: Props) {
  const [confirmRevisionId, setConfirmRevisionId] = useState<string | null>(null)
  const [pendingRevisionId, setPendingRevisionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestIntentRef = useRef(0)

  const rollback = async (sourceRevisionId: string) => {
    const currentRevisionId = state.document.currentPublishedRevisionId
    if (!currentRevisionId || pendingRevisionId) return

    const requestIntent = ++requestIntentRef.current
    setPendingRevisionId(sourceRevisionId)
    setError(null)
    try {
      const response = await fetch(
        `/api/admin/legal-documents/${state.document.documentKey}/rollback`,
        {
          method: 'POST',
          cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sourceRevisionId,
            expectedCurrentPublishedRevisionId: currentRevisionId,
          }),
        },
      )
      const data = await response.json().catch(() => null)
      if (requestIntentRef.current !== requestIntent) return
      if (!response.ok || !data?.document) {
        throw new Error(data?.error || 'Rollback failed')
      }
      setConfirmRevisionId(null)
      onCommitted(data.document as LegalDocumentState)
    } catch (rollbackError) {
      if (requestIntentRef.current !== requestIntent) return
      setError(
        rollbackError instanceof Error ? rollbackError.message : 'Rollback failed',
      )
    } finally {
      if (requestIntentRef.current === requestIntent) setPendingRevisionId(null)
    }
  }

  return (
    <aside className="admin-v2-panel min-w-0 p-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-page-muted)]">
          Revision History
        </p>
        <p className="mt-1 text-xs leading-5 text-[var(--admin-page-muted)]">
          Rollback republishes a prior snapshot as a new revision. History is never edited.
        </p>
      </div>

      {error ? (
        <AdminNotice tone="danger" role="alert" className="mt-3 text-xs">
          {error}
        </AdminNotice>
      ) : null}

      <div className="mt-4 space-y-2">
        {state.publishedHistory.map((revision) => {
          const isLive = revision.revisionId === state.document.currentPublishedRevisionId
          const isConfirming = confirmRevisionId === revision.revisionId
          const isPending = pendingRevisionId === revision.revisionId
          return (
            <article
              key={revision.revisionId}
              className="rounded-lg border border-slate-200 bg-white/60 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[var(--admin-page-ink)]">
                    Revision {revision.revisionNumber}
                  </p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wide text-[var(--admin-page-muted)]">
                    {revision.content.en.version}
                  </p>
                </div>
                {isLive ? (
                  <AdminStatusBadge tone="success" className="text-[9px] uppercase tracking-wide">
                    Live
                  </AdminStatusBadge>
                ) : null}
              </div>
              <dl className="mt-3 space-y-1 text-[11px] text-[var(--admin-page-muted)]">
                <div className="flex justify-between gap-3">
                  <dt>Published</dt>
                  <dd className="text-right text-[var(--admin-page-ink)]">
                    {formatAdminTimestamp(revision.publishedAt)}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>Admin</dt>
                  <dd className="font-mono text-[var(--admin-page-ink)]">
                    {shortAdminId(revision.publishedByCustomerId)}
                  </dd>
                </div>
              </dl>

              {!isLive && !isConfirming ? (
                <button
                  type="button"
                  className={`${ADMIN_SECONDARY_BUTTON_CLASS} mt-3 w-full`}
                  onClick={() => {
                    setError(null)
                    setConfirmRevisionId(revision.revisionId)
                  }}
                  disabled={Boolean(pendingRevisionId)}
                >
                  <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                  Restore this version
                </button>
              ) : null}

              {isConfirming ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                  <p className="text-[11px] leading-4 text-amber-900">
                    Publish this snapshot as the next live revision?
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => void rollback(revision.revisionId)}
                      disabled={Boolean(pendingRevisionId)}
                      className="admin-v2-button admin-v2-button--primary min-h-8 flex-1 px-2 text-[11px]"
                    >
                      {isPending ? 'Restoring...' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRevisionId(null)}
                      disabled={Boolean(pendingRevisionId)}
                      className={ADMIN_SECONDARY_BUTTON_CLASS}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          )
        })}
      </div>
    </aside>
  )
}
