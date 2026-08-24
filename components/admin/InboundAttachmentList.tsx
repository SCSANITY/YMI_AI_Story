'use client'

import { useState } from 'react'
import { CircleAlert, Download, File, LoaderCircle, ShieldAlert } from 'lucide-react'
import type { InboundEmailAttachmentRow } from '@/lib/inbound-email-attachment-types'

function formatBytes(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '-'
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

function reasonLabel(value: string | null) {
  if (!value) return 'No additional detail is available.'
  return value.replace(/[_:]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function InboundAttachmentList({
  attachments,
  envelopeError = null,
}: {
  attachments: InboundEmailAttachmentRow[]
  envelopeError?: string | null
}) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState('')

  const download = async (attachment: InboundEmailAttachmentRow) => {
    if (attachment.status !== 'stored' || downloadingId) return
    setDownloadingId(attachment.attachment_id)
    setDownloadError('')
    try {
      const response = await fetch(
        `/api/admin/inbox/attachments/${attachment.attachment_id}/download`,
        { credentials: 'include', cache: 'no-store' }
      )
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to download attachment')
      }
      const file = await response.blob()
      const objectUrl = URL.createObjectURL(file)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = attachment.safe_filename
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Attachment download failed')
    } finally {
      setDownloadingId(null)
    }
  }

  if (attachments.length === 0 && !envelopeError) return null

  return (
    <section className="space-y-2" aria-label="Email attachments">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--admin-page-muted)]">
        <File className="h-3.5 w-3.5" /> Attachments
      </div>
      {envelopeError ? (
        <div className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--admin-crit)_38%,transparent)] bg-[color-mix(in_srgb,var(--admin-crit)_10%,var(--admin-card))] p-3 text-xs leading-5 text-[color-mix(in_srgb,var(--admin-crit)_78%,var(--admin-ink))]">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{reasonLabel(envelopeError)}</span>
        </div>
      ) : null}
      <div className="space-y-2">
        {attachments.map((attachment) => {
          const available = attachment.status === 'stored'
          const rejected = attachment.status === 'rejected'
          return (
            <div
              key={attachment.attachment_id}
              className="flex flex-col gap-3 rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] p-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-[var(--admin-page-ink)]">
                  {attachment.safe_filename}
                </p>
                <p className="mt-1 text-[10px] text-[var(--admin-page-muted)]">
                  {attachment.declared_content_type || 'Unknown type'} /{' '}
                  {formatBytes(attachment.stored_size_bytes ?? attachment.declared_size_bytes)}
                </p>
                {!available ? (
                  <p className={`mt-1.5 flex items-start gap-1 text-[10px] font-semibold ${rejected ? 'text-[var(--admin-warn)]' : 'text-[var(--admin-crit)]'}`}>
                    <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
                    {attachment.status}: {reasonLabel(attachment.rejection_reason)}
                  </p>
                ) : null}
              </div>
              {available ? (
                <button
                  type="button"
                  onClick={() => void download(attachment)}
                  disabled={downloadingId !== null}
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-card)] px-3 text-xs font-bold text-[var(--admin-ink-soft)] transition hover:border-[var(--admin-accent-dp)] hover:bg-[var(--admin-panel-2)] hover:text-[var(--admin-ink)] disabled:opacity-50 lg:h-9"
                >
                  {downloadingId === attachment.attachment_id ? (
                    <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  Download
                </button>
              ) : null}
            </div>
          )
        })}
      </div>
      {downloadError ? <p role="alert" className="text-xs text-[var(--admin-crit)]">{downloadError}</p> : null}
    </section>
  )
}
