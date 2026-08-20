'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Archive,
  ArrowLeft,
  CircleAlert,
  Inbox,
  LoaderCircle,
  Mail,
  MailOpen,
  RefreshCw,
  RotateCcw,
  Search,
} from 'lucide-react'
import { InboundAttachmentList } from '@/components/admin/InboundAttachmentList'
import {
  AdminEmailComposer,
  AdminEmailMessageCard,
  AdminEmailThread,
} from '@/components/admin/email/AdminEmailThread'
import {
  AdminButton,
  AdminEmptyState,
  AdminIconButton,
  AdminNotice,
  adminFieldClass,
} from '@/components/admin/AdminUi'
import { handleAdminTabKeyDown } from '@/components/admin/adminA11y'
import { isInboundEmailAttachmentRow } from '@/lib/inbound-email-attachment-types'
import {
  isGeneralInboxMessageSummary,
  isGeneralInboxReplyRow,
  type GeneralInboxMessageDetail,
  type GeneralInboxMessageSummary,
  type GeneralInboxReplyRow,
} from '@/lib/general-inbox-types'

type InboxView = 'active' | 'unread' | 'archived' | 'all'
const VIEWS: Array<[InboxView, string]> = [
  ['active', 'Active'],
  ['unread', 'Unread'],
  ['archived', 'Archived'],
  ['all', 'All'],
]
const POLL_INTERVAL_MS = 30_000

function formatDate(value: string | null, compact = false) {
  if (!value) return '-'
  return new Intl.DateTimeFormat('en-US',
    compact
      ? { month: 'short', day: 'numeric' }
      : { dateStyle: 'medium', timeStyle: 'short' }
  ).format(new Date(value))
}

function processingLabel(message: GeneralInboxMessageSummary) {
  if (message.processing_status === 'processed') return null
  if (message.processing_status === 'processing') return 'Processing'
  if (message.processing_status === 'failed') return 'Needs retry'
  return 'Pending'
}

export function GeneralInbox() {
  const [messages, setMessages] = useState<GeneralInboxMessageSummary[]>([])
  const [view, setView] = useState<InboxView>('active')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<GeneralInboxMessageDetail | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [listError, setListError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [actionPending, setActionPending] = useState(false)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [sendError, setSendError] = useState('')
  const [sending, setSending] = useState(false)
  const [composerExpanded, setComposerExpanded] = useState(false)
  const requestIdRef = useRef(crypto.randomUUID())
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const listIntentRef = useRef(0)
  const detailIntentRef = useRef(0)

  const replaceMessage = useCallback((updated: GeneralInboxMessageSummary) => {
    setMessages((current) => {
      const exists = current.some((message) => message.inbound_email_id === updated.inbound_email_id)
      const next = exists
        ? current.map((message) =>
            message.inbound_email_id === updated.inbound_email_id ? updated : message
          )
        : [updated, ...current]
      return next.sort(
        (left, right) =>
          new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
      )
    })
  }, [])

  const loadMessages = useCallback(async (targetView: InboxView, silent = false) => {
    const intent = ++listIntentRef.current
    if (!silent) setListLoading(true)
    setListError('')
    try {
      const response = await fetch(`/api/admin/inbox/messages?view=${targetView}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to load Inbox')
      if (listIntentRef.current !== intent) return
      const next = Array.isArray(data?.messages)
        ? (data.messages as unknown[]).filter(isGeneralInboxMessageSummary)
        : []
      setMessages(next)
      setSelectedId((current) =>
        current && next.some((message) => message.inbound_email_id === current)
          ? current
          : next[0]?.inbound_email_id || null
      )
    } catch (error) {
      if (listIntentRef.current === intent) {
        setListError(error instanceof Error ? error.message : 'Failed to load Inbox')
      }
    } finally {
      if (listIntentRef.current === intent) setListLoading(false)
    }
  }, [])

  const loadDetail = useCallback(
    async (inboundEmailId: string, silent = false) => {
      const intent = ++detailIntentRef.current
      if (!silent) {
        setDetailLoading(true)
        setDetailError('')
      }
      try {
        const response = await fetch(`/api/admin/inbox/messages/${inboundEmailId}`, {
          credentials: 'include',
          cache: 'no-store',
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data?.error || 'Failed to load Inbox message')
        if (detailIntentRef.current !== intent || !isGeneralInboxMessageSummary(data?.message)) return
        const nextDetail: GeneralInboxMessageDetail = {
          message: data.message,
          replies: Array.isArray(data?.replies)
            ? data.replies.filter(isGeneralInboxReplyRow)
            : [],
          attachments: Array.isArray(data?.attachments)
            ? data.attachments.filter(isInboundEmailAttachmentRow)
            : [],
        }
        setDetail(nextDetail)
        replaceMessage(nextDetail.message)
        if (!nextDetail.message.admin_read_at) {
          void fetch(`/api/admin/inbox/messages/${inboundEmailId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ action: 'mark_read' }),
          })
            .then((markResponse) => markResponse.json())
            .then((markData) => {
              if (!isGeneralInboxMessageSummary(markData?.message)) return
              replaceMessage(markData.message)
              setDetail((current) =>
                current?.message.inbound_email_id === inboundEmailId
                  ? { ...current, message: markData.message }
                  : current
              )
            })
            .catch(() => undefined)
        }
      } catch (error) {
        if (detailIntentRef.current === intent) {
          setDetailError(error instanceof Error ? error.message : 'Failed to load Inbox message')
        }
      } finally {
        if (detailIntentRef.current === intent) setDetailLoading(false)
      }
    },
    [replaceMessage]
  )

  const patchMessageState = useCallback(
    async (
      inboundEmailId: string,
      action: 'mark_read' | 'mark_unread' | 'archive' | 'restore',
      silent = false
    ) => {
      if (!silent) setActionPending(true)
      try {
        const response = await fetch(`/api/admin/inbox/messages/${inboundEmailId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || !isGeneralInboxMessageSummary(data?.message)) {
          throw new Error(data?.error || 'Failed to update Inbox message')
        }
        replaceMessage(data.message)
        setDetail((current) =>
          current?.message.inbound_email_id === inboundEmailId
            ? { ...current, message: data.message }
            : current
        )
        if (!silent && (action === 'archive' || action === 'restore')) {
          void loadMessages(view, true)
        }
      } catch (error) {
        if (!silent) {
          setDetailError(error instanceof Error ? error.message : 'Failed to update Inbox message')
        }
      } finally {
        if (!silent) setActionPending(false)
      }
    },
    [loadMessages, replaceMessage, view]
  )

  useEffect(() => {
    setMessages([])
    setSelectedId(null)
    setDetail(null)
    setMobileDetailOpen(false)
    void loadMessages(view)
  }, [loadMessages, view])

  useEffect(() => {
    setDraft('')
    setSendError('')
    setComposerExpanded(false)
    requestIdRef.current = crypto.randomUUID()
    if (!selectedId) {
      setDetail(null)
      return
    }
    setDetail((current) =>
      current?.message.inbound_email_id === selectedId ? current : null
    )
    void loadDetail(selectedId)
    return () => {
      detailIntentRef.current += 1
    }
  }, [loadDetail, selectedId])

  // Focus the editor the moment the composer expands (Outlook-style click-to-open).
  useEffect(() => {
    if (composerExpanded) textareaRef.current?.focus()
  }, [composerExpanded])

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      void loadMessages(view, true)
      if (selectedId) void loadDetail(selectedId, true)
    }
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [loadDetail, loadMessages, selectedId, view])

  const visibleMessages = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return messages
    return messages.filter((message) =>
      [message.from_display_name, message.from_email, message.subject, message.body_text, message.route_address]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    )
  }, [messages, search])

  const retryProcessing = async () => {
    if (!selectedId || actionPending) return
    setActionPending(true)
    setDetailError('')
    try {
      const response = await fetch(`/api/admin/inbox/messages/${selectedId}`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to retry processing')
      await loadDetail(selectedId)
      void loadMessages(view, true)
    } catch (error) {
      setDetailError(error instanceof Error ? error.message : 'Failed to retry processing')
    } finally {
      setActionPending(false)
    }
  }

  const sendReply = async () => {
    if (!selectedId || !draft.trim() || sending) return
    setSending(true)
    setSendError('')
    try {
      const response = await fetch(`/api/admin/inbox/messages/${selectedId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: draft.trim(), requestId: requestIdRef.current }),
      })
      const data = await response.json().catch(() => ({}))
      if (isGeneralInboxReplyRow(data?.reply)) {
        const reply: GeneralInboxReplyRow = data.reply
        setDetail((current) => {
          if (!current || current.message.inbound_email_id !== reply.inbound_email_id) return current
          const exists = current.replies.some((candidate) => candidate.reply_id === reply.reply_id)
          return {
            ...current,
            replies: exists
              ? current.replies.map((candidate) =>
                  candidate.reply_id === reply.reply_id ? reply : candidate
                )
              : [...current.replies, reply],
          }
        })
      }
      if (!response.ok) throw new Error(data?.error || 'Failed to send reply')
      setDraft('')
      setComposerExpanded(false)
      requestIdRef.current = crypto.randomUUID()
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Failed to send reply')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="admin-v2-comm-workspace min-h-0 min-w-0 flex-1 2xl:flex 2xl:h-full">
      <aside className={`${mobileDetailOpen ? 'hidden' : 'flex'} admin-v2-comm-queue min-h-0 flex-col border-b border-black/[0.08] 2xl:flex 2xl:h-full 2xl:w-[22rem] 2xl:shrink-0 2xl:border-b-0 2xl:border-r`}>
        <div className="admin-v2-comm-toolbar shrink-0 space-y-3 border-b p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-page-muted)]">Root mail</p>
              <p className="text-sm font-semibold text-[var(--admin-page-ink)]">{messages.length} messages</p>
            </div>
            <AdminIconButton type="button" onClick={() => void loadMessages(view)} disabled={listLoading} title="Refresh Inbox" className="h-9 min-h-9 w-9 basis-9">
              <RefreshCw className={`h-4 w-4 ${listLoading ? 'animate-spin' : ''}`} />
            </AdminIconButton>
          </div>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--admin-page-muted)]" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sender, subject, or message" className={`${adminFieldClass} mt-0 h-10 min-h-10 pl-9`} />
          </label>
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Inbox view">
            {VIEWS.map(([value, label]) => (
              <button key={value} id={`inbox-${value}-tab`} type="button" role="tab" aria-selected={view === value} aria-controls="general-inbox-list" tabIndex={view === value ? 0 : -1} onKeyDown={handleAdminTabKeyDown} onClick={() => setView(value)} className={`admin-v2-comm-tab shrink-0 px-2.5 py-1.5 text-[11px] font-bold ${view === value ? 'admin-v2-comm-tab--active' : 'hover:bg-white'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div id="general-inbox-list" role="tabpanel" aria-labelledby={`inbox-${view}-tab`} className="admin-v2-comm-scroll min-h-0 max-h-[28rem] flex-1 overflow-y-auto overscroll-contain p-2 2xl:max-h-none">
          {listError ? <AdminNotice tone="danger" className="m-2">{listError}</AdminNotice> : null}
          {!listError && !listLoading && visibleMessages.length === 0 ? (
            <AdminEmptyState className="flex min-h-52 flex-col items-center justify-center border-0 bg-transparent text-center"><Inbox className="mb-3 h-7 w-7" />No messages in this view.</AdminEmptyState>
          ) : (
            <div className="space-y-1.5">
              {visibleMessages.map((message) => {
                const selected = message.inbound_email_id === selectedId
                const processLabel = processingLabel(message)
                return (
                  <button key={message.inbound_email_id} type="button" onClick={() => { setSelectedId(message.inbound_email_id); setMobileDetailOpen(true) }} className={`admin-v2-comm-item w-full p-3 text-left ${selected ? 'admin-v2-comm-item--selected' : ''}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {!message.admin_read_at ? <span className="h-2 w-2 shrink-0 rounded-full bg-[#d2a329]" aria-label="Unread" /> : null}
                          <p className="truncate text-sm font-bold text-[var(--admin-page-ink)]">{message.from_display_name || message.from_email || 'Unknown sender'}</p>
                        </div>
                        <p className="mt-1 truncate text-xs text-[var(--admin-page-muted)]">{message.subject || '(No subject)'}</p>
                      </div>
                      <time className="shrink-0 text-[10px] text-[var(--admin-page-muted)]">{formatDate(message.created_at, true)}</time>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--admin-page-muted)]">{message.body_text || message.last_error || 'Content is not available yet.'}</p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[9px] uppercase tracking-wide text-[var(--admin-page-muted)]">
                      <span>{message.route_address}</span>
                      {processLabel ? <span className="font-semibold text-[var(--admin-crit)]">{processLabel}</span> : null}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </aside>

      <section className={`${mobileDetailOpen ? 'flex' : 'hidden'} admin-v2-comm-canvas relative min-h-[38rem] min-w-0 flex-1 flex-col 2xl:flex 2xl:min-h-0`}>
        {!detail ? (
          <AdminIconButton type="button" onClick={() => setMobileDetailOpen(false)} title="Back to Inbox" className="absolute left-3 top-3 z-10 h-9 min-h-9 w-9 basis-9 2xl:hidden">
            <ArrowLeft className="h-4 w-4" />
          </AdminIconButton>
        ) : null}
        {detailLoading && !detail ? <div className="flex flex-1 items-center justify-center text-sm text-[var(--admin-page-muted)]"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" />Loading message...</div> : null}
        {!detailLoading && !detail ? <div className="flex flex-1 flex-col items-center justify-center text-sm text-[var(--admin-page-muted)]"><Mail className="mb-3 h-8 w-8" />Select an Inbox message.</div> : null}
        {detail ? (
          <>
            <header className="flex shrink-0 items-start gap-3 border-b border-[var(--admin-line)] p-3 sm:p-4">
              <AdminIconButton type="button" onClick={() => setMobileDetailOpen(false)} title="Back to Inbox" className="h-9 min-h-9 w-9 basis-9 2xl:hidden"><ArrowLeft className="h-4 w-4" /></AdminIconButton>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-bold text-[var(--admin-page-ink)]">{detail.message.subject || '(No subject)'}</h2>
                <p className="mt-1 truncate text-xs text-[var(--admin-page-muted)]">{detail.message.from_display_name || detail.message.from_email || 'Unknown sender'} / {formatDate(detail.message.created_at)}</p>
                <p className="mt-1 truncate text-[10px] text-[var(--admin-page-muted)]">To {detail.message.route_address}</p>
              </div>
              <AdminIconButton type="button" onClick={() => void patchMessageState(detail.message.inbound_email_id, detail.message.admin_read_at ? 'mark_unread' : 'mark_read')} disabled={actionPending} title={detail.message.admin_read_at ? 'Mark unread' : 'Mark read'} className="h-9 min-h-9 w-9 basis-9">{detail.message.admin_read_at ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}</AdminIconButton>
              <AdminIconButton type="button" onClick={() => void patchMessageState(detail.message.inbound_email_id, detail.message.archived_at ? 'restore' : 'archive')} disabled={actionPending} title={detail.message.archived_at ? 'Restore' : 'Archive'} className="h-9 min-h-9 w-9 basis-9">{detail.message.archived_at ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</AdminIconButton>
            </header>
            {detailError ? <div role="alert" className="border-b border-[color-mix(in_srgb,var(--admin-crit)_40%,transparent)] bg-[color-mix(in_srgb,var(--admin-crit)_12%,var(--admin-panel))] px-4 py-2 text-xs font-semibold text-[color-mix(in_srgb,var(--admin-crit)_75%,var(--admin-ink))]">{detailError}</div> : null}
            <div className="admin-v2-comm-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
              {detail.message.processing_status !== 'processed' ? (
                <div className="rounded-xl border border-[color-mix(in_srgb,var(--admin-crit)_38%,transparent)] bg-[color-mix(in_srgb,var(--admin-crit)_10%,var(--admin-card))] p-4 text-sm text-[color-mix(in_srgb,var(--admin-crit)_78%,var(--admin-ink))]">
                  <div className="flex items-center gap-2 font-bold"><CircleAlert className="h-4 w-4" />Message processing is incomplete</div>
                  <p className="mt-2 text-xs leading-5 text-[var(--admin-page-muted)]">{detail.message.last_error || 'The message can be reclaimed from its durable envelope.'}</p>
                  <AdminButton type="button" onClick={() => void retryProcessing()} disabled={actionPending} tone="danger" className="mt-3 h-9 min-h-9 px-3 text-xs"><RefreshCw className="h-3.5 w-3.5" />Retry processing</AdminButton>
                </div>
              ) : null}
              <AdminEmailThread>
                {detail.message.processing_status === 'processed' ? (
                  <AdminEmailMessageCard
                    direction="inbound"
                    senderName={detail.message.from_display_name || detail.message.from_email || 'Unknown sender'}
                    senderEmail={detail.message.from_email}
                    roleLabel="External sender"
                    timestamp={formatDate(detail.message.created_at)}
                    sourceLabel={`To ${detail.message.route_address || 'YMI Story'}`}
                    statusLabel="Received"
                    statusTone="success"
                    body={detail.message.body_text || '(Empty message body)'}
                    attachmentContent={
                      detail.message.attachment_count > 0 || detail.message.attachment_error ? (
                        <InboundAttachmentList
                          attachments={detail.attachments}
                          envelopeError={detail.message.attachment_error}
                        />
                      ) : undefined
                    }
                  />
                ) : null}
                {detail.replies.map((reply) => (
                  <AdminEmailMessageCard
                    key={reply.reply_id}
                    direction="outbound"
                    senderName="YMI Story"
                    senderEmail={reply.from_email}
                    roleLabel="Admin reply"
                    timestamp={formatDate(reply.sent_at || reply.created_at)}
                    sourceLabel={`To ${reply.to_email}`}
                    statusLabel={reply.delivery_status === 'failed' ? 'Delivery failed' : reply.delivery_status === 'pending' ? 'Sending' : 'Sent'}
                    statusTone={reply.delivery_status === 'failed' ? 'danger' : reply.delivery_status === 'pending' ? 'warning' : 'success'}
                    body={reply.body_text}
                    deliveryError={reply.delivery_error}
                  />
                ))}
              </AdminEmailThread>
            </div>
            <footer className="shrink-0 border-t border-[var(--admin-line)] bg-[var(--admin-panel-2)] p-3 sm:p-4">
              {detail.message.processing_status !== 'processed' || !detail.message.from_email ? (
                <p className="rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-panel)] px-4 py-3 text-xs text-[var(--admin-page-muted)]">A safe sender and completed processing are required before replying.</p>
              ) : (
                <AdminEmailComposer
                  expanded={composerExpanded}
                  onExpandedChange={setComposerExpanded}
                  value={draft}
                  onChange={setDraft}
                  onSubmit={() => void sendReply()}
                  sending={sending}
                  error={sendError}
                  textareaRef={textareaRef}
                  maxLength={20000}
                  placeholder="Write a reply..."
                  label="Reply"
                  meta="Ctrl/Cmd + Enter to send / From and Reply-To are selected by the server"
                  submitLabel="Send"
                />
              )}
            </footer>
          </>
        ) : null}
      </section>
    </div>
  )
}
