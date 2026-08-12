import { CheckCircle2, FileClock } from 'lucide-react'
import type { CanonicalLegalDocumentKey } from '@/lib/legal-documents'
import type { LegalDocumentSummary } from '@/lib/legal-publishing'
import { LEGAL_DOCUMENT_LABELS } from './legalUi'

type Props = {
  documents: LegalDocumentSummary[]
  selectedKey: CanonicalLegalDocumentKey | null
  onSelect: (key: CanonicalLegalDocumentKey) => void
}

export function LegalDocumentPicker({ documents, selectedKey, onSelect }: Props) {
  return (
    <aside
      aria-label="Legal documents"
      className="admin-v2-panel min-w-0 p-3"
    >
      <p className="px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--admin-page-muted)]">
        Documents
      </p>
      <div className="mt-3 space-y-1.5">
        {documents.map((document) => {
          const selected = document.documentKey === selectedKey
          const label = LEGAL_DOCUMENT_LABELS[document.documentKey]
          return (
            <button
              key={document.documentId}
              type="button"
              onClick={() => onSelect(document.documentKey)}
              aria-pressed={selected}
              className={`w-full rounded-lg border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 ${
                selected
                  ? 'border-amber-300 bg-amber-50'
                  : 'border-transparent hover:border-slate-200 hover:bg-white/70'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-semibold text-[var(--admin-page-ink)]">
                  {label.shortTitle}
                </span>
                {document.currentPublishedRevisionId ? (
                  <CheckCircle2 aria-label="Published" className="h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <FileClock aria-label="Not initialized" className="h-4 w-4 shrink-0 text-slate-400" />
                )}
              </span>
              <span className="mt-1 block text-[11px] text-[var(--admin-page-muted)]">
                {document.currentRevisionNumber
                  ? `Live revision ${document.currentRevisionNumber}`
                  : 'Needs initialization'}
                {document.draftRevisionId ? ' · Draft saved' : ''}
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
