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
      className="min-w-0 rounded-lg border border-white/10 bg-slate-950/55 p-3"
    >
      <p className="px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
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
              className={`w-full rounded-md border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${
                selected
                  ? 'border-amber-300/50 bg-amber-300/10'
                  : 'border-transparent hover:border-white/10 hover:bg-white/[0.05]'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-semibold text-white">
                  {label.shortTitle}
                </span>
                {document.currentPublishedRevisionId ? (
                  <CheckCircle2 aria-label="Published" className="h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <FileClock aria-label="Not initialized" className="h-4 w-4 shrink-0 text-slate-500" />
                )}
              </span>
              <span className="mt-1 block text-[11px] text-slate-500">
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
