import { Download, ExternalLink } from 'lucide-react'
import type { FinalJobPageRow } from '@/lib/finalReview'

export function statusClass(status: string) {
  switch (status) {
    case 'completed':
    case 'released':
    case 'approved':
      return 'bg-emerald-500/15 text-emerald-200 border-emerald-400/25'
    case 'review_pending':
    case 'pending_review':
    case 'queued':
      return 'bg-sky-500/15 text-sky-200 border-sky-400/25'
    case 'needs_fix':
      return 'bg-amber-500/15 text-amber-200 border-amber-400/25'
    case 'rerunning':
    case 'processing':
      return 'bg-violet-500/15 text-violet-200 border-violet-400/25'
    case 'failed':
      return 'bg-rose-500/15 text-rose-200 border-rose-400/25'
    default:
      return 'bg-white/10 text-slate-200 border-white/15'
  }
}

export function formatDate(value: string | null | undefined) {
  if (!value) return 'Not set'
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export function pageNumberLabel(index: number) {
  return String(index + 1).padStart(2, '0')
}

export function pagePreviewUrl(page: FinalJobPageRow) {
  return page.approved_url || page.manual_url || page.ai_url || null
}

export function PageFileLinks({
  url,
  pageNumber,
  compact = false,
}: {
  url: string | null
  pageNumber: number
  compact?: boolean
}) {
  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        <a
          href={url ?? undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!url}
          title="View full"
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] text-slate-100 hover:bg-white/[0.12] ${
            url ? '' : 'pointer-events-none opacity-50'
          }`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <a
          href={url ?? undefined}
          download={`final-page-${String(pageNumber).padStart(2, '0')}.png`}
          aria-disabled={!url}
          title="Download"
          className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.07] text-slate-100 hover:bg-white/[0.12] ${
            url ? '' : 'pointer-events-none opacity-50'
          }`}
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <a
        href={url ?? undefined}
        target="_blank"
        rel="noreferrer"
        aria-disabled={!url}
        className={`inline-flex items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-bold text-slate-100 hover:bg-white/[0.1] ${
          url ? '' : 'pointer-events-none opacity-50'
        }`}
      >
        <ExternalLink className="h-3.5 w-3.5" />
        View full
      </a>
      <a
        href={url ?? undefined}
        download={`final-page-${String(pageNumber).padStart(2, '0')}.png`}
        aria-disabled={!url}
        className={`inline-flex items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs font-bold text-slate-100 hover:bg-white/[0.1] ${
          url ? '' : 'pointer-events-none opacity-50'
        }`}
      >
        <Download className="h-3.5 w-3.5" />
        Download
      </a>
    </div>
  )
}
