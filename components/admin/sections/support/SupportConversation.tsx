'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  LockKeyhole,
  Paperclip,
  Reply,
  RotateCcw,
  Send,
} from 'lucide-react'
import { InboundAttachmentList } from '@/components/admin/InboundAttachmentList'
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
  const requestIdRef = useRef(crypto.randomUUID())
  const scrollRef = useRef<HTMLDivElement>(null)
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
    requestIdRef.current = crypto.randomUUID()
  }, [detailTicketId])

  const submitReply = async () => {
    const normalized = draft.trim()
    if (!normalized || sending || detail?.ticket.status === 'closed') return
    setSending(true)
    setSendError('')
    try {
      await onSend(normalized, requestIdRef.current)
      setDraft('')
      requestIdRef.current = crypto.randomUUID()
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Failed to send support reply')
    } finally {
      setSending(false)
    }
  }

  if (loading && !detail) {
    return (
      <section className="flex min-h-[32rem] min-w-0 flex-1 items-center justify-center text-sm text-slate-500">
        <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading conversation...
      </section>
    )
  }

  if (loadError && !detail) {
    return (
      <section className="flex min-h-[32rem] min-w-0 flex-1 flex-col items-center justify-center px-6 text-center">
        <CircleAlert className="mb-3 h-7 w-7 text-rose-300" />
        <p className="text-sm text-rose-200">{loadError}</p>
        <button type="button" onClick={onReload} className="mt-4 text-sm font-bold text-white underline underline-offset-4">
          Retry
        </button>
      </section>
    )
  }

  if (!detail) {
    return (
      <section className="flex min-h-[32rem] min-w-0 flex-1 flex-col items-center justify-center px-6 text-center text-sm text-slate-500">
        <Reply className="mb-3 h-8 w-8" />
        Select a support ticket to open its conversation.
      </section>
    )
  }

  const { ticket, messages, attachments } = detail
  const isClosed = ticket.status === 'closed'

  return (
    <section className="flex min-h-[38rem] min-w-0 flex-1 flex-col bg-[#0d1526] xl:h-full xl:min-h-0">
      <header className="flex shrink-0 items-start gap-3 border-b border-white/[0.08] bg-[#0d1526]/95 p-3 backdrop-blur-xl sm:p-4">
        <button
          type="button"
          onClick={onBack}
          title="Back to ticket list"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 text-slate-300 xl:hidden"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-bold text-white">{ticket.display_name || ticket.email}</h2>
            <span className="rounded-full bg-white/[0.07] px-2 py-1 text-[9px] font-bold text-slate-300">
              {ticketStatusLabel(ticket.status)}
            </span>
          </div>
          <p className="mt-1 truncate text-xs text-slate-500">{ticket.email} · #{ticket.ticket_code}</p>
        </div>
        {isClosed ? (
          <button
            type="button"
            onClick={() => void onReopen()}
            disabled={actionPending}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl bg-amber-400 px-3 text-xs font-bold text-slate-950 disabled:cursor-wait disabled:opacity-60"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reopen
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void onClose()}
            disabled={actionPending}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-bold text-slate-300 transition hover:bg-white/[0.06] disabled:cursor-wait disabled:opacity-60"
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Close
          </button>
        )}
      </header>

      {loadError ? (
        <div role="alert" className="shrink-0 border-b border-rose-400/15 bg-rose-400/[0.07] px-4 py-2 text-xs text-rose-200">
          Refresh failed: {loadError}. Showing the last loaded conversation.
        </div>
      ) : null}

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-5 sm:px-5">
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

      <footer className="shrink-0 border-t border-white/[0.08] bg-slate-950/55 p-3 sm:p-4">
        {isClosed ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-xs text-slate-400">
            <LockKeyhole className="h-4 w-4" /> Reopen this ticket before sending another reply.
          </div>
        ) : (
          <>
            <label className="block">
              <span className="sr-only">Reply to customer</span>
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
                    void submitReply()
                  }
                }}
                maxLength={8000}
                placeholder="Write a reply..."
                className="min-h-24 w-full resize-none rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-amber-300/50 focus:ring-2 focus:ring-amber-300/10"
              />
            </label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-[10px] text-slate-600">Ctrl/⌘ + Enter to send · Replies continue by email</p>
                {sendError ? <p role="alert" className="mt-1 text-xs text-rose-300">{sendError}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => void submitReply()}
                disabled={sending || !draft.trim()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-400 px-5 text-sm font-black text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? 'Sending...' : sendError ? 'Retry send' : 'Send reply'}
              </button>
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
  return (
    <article className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[min(46rem,88%)] rounded-2xl border px-4 py-3 ${
          isAdmin
            ? 'border-amber-300/20 bg-amber-300/[0.09] text-amber-50'
            : 'border-white/[0.09] bg-white/[0.055] text-slate-100'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${isAdmin ? 'text-amber-200' : 'text-sky-200'}`}>
            {isAdmin ? message.sender_display_name || 'YMI Story Support' : message.sender_display_name || 'Customer'}
          </p>
          <time className="text-[9px] text-slate-600">{formatDate(message.sent_at || message.created_at)}</time>
        </div>
        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{message.body_text}</p>
        {message.attachment_count > 0 || message.attachment_error ? (
          <div className="mt-3 border-t border-white/[0.07] pt-3">
            <InboundAttachmentList
              attachments={attachments}
              envelopeError={message.attachment_error}
            />
          </div>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[9px] text-slate-500">
          <span>{message.source === 'email_inbound' ? 'Email reply' : message.source === 'web_form' ? 'Website form' : 'Admin email'}</span>
          {message.attachment_count > 0 ? (
            <span className="inline-flex items-center gap-1 text-amber-200/70">
              <Paperclip className="h-3 w-3" /> {message.attachment_count} attachment(s)
            </span>
          ) : null}
          {message.delivery_status === 'pending' ? <span className="text-amber-200">Sending...</span> : null}
          {message.delivery_status === 'failed' ? (
            <span className="text-rose-300" title={message.delivery_error || undefined}>Delivery failed</span>
          ) : null}
        </div>
      </div>
    </article>
  )
}
