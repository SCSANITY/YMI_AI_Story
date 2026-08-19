'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  LoaderCircle,
  LockKeyhole,
  Paperclip,
  Reply,
  RotateCcw,
  Send,
} from 'lucide-react'
import { InboundAttachmentList } from '@/components/admin/InboundAttachmentList'
import { AdminButton, AdminIconButton, AdminStatusBadge } from '@/components/admin/AdminUi'
import type { InboundEmailAttachmentRow } from '@/lib/inbound-email-attachment-types'
import type { SupportMessageRow, SupportTicketDetail } from '@/lib/support-types'

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function ticketStatusLabel(status: string) {
  if (status === 'customer_replied') return 'Customer replied'
  if (status === 'waiting_customer') return 'Waiting for customer'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function SupportConversation({
  detail,
  loading,
  loadError,
  actionPending,
  onBack,
  onReload,
  onSend,
  onClose,
  onReopen,
}: {
  detail: SupportTicketDetail | null
  loading: boolean
  loadError: string
  actionPending: boolean
  onBack: () => void
  onReload: () => void
  onSend: (message: string, requestId: string) => Promise<void>
  onClose: () => Promise<void>
  onReopen: () => Promise<void>
}) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [composerExpanded, setComposerExpanded] = useState(false)
  const requestIdRef = useRef(crypto.randomUUID())
  const scrollRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const detailTicketId = detail?.ticket.question_id ?? null
  const detailMessageCount = detail?.messages.length ?? 0

  useEffect(() => {
    const container = scrollRef.current
    if (!container || !detailTicketId) return
    container.scrollTop = container.scrollHeight
  }, [detailMessageCount, detailTicketId])

  useEffect(() => {
    setDraft('')
    setSendError('')
    setComposerExpanded(false)
    requestIdRef.current = crypto.randomUUID()
  }, [detailTicketId])

  // Focus the editor as soon as the composer expands (Outlook-style click-to-open).
  useEffect(() => {
    if (composerExpanded) textareaRef.current?.focus()
  }, [composerExpanded])

  const submitReply = async () => {
    const normalized = draft.trim()
    if (!normalized || sending || detail?.ticket.status === 'closed') return
    setSending(true)
    setSendError('')
    try {
      await onSend(normalized, requestIdRef.current)
      setDraft('')
      setComposerExpanded(false)
      requestIdRef.current = crypto.randomUUID()
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Failed to send support reply')
    } finally {
      setSending(false)
    }
  }

  if (loading && !detail) {
    return (
      <section className="admin-v2-comm-canvas relative flex min-h-[32rem] min-w-0 flex-1 items-center justify-center text-sm text-[var(--admin-page-muted)]">
        <AdminIconButton type="button" onClick={onBack} title="Back to ticket list" className="absolute left-3 top-3 h-9 min-h-9 w-9 basis-9 2xl:hidden">
          <ArrowLeft className="h-4 w-4" />
        </AdminIconButton>
        <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading conversation...
      </section>
    )
  }

  if (loadError && !detail) {
    return (
      <section className="admin-v2-comm-canvas relative flex min-h-[32rem] min-w-0 flex-1 flex-col items-center justify-center px-6 text-center">
        <AdminIconButton type="button" onClick={onBack} title="Back to ticket list" className="absolute left-3 top-3 h-9 min-h-9 w-9 basis-9 2xl:hidden">
          <ArrowLeft className="h-4 w-4" />
        </AdminIconButton>
        <CircleAlert className="mb-3 h-7 w-7 text-[var(--admin-crit)]" />
        <p className="text-sm text-[color-mix(in_srgb,var(--admin-crit)_78%,var(--admin-ink))]">{loadError}</p>
        <button type="button" onClick={onReload} className="mt-4 text-sm font-bold text-[var(--admin-accent-dp)] underline underline-offset-4">
          Retry
        </button>
      </section>
    )
  }

  if (!detail) {
    return (
      <section className="admin-v2-comm-canvas relative flex min-h-[32rem] min-w-0 flex-1 flex-col items-center justify-center px-6 text-center text-sm text-[var(--admin-page-muted)]">
        <AdminIconButton type="button" onClick={onBack} title="Back to ticket list" className="absolute left-3 top-3 h-9 min-h-9 w-9 basis-9 2xl:hidden">
          <ArrowLeft className="h-4 w-4" />
        </AdminIconButton>
        <Reply className="mb-3 h-8 w-8" />
        Select a support ticket to open its conversation.
      </section>
    )
  }

  const { ticket, messages, attachments } = detail
  const isClosed = ticket.status === 'closed'

  return (
    <section className="admin-v2-comm-canvas flex min-h-[38rem] min-w-0 flex-1 flex-col 2xl:h-full 2xl:min-h-0">
      <header className="flex shrink-0 items-start gap-3 border-b border-[var(--admin-line)] bg-[var(--admin-panel-2)] p-3 sm:p-4">
        <AdminIconButton
          type="button"
          onClick={onBack}
          title="Back to ticket list"
          className="h-9 min-h-9 w-9 basis-9 2xl:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
        </AdminIconButton>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-bold text-[var(--admin-page-ink)]">{ticket.display_name || ticket.email}</h2>
            <AdminStatusBadge tone={isClosed ? 'neutral' : 'info'}>
              {ticketStatusLabel(ticket.status)}
            </AdminStatusBadge>
          </div>
          <p className="mt-1 truncate text-xs text-[var(--admin-page-muted)]">{ticket.email} / #{ticket.ticket_code}</p>
        </div>
        {isClosed ? (
          <AdminButton
            type="button"
            onClick={() => void onReopen()}
            disabled={actionPending}
            tone="primary"
            className="h-9 min-h-9 shrink-0 px-3 text-xs"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reopen
          </AdminButton>
        ) : (
          <AdminButton
            type="button"
            tone="secondary"
            onClick={() => void onClose()}
            disabled={actionPending}
            className="h-9 min-h-9 shrink-0 px-3 text-xs"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Close
          </AdminButton>
        )}
      </header>

      {loadError ? (
        <div role="alert" className="shrink-0 border-b border-[color-mix(in_srgb,var(--admin-crit)_40%,transparent)] bg-[color-mix(in_srgb,var(--admin-crit)_12%,var(--admin-panel))] px-4 py-2 text-xs font-semibold text-[color-mix(in_srgb,var(--admin-crit)_75%,var(--admin-ink))]">
          Refresh failed: {loadError}. Showing the last loaded conversation.
        </div>
      ) : null}

      <div ref={scrollRef} className="admin-v2-comm-scroll min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-5 sm:px-5">
        {messages.map((message) => (
          <MessageBubble
            key={message.message_id}
            message={message}
            attachments={attachments.filter(
              (attachment) =>
                Boolean(message.provider_email_id) &&
                attachment.provider_email_id === message.provider_email_id
            )}
          />
        ))}
      </div>

      <footer className="shrink-0 border-t border-[var(--admin-line)] bg-[var(--admin-panel-2)] p-3 sm:p-4">
        {isClosed ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel)] px-4 py-3 text-xs text-[var(--admin-page-muted)]">
            <LockKeyhole className="h-4 w-4" /> Reopen this ticket before sending another reply.
          </div>
        ) : !composerExpanded ? (
          <button
            type="button"
            onClick={() => setComposerExpanded(true)}
            className="flex w-full items-center gap-2.5 rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-card)] px-4 py-2.5 text-left text-sm transition hover:border-[var(--admin-accent-dp)]"
          >
            <Reply className="h-4 w-4 shrink-0 text-[var(--admin-page-muted)]" />
            <span className={`flex-1 truncate ${draft.trim() ? 'text-[var(--admin-page-ink)]' : 'text-[var(--admin-page-muted)]'}`}>
              {draft.trim() ? draft.trim() : 'Write a reply...'}
            </span>
            {draft.trim() ? (
              <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--admin-accent)_20%,transparent)] px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[color-mix(in_srgb,var(--admin-accent-dp)_88%,var(--admin-ink))]">
                Draft
              </span>
            ) : null}
          </button>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-page-muted)]">Reply to customer</p>
              <button
                type="button"
                onClick={() => setComposerExpanded(false)}
                aria-label="Collapse reply"
                title="Collapse"
                className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--admin-page-muted)] transition hover:bg-[color-mix(in_srgb,var(--admin-ink)_8%,transparent)] hover:text-[var(--admin-page-ink)] sm:h-8 sm:w-8"
              >
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
            <label className="block">
              <span className="sr-only">Reply to customer</span>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value)
                  setSendError('')
                  requestIdRef.current = crypto.randomUUID()
                }}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault()
                    void submitReply()
                  }
                }}
                maxLength={8000}
                placeholder="Write a reply..."
                className="min-h-24 w-full resize-none rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-card)] px-4 py-3 text-sm leading-6 text-[var(--admin-page-ink)] outline-none transition placeholder:text-[var(--admin-page-muted)] focus:border-[var(--admin-accent-dp)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--admin-accent)_30%,transparent)]"
              />
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] text-[var(--admin-page-muted)]">Ctrl/Cmd + Enter to send / Replies continue by email</p>
                {sendError ? <p role="alert" className="mt-1 text-xs text-[var(--admin-crit)]">{sendError}</p> : null}
              </div>
              <AdminButton
                type="button"
                onClick={() => void submitReply()}
                disabled={sending || !draft.trim()}
                tone="primary"
              >
                {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? 'Sending...' : sendError ? 'Retry send' : 'Send reply'}
              </AdminButton>
            </div>
          </>
        )}
      </footer>
    </section>
  )
}

function MessageBubble({
  message,
  attachments,
}: {
  message: SupportMessageRow
  attachments: InboundEmailAttachmentRow[]
}) {
  const isAdmin = message.direction === 'admin'
  const senderName = isAdmin
    ? message.sender_display_name || 'YMI Story Support'
    : message.sender_display_name || 'Customer'
  const initial = senderName.trim().charAt(0).toUpperCase() || (isAdmin ? 'S' : 'C')
  const sourceLabel =
    message.source === 'email_inbound'
      ? 'Email reply'
      : message.source === 'web_form'
        ? 'Website form'
        : 'Admin email'

  // Outlook-style email thread: each message is a full-width card with a header row
  // (avatar + sender + role + time) and the body below. Admin messages carry a subtle
  // accent tint so "our team" reads apart from the customer without chat-bubble sides.
  return (
    <article className={`admin-v2-message-card overflow-hidden ${isAdmin ? 'admin-v2-message-card--outbound' : ''}`}>
      <header
        className={`flex items-center gap-3 border-b border-[var(--admin-line)] px-4 py-2.5 ${
          isAdmin ? 'bg-[color-mix(in_srgb,var(--admin-accent)_13%,var(--admin-card))]' : 'bg-[var(--admin-panel-2)]'
        }`}
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black ${
            isAdmin
              ? 'bg-[var(--admin-accent)] text-[var(--admin-accent-ink)]'
              : 'bg-[color-mix(in_srgb,var(--admin-ink)_18%,var(--admin-card))] text-[var(--admin-ink)]'
          }`}
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p className="truncate text-sm font-bold text-[var(--admin-page-ink)]">{senderName}</p>
            <span
              className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] ${
                isAdmin
                  ? 'bg-[color-mix(in_srgb,var(--admin-accent-dp)_20%,transparent)] text-[color-mix(in_srgb,var(--admin-accent-dp)_88%,var(--admin-ink))]'
                  : 'bg-[color-mix(in_srgb,var(--admin-ink)_10%,transparent)] text-[var(--admin-page-muted)]'
              }`}
            >
              {isAdmin ? 'Support' : 'Customer'}
            </span>
          </div>
          <time className="text-[10px] text-[var(--admin-page-muted)]">{formatDate(message.sent_at || message.created_at)}</time>
        </div>
        <span className="hidden shrink-0 text-[10px] text-[var(--admin-page-muted)] sm:inline">{sourceLabel}</span>
      </header>
      <div className="px-4 py-3.5">
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--admin-page-ink)]">{message.body_text}</p>
        {message.attachment_count > 0 || message.attachment_error ? (
          <div className="mt-3 border-t border-[var(--admin-line)] pt-3">
            <InboundAttachmentList
              attachments={attachments}
              envelopeError={message.attachment_error}
            />
          </div>
        ) : null}
        {message.attachment_count > 0 || message.delivery_status === 'pending' || message.delivery_status === 'failed' ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[10px] text-[var(--admin-page-muted)]">
            {message.attachment_count > 0 ? (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="h-3 w-3" /> {message.attachment_count} attachment(s)
              </span>
            ) : null}
            {message.delivery_status === 'pending' ? <span className="font-semibold text-[var(--admin-warn)]">Sending...</span> : null}
            {message.delivery_status === 'failed' ? (
              <span className="font-semibold text-[var(--admin-crit)]" title={message.delivery_error || undefined}>Delivery failed</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  )
}
