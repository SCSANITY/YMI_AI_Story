import type { CanonicalLegalDocumentKey } from '@/lib/legal-documents'

export const LEGAL_DOCUMENT_LABELS: Record<
  CanonicalLegalDocumentKey,
  { title: string; shortTitle: string }
> = {
  privacy: { title: 'Privacy Policy', shortTitle: 'Privacy' },
  terms: { title: 'Terms and Conditions', shortTitle: 'Terms' },
  shipping: { title: 'Shipping Policy', shortTitle: 'Shipping' },
  refund: { title: 'Refund Policy', shortTitle: 'Refunds' },
}

export const ADMIN_FIELD_CLASS =
  'w-full rounded-md border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-slate-600 focus:border-amber-300/70 focus:ring-2 focus:ring-amber-300/15'

export const ADMIN_SECONDARY_BUTTON_CLASS =
  'inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.05] px-3 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-40'

export function formatAdminTimestamp(value: string | null | undefined) {
  if (!value) return 'Not recorded'
  const date = new Date(value)
  if (Number.isNaN(date.valueOf())) return 'Not recorded'
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function shortAdminId(value: string | null | undefined) {
  return value ? value.slice(0, 8).toUpperCase() : 'SYSTEM'
}
