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
      const data = await response.json().catch(() => ({}))
      if (!response.ok || typeof data?.url !== 'string') {
        throw new Error(data?.error || 'Failed to prepare attachment download')
      }
      const link = document.createElement('a')
      link.href = data.url
      link.download = attachment.safe_filename
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Attachment download failed')
    } finally {
      setDownloadingId(null)
    }
  }

  if (attachments.length === 0 && !envelopeError) return null

  return (
    <section className="space-y-2" aria-label="Email attachments">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        <File className="h-3.5 w-3.5" /> Attachments
      </div>
      {envelopeError ? (
        <div className="flex items-start gap-2 rounded-xl border border-rose-300/15 bg-rose-300/[0.06] p-3 text-xs leading-5 text-rose-200">
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
              className="flex flex-col gap-3 rounded-xl border border-white/[0.08] bg-slate-950/45 p-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-slate-100">
                  {attachment.safe_filename}
                </p>
                <p className="mt-1 text-[10px] text-slate-500">
                  {attachment.declared_content_type || 'Unknown type'} ·{' '}
                  {formatBytes(attachment.stored_size_bytes ?? attachment.declared_size_bytes)}
                </p>
                {!available ? (
                  <p className={`mt-1.5 flex items-start gap-1 text-[10px] ${rejected ? 'text-amber-200/80' : 'text-rose-300'}`}>
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
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-sky-300/20 bg-sky-300/[0.08] px-3 text-xs font-bold text-sky-100 disabled:opacity-50"
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
      {downloadError ? <p role="alert" className="text-xs text-rose-300">{downloadError}</p> : null}
    </section>
  )
}
