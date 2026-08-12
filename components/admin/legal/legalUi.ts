import type { CanonicalLegalDocumentKey } from '@/lib/legal-documents'
import { adminFieldClass } from '@/components/admin/AdminUi'

export const LEGAL_DOCUMENT_LABELS: Record<
  CanonicalLegalDocumentKey,
  { title: string; shortTitle: string }
> = {
  privacy: { title: 'Privacy Policy', shortTitle: 'Privacy' },
  terms: { title: 'Terms and Conditions', shortTitle: 'Terms' },
  shipping: { title: 'Shipping Policy', shortTitle: 'Shipping' },
  refund: { title: 'Refund Policy', shortTitle: 'Refunds' },
}

export const ADMIN_FIELD_CLASS = adminFieldClass

export const ADMIN_SECONDARY_BUTTON_CLASS =
  'admin-v2-button admin-v2-button--secondary min-h-9 px-3 text-xs'

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
