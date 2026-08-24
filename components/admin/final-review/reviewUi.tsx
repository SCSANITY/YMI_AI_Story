import { Download, ExternalLink } from 'lucide-react'
import type { FinalJobPageRow } from '@/lib/finalReview'

export function statusClass(status: string) {
  switch (status) {
    case 'completed':
    case 'released':
    case 'approved':
      return 'border-[rgba(79,157,107,0.34)] bg-[rgba(79,157,107,0.14)] text-[#3f8f5c]'
    case 'review_pending':
    case 'pending_review':
    case 'queued':
      return 'border-[rgba(92,124,156,0.32)] bg-[rgba(92,124,156,0.13)] text-[#5c7c9c]'
    case 'needs_fix':
      return 'border-[rgba(207,154,52,0.36)] bg-[rgba(207,154,52,0.15)] text-[#b98526]'
    case 'rerunning':
    case 'processing':
      return 'border-[rgba(140,110,180,0.32)] bg-[rgba(140,110,180,0.13)] text-[#8069a8]'
    case 'failed':
      return 'border-[rgba(201,96,75,0.34)] bg-[rgba(201,96,75,0.14)] text-[#c0604b]'
    default:
      return 'border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] text-[var(--admin-muted)]'
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

export function isEmptyFinalPageSlot(page: FinalJobPageRow) {
  return !page.has_ai_output && !page.has_manual_output && !page.has_approved_output
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
          className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] text-[var(--admin-ink)] hover:bg-[color-mix(in_srgb,var(--admin-ink)_8%,transparent)] lg:h-9 lg:w-9 ${
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
          className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] text-[var(--admin-ink)] hover:bg-[color-mix(in_srgb,var(--admin-ink)_8%,transparent)] lg:h-9 lg:w-9 ${
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
        className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] px-3 py-2 text-xs font-bold text-[var(--admin-ink)] hover:bg-[color-mix(in_srgb,var(--admin-ink)_7%,transparent)] ${
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
        className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] px-3 py-2 text-xs font-bold text-[var(--admin-ink)] hover:bg-[color-mix(in_srgb,var(--admin-ink)_7%,transparent)] ${
          url ? '' : 'pointer-events-none opacity-50'
        }`}
      >
        <Download className="h-3.5 w-3.5" />
        Download
      </a>
    </div>
  )
}
