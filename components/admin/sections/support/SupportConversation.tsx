'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  LockKeyhole,
  Reply,
  RotateCcw,
} from 'lucide-react'
import { InboundAttachmentList } from '@/components/admin/InboundAttachmentList'
import { AdminButton, AdminIconButton, AdminStatusBadge } from '@/components/admin/AdminUi'
import {
  AdminEmailComposer,
  AdminEmailMessageCard,
  AdminEmailThread,
} from '@/components/admin/email/AdminEmailThread'
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

      <div ref={scrollRef} className="admin-v2-comm-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-5 sm:px-5">
        <AdminEmailThread>
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
        </AdminEmailThread>
      </div>

      <footer className="shrink-0 border-t border-[var(--admin-line)] bg-[var(--admin-panel-2)] p-3 sm:p-4">
        {isClosed ? (
          <div className="flex items-center justify-center gap-2 rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel)] px-4 py-3 text-xs text-[var(--admin-page-muted)]">
            <LockKeyhole className="h-4 w-4" /> Reopen this ticket before sending another reply.
          </div>
        ) : (
          <AdminEmailComposer
            expanded={composerExpanded}
            onExpandedChange={setComposerExpanded}
            value={draft}
            onChange={(value) => {
              setDraft(value)
              setSendError('')
              requestIdRef.current = crypto.randomUUID()
            }}
            onSubmit={() => void submitReply()}
            sending={sending}
            error={sendError}
            textareaRef={textareaRef}
            maxLength={8000}
            placeholder="Write a reply..."
            label="Reply to customer"
            meta="Ctrl/Cmd + Enter to send / Replies continue by email"
            submitLabel={sendError ? 'Retry send' : 'Send reply'}
          />
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
  const sourceLabel =
    message.source === 'email_inbound'
      ? 'Email reply'
      : message.source === 'web_form'
        ? 'Website form'
        : 'Admin email'

  const statusLabel = isAdmin
    ? message.delivery_status === 'failed'
      ? 'Delivery failed'
      : message.delivery_status === 'pending'
        ? 'Sending'
        : 'Sent'
    : 'Received'
  const statusTone = message.delivery_status === 'failed'
    ? 'danger'
    : message.delivery_status === 'pending'
      ? 'warning'
      : 'success'

  return (
    <AdminEmailMessageCard
      direction={isAdmin ? 'outbound' : 'inbound'}
      senderName={senderName}
      senderEmail={message.sender_email}
      roleLabel={isAdmin ? 'YMI Support' : 'Customer'}
      timestamp={formatDate(message.sent_at || message.created_at)}
      sourceLabel={sourceLabel}
      statusLabel={statusLabel}
      statusTone={statusTone}
      body={message.body_text}
      deliveryError={message.delivery_error}
      attachmentContent={
        message.attachment_count > 0 || message.attachment_error ? (
          <>
            <InboundAttachmentList
              attachments={attachments}
              envelopeError={message.attachment_error}
            />
          </>
        ) : undefined
      }
    />
  )
}
