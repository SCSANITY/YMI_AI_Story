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
  Send,
} from 'lucide-react'
import { InboundAttachmentList } from '@/components/admin/InboundAttachmentList'
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
  const requestIdRef = useRef(crypto.randomUUID())
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
      requestIdRef.current = crypto.randomUUID()
    } catch (error) {
      setSendError(error instanceof Error ? error.message : 'Failed to send reply')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.035] xl:flex xl:h-full">
      <aside className={`${mobileDetailOpen ? 'hidden' : 'flex'} min-h-0 flex-col border-b border-white/[0.08] bg-slate-950/35 xl:flex xl:h-full xl:w-[22rem] xl:shrink-0 xl:border-b-0 xl:border-r`}>
        <div className="shrink-0 space-y-3 border-b border-white/[0.08] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Root mail</p>
              <p className="text-sm font-semibold text-white">{messages.length} messages</p>
            </div>
            <button type="button" onClick={() => void loadMessages(view)} disabled={listLoading} title="Refresh Inbox" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-slate-300 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${listLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sender, subject, or message" className="h-10 w-full rounded-xl border border-white/10 bg-slate-950 pl-9 pr-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-amber-300/60" />
          </label>
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Inbox view">
            {VIEWS.map(([value, label]) => (
              <button key={value} type="button" role="tab" aria-selected={view === value} onClick={() => setView(value)} className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${view === value ? 'bg-amber-400 text-slate-950' : 'bg-white/[0.05] text-slate-400'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 max-h-[28rem] flex-1 overflow-y-auto overscroll-contain p-2 xl:max-h-none">
          {listError ? <p role="alert" className="m-2 rounded-xl bg-rose-400/10 p-3 text-xs text-rose-200">{listError}</p> : null}
          {!listError && !listLoading && visibleMessages.length === 0 ? (
            <div className="flex min-h-52 flex-col items-center justify-center text-sm text-slate-500"><Inbox className="mb-3 h-7 w-7" />No messages in this view.</div>
          ) : (
            <div className="space-y-1.5">
              {visibleMessages.map((message) => {
                const selected = message.inbound_email_id === selectedId
                const processLabel = processingLabel(message)
                return (
                  <button key={message.inbound_email_id} type="button" onClick={() => { setSelectedId(message.inbound_email_id); setMobileDetailOpen(true) }} className={`w-full rounded-xl border p-3 text-left ${selected ? 'border-amber-300/40 bg-amber-300/[0.10]' : 'border-transparent bg-white/[0.035] hover:bg-white/[0.065]'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {!message.admin_read_at ? <span className="h-2 w-2 shrink-0 rounded-full bg-amber-300" aria-label="Unread" /> : null}
                          <p className="truncate text-sm font-bold text-white">{message.from_display_name || message.from_email || 'Unknown sender'}</p>
                        </div>
                        <p className="mt-1 truncate text-xs text-slate-400">{message.subject || '(No subject)'}</p>
                      </div>
                      <time className="shrink-0 text-[10px] text-slate-600">{formatDate(message.created_at, true)}</time>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{message.body_text || message.last_error || 'Content is not available yet.'}</p>
                    <div className="mt-2 flex items-center justify-between gap-2 text-[9px] uppercase tracking-wide text-slate-600">
                      <span>{message.route_address}</span>
                      {processLabel ? <span className="text-rose-300">{processLabel}</span> : null}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </aside>

      <section className={`${mobileDetailOpen ? 'flex' : 'hidden'} min-h-[38rem] min-w-0 flex-1 flex-col bg-[#0d1526] xl:flex xl:min-h-0`}>
        {detailLoading && !detail ? <div className="flex flex-1 items-center justify-center text-sm text-slate-500"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" />Loading message...</div> : null}
        {!detailLoading && !detail ? <div className="flex flex-1 flex-col items-center justify-center text-sm text-slate-500"><Mail className="mb-3 h-8 w-8" />Select an Inbox message.</div> : null}
        {detail ? (
          <>
            <header className="flex shrink-0 items-start gap-3 border-b border-white/[0.08] p-3 sm:p-4">
              <button type="button" onClick={() => setMobileDetailOpen(false)} title="Back to Inbox" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 text-slate-300 xl:hidden"><ArrowLeft className="h-4 w-4" /></button>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-bold text-white">{detail.message.subject || '(No subject)'}</h2>
                <p className="mt-1 truncate text-xs text-slate-500">{detail.message.from_display_name || detail.message.from_email || 'Unknown sender'} · {formatDate(detail.message.created_at)}</p>
                <p className="mt-1 truncate text-[10px] text-slate-600">To {detail.message.route_address}</p>
              </div>
              <button type="button" onClick={() => void patchMessageState(detail.message.inbound_email_id, detail.message.admin_read_at ? 'mark_unread' : 'mark_read')} disabled={actionPending} title={detail.message.admin_read_at ? 'Mark unread' : 'Mark read'} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-slate-300 disabled:opacity-50">{detail.message.admin_read_at ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}</button>
              <button type="button" onClick={() => void patchMessageState(detail.message.inbound_email_id, detail.message.archived_at ? 'restore' : 'archive')} disabled={actionPending} title={detail.message.archived_at ? 'Restore' : 'Archive'} className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-slate-300 disabled:opacity-50">{detail.message.archived_at ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</button>
            </header>
            {detailError ? <div role="alert" className="border-b border-rose-400/15 bg-rose-400/[0.07] px-4 py-2 text-xs text-rose-200">{detailError}</div> : null}
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6">
              {detail.message.processing_status !== 'processed' ? (
                <div className="rounded-xl border border-rose-400/20 bg-rose-400/[0.07] p-4 text-sm text-rose-100">
                  <div className="flex items-center gap-2 font-bold"><CircleAlert className="h-4 w-4" />Message processing is incomplete</div>
                  <p className="mt-2 text-xs leading-5 text-rose-200/75">{detail.message.last_error || 'The message can be reclaimed from its durable envelope.'}</p>
                  <button type="button" onClick={() => void retryProcessing()} disabled={actionPending} className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg bg-rose-200 px-3 text-xs font-bold text-rose-950 disabled:opacity-50"><RefreshCw className="h-3.5 w-3.5" />Retry processing</button>
                </div>
              ) : (
                <article className="whitespace-pre-wrap text-sm leading-7 text-slate-200">{detail.message.body_text || '(Empty message body)'}</article>
              )}
              {detail.message.attachment_count > 0 || detail.message.attachment_error ? (
                <InboundAttachmentList
                  attachments={detail.attachments}
                  envelopeError={detail.message.attachment_error}
                />
              ) : null}
              {detail.replies.map((reply) => (
                <div key={reply.reply_id} className="ml-auto max-w-2xl rounded-xl border border-sky-300/15 bg-sky-300/[0.07] p-4">
                  <div className="flex items-center justify-between gap-3 text-[10px] text-slate-500"><span>{reply.from_email}</span><span className={reply.delivery_status === 'failed' ? 'text-rose-300' : ''}>{reply.delivery_status}</span></div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-200">{reply.body_text}</p>
                  {reply.delivery_error ? <p className="mt-2 text-xs text-rose-300">{reply.delivery_error}</p> : null}
                </div>
              ))}
            </div>
            <footer className="shrink-0 border-t border-white/[0.08] bg-slate-950/55 p-3 sm:p-4">
              {detail.message.processing_status !== 'processed' || !detail.message.from_email ? (
                <p className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-xs text-slate-500">A safe sender and completed processing are required before replying.</p>
              ) : (
                <>
                  <label className="block"><span className="sr-only">Reply</span><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={3} maxLength={20000} placeholder="Write a reply..." className="w-full resize-none rounded-xl border border-white/10 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-amber-300/60" /></label>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-[10px] text-slate-600">From and Reply-To are selected by the server.</p>
                    <button type="button" onClick={() => void sendReply()} disabled={sending || !draft.trim()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-amber-400 px-4 text-xs font-bold text-slate-950 disabled:opacity-50">{sending ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}Send</button>
                  </div>
                  {sendError ? <p role="alert" className="mt-2 text-xs text-rose-300">{sendError}</p> : null}
                </>
              )}
            </footer>
          </>
        ) : null}
      </section>
    </div>
  )
}
