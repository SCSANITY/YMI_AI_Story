import type { AdminStatusTone } from '@/components/admin/AdminUi'
import {
  getKolStatusLabel,
  type KolPartnershipStatus,
} from '@/lib/kol-partnerships'

export function kolStatusTone(status: KolPartnershipStatus): AdminStatusTone {
  if (status === 'new') return 'warning'
  if (status === 'reviewing') return 'info'
  if (status === 'contacting') return 'inverse'
  if (status === 'partnered') return 'success'
  if (status === 'declined') return 'danger'
  return 'neutral'
}

export { getKolStatusLabel }

export function formatKolDate(value: string | null, includeTime = true) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('en-US',
    includeTime
      ? { dateStyle: 'medium', timeStyle: 'short' }
      : { dateStyle: 'medium' }
  ).format(date)
}

export function formatAudience(value: number | null) {
  if (value == null) return '-'
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}
