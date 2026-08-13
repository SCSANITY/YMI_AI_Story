'use client'

import { useEffect, useRef, useState } from 'react'
import {
  CircleAlert,
  LoaderCircle,
  Mail,
  Paperclip,
  RefreshCw,
  Send,
  ShieldCheck,
  ShieldX,
} from 'lucide-react'
import { InboundAttachmentList } from '@/components/admin/InboundAttachmentList'
import {
  AdminButton,
  AdminNotice,
  AdminStatusBadge,
} from '@/components/admin/AdminUi'
import type {
  KolPartnershipLead,
  KolPartnershipMessage,
} from '@/lib/kol-partnerships'
import type { InboundEmailAttachmentRow } from '@/lib/inbound-email-attachment-types'

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function deliveryLabel(message: KolPartnershipMessage) {
  if (message.delivery_status === 'failed') return 'Send failed'
  if (message.delivery_status === 'pending') return 'Sending'
  if (message.direction === 'applicant') return 'Received'
  if (message.provider_delivery_status === 'complained') return 'Complaint received'
  if (message.provider_delivery_status === 'bounced') return 'Bounced'
  if (message.provider_delivery_status === 'failed') return 'Delivery failed'
  if (message.provider_delivery_status === 'suppressed') return 'Suppressed'
  if (message.provider_delivery_status === 'delayed') return 'Delayed'
  if (message.provider_delivery_status === 'delivered') return 'Delivered'
  return 'Sent'
}

function deliveryTone(message: KolPartnershipMessage): 'neutral' | 'success' | 'warning' | 'danger' {
  if (
    message.delivery_status === 'failed' ||
    ['complained', 'bounced', 'failed', 'suppressed'].includes(
      message.provider_delivery_status || ''
    )
  ) return 'danger'
  if (message.delivery_status === 'pending' || message.provider_delivery_status === 'delayed') {
    return 'warning'
  }
  if (message.provider_delivery_status === 'delivered' || message.direction === 'applicant') {
    return 'success'
  }
  return 'neutral'
}

export function KolPartnershipConversation({
  lead,
  messages,
  quarantinedMessages,
  attachments,
  onSend,
  onReviewSender,
}: {
  lead: KolPartnershipLead
  messages: KolPartnershipMessage[]
  quarantinedMessages: KolPartnershipMessage[]
  attachments: InboundEmailAttachmentRow[]
  onSend: (message: string, requestId: string) => Promise<void>
  onReviewSender: (messageId: string, action: 'confirm' | 'reject') => Promise<void>
}) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [reviewingMessageId, setReviewingMessageId] = useState<string | null>(null)
  const [reviewError, setReviewError] = useState('')
  const requestIdRef = useRef(crypto.randomUUID())
  const previousLeadIdRef = useRef(lead.lead_id)
  const isClosed = lead.review_status === 'declined' || lead.review_status === 'archived'

  useEffect(() => {
    if (previousLeadIdRef.current === lead.lead_id) return
    previousLeadIdRef.current = lead.lead_id
    setDraft('')
    setSendError('')
    setReviewError('')
    requestIdRef.current = crypto.randomUUID()
  }, [lead.lead_id])

  const submit = async () => {
    const message = draft.trim()
    if (!message || sending || isClosed) return
    setSending(true)
    setSendError('')
    try {
      await onSend(message, requestIdRef.current)
      setDraft('')
      requestIdRef.current = crypto.randomUUID()
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Unable to send partnership email')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className="admin-v2-data-row overflow-hidden">
      <header className="flex flex-col gap-2 border-b border-[var(--admin-line)] p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--admin-accent)_22%,transparent)] text-[var(--admin-accent-dp)]">
            <Mail className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-[var(--admin-page-ink)]">Partnership correspondence</h3>
            <p className="mt-1 break-all text-xs text-[var(--admin-page-muted)]">
              Sending to {lead.contact_email || 'missing contact email'}
            </p>
          </div>
        </div>
        <AdminStatusBadge tone="info">#{lead.lead_code}</AdminStatusBadge>
      </header>

      <div className="space-y-3 p-4 sm:p-5">
        {quarantinedMessages.length > 0 ? (
          <section className="space-y-3 rounded-lg border border-[color-mix(in_srgb,var(--admin-warn)_45%,var(--admin-card-line))] bg-[color-mix(in_srgb,var(--admin-warn)_9%,var(--admin-card))] p-4" aria-label="Replies awaiting sender confirmation">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--admin-warn)]">Sender confirmation required</p>
              <p className="mt-1 text-xs leading-5 text-[var(--admin-page-muted)]">
                These replies came from an address outside the account and partnership contact emails. Confirm only when you recognize the sender.
              </p>
            </div>
            {quarantinedMessages.map((message) => {
              const messageAttachments = attachments.filter(
                (attachment) => attachment.inbound_email_id === message.inbound_email_id
              )
              const pending = reviewingMessageId === message.message_id
              return (
                <article key={message.message_id} className="rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-card)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-all text-sm font-black text-[var(--admin-page-ink)]">{message.sender_email}</p>
                      <p className="mt-1 text-[10px] text-[var(--admin-page-muted)]">{message.sender_display_name || 'Unverified third-party sender'}</p>
                    </div>
                    <time className="text-[10px] text-[var(--admin-page-muted)]">{formatDate(message.created_at)}</time>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--admin-page-ink)]">{message.body_text}</p>
                  {messageAttachments.length > 0 ? (
                    <div className="mt-3 rounded-lg border border-dashed border-[var(--admin-card-line)] bg-[var(--admin-panel-2)] p-3 text-xs text-[var(--admin-page-muted)]">
                      <p className="flex items-center gap-1.5 font-bold text-[var(--admin-page-ink)]"><Paperclip className="h-3.5 w-3.5" /> {messageAttachments.length} attachment(s) locked</p>
                      <p className="mt-1 break-words">{messageAttachments.map((attachment) => attachment.safe_filename).join(', ')}</p>
                      <p className="mt-1">Downloads unlock only after sender confirmation.</p>
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    <AdminButton
                      type="button"
                      tone="danger"
                      disabled={reviewingMessageId !== null}
                      onClick={() => {
                        setReviewingMessageId(message.message_id)
                        setReviewError('')
                        void onReviewSender(message.message_id, 'reject')
                          .catch((error) => setReviewError(error instanceof Error ? error.message : 'Unable to reject sender'))
                          .finally(() => setReviewingMessageId(null))
                      }}
                    >
                      {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldX className="h-4 w-4" />} Reject
                    </AdminButton>
                    <AdminButton
                      type="button"
                      tone="primary"
                      disabled={reviewingMessageId !== null}
                      onClick={() => {
                        setReviewingMessageId(message.message_id)
                        setReviewError('')
                        void onReviewSender(message.message_id, 'confirm')
                          .catch((error) => setReviewError(error instanceof Error ? error.message : 'Unable to confirm sender'))
                          .finally(() => setReviewingMessageId(null))
                      }}
                    >
                      {pending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Confirm sender
                    </AdminButton>
                  </div>
                </article>
              )
            })}
            {reviewError ? <p role="alert" className="text-xs text-[var(--admin-crit)]">{reviewError}</p> : null}
          </section>
        ) : null}

        {messages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--admin-card-line)] px-4 py-8 text-center">
            <Mail className="mx-auto h-6 w-6 text-[var(--admin-page-muted)]" />
            <p className="mt-2 text-sm font-semibold text-[var(--admin-page-ink)]">No email sent yet</p>
            <p className="mt-1 text-xs text-[var(--admin-page-muted)]">
              The first message opens this lead-owned email thread.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <article
              key={message.message_id}
              className={`rounded-lg border p-4 ${
                message.direction === 'admin'
                  ? 'border-[color-mix(in_srgb,var(--admin-accent)_42%,var(--admin-card-line))] bg-[color-mix(in_srgb,var(--admin-accent)_8%,var(--admin-card))]'
                  : 'border-[var(--admin-card-line)] bg-[var(--admin-panel-2)]'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-bold text-[var(--admin-page-ink)]">
                    {message.sender_display_name || (message.direction === 'admin' ? 'YMI Story Partnerships' : lead.nickname)}
                  </p>
                  <p className="break-all text-[10px] text-[var(--admin-page-muted)]">{message.sender_email}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <AdminStatusBadge tone={deliveryTone(message)}>{deliveryLabel(message)}</AdminStatusBadge>
                  <time className="text-[10px] text-[var(--admin-page-muted)]">
                    {formatDate(message.sent_at || message.created_at)}
                  </time>
                </div>
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--admin-page-ink)]">
                {message.body_text}
              </p>
              {message.delivery_error ? (
                <p className="mt-3 flex items-start gap-1.5 text-xs text-[var(--admin-crit)]">
                  <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {message.delivery_error}
                </p>
              ) : null}
              {message.attachment_count > 0 || message.attachment_error ? (
                <div className="mt-3 border-t border-[var(--admin-line)] pt-3">
                  <InboundAttachmentList
                    attachments={attachments.filter(
                      (attachment) => attachment.inbound_email_id === message.inbound_email_id
                    )}
                    envelopeError={message.attachment_error}
                  />
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>

      <footer className="border-t border-[var(--admin-line)] bg-[var(--admin-panel-2)] p-4 sm:p-5">
        {isClosed ? (
          <AdminNotice tone="warning">Closed applications cannot receive new partnership email.</AdminNotice>
        ) : (
          <>
            <label className="block">
              <span className="sr-only">Partnership email message</span>
              <textarea
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value)
                  setSendError('')
                  requestIdRef.current = crypto.randomUUID()
                }}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault()
                    void submit()
                  }
                }}
                maxLength={12000}
                placeholder="Write a partnership email..."
                className="min-h-28 w-full resize-y rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-card)] px-4 py-3 text-sm leading-6 text-[var(--admin-page-ink)] outline-none transition placeholder:text-[var(--admin-page-muted)] focus:border-[var(--admin-accent-dp)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--admin-accent)_30%,transparent)]"
              />
            </label>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] text-[var(--admin-page-muted)]">
                  Ctrl/Cmd + Enter to send / Replies return to this partnership thread
                </p>
                {sendError ? <p role="alert" className="mt-1 text-xs text-[var(--admin-crit)]">{sendError}</p> : null}
              </div>
              <AdminButton type="button" tone="primary" disabled={sending || !draft.trim()} onClick={() => void submit()}>
                {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : sendError ? <RefreshCw className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                {sending ? 'Sending...' : sendError ? 'Retry send' : 'Send email'}
              </AdminButton>
            </div>
          </>
        )}
      </footer>
    </section>
  )
}
