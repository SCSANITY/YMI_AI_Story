'use client'

import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react'
import {
  Archive, ArrowLeft, Check, ChevronDown, FilePenLine, Forward, Inbox, LoaderCircle,
  Mail, MailOpen, Paperclip, PenLine, Reply, ReplyAll, RotateCcw, Search, Send,
} from 'lucide-react'
import { GeneralMailComposer, type GeneralMailEditableDraft } from './GeneralMailComposer'
import { GeneralMailDocumentView } from './GeneralMailRichText'
import { AdminEmailMessageCard, AdminEmailThread } from '@/components/admin/email/AdminEmailThread'
import {
  AdminButton, AdminEmptyState, AdminIconButton, AdminNotice, AdminStatusBadge, adminFieldClass,
} from '@/components/admin/AdminUi'
import { handleAdminTabKeyDown } from '@/components/admin/adminA11y'
import { GENERAL_MAILBOX_DEFINITIONS, type GeneralMailboxKey } from '@/lib/general-inbox-mailboxes'
import type {
  GeneralMailFolder, GeneralMailMailboxCount, GeneralMailThreadDetail, GeneralMailThreadSummary,
} from '@/lib/general-mail-workspace'
import { mergeGeneralMailThreadRefresh } from '@/lib/general-mail-workspace'

type MailboxView = GeneralMailMailboxCount & { address: string }
type ComposerState = {
  mode: 'new' | 'reply' | 'reply_all' | 'forward'
  threadId?: string | null
  initialTo?: string[]
  initialCc?: string[]
  initialSubject?: string
  initialBody?: string
  existingDraft?: GeneralMailEditableDraft | null
}

const FOLDERS: Array<{ key: GeneralMailFolder; label: string; icon: typeof Inbox }> = [
  { key: 'inbox', label: 'Inbox', icon: Inbox },
  { key: 'sent', label: 'Sent', icon: Send },
  { key: 'drafts', label: 'Drafts', icon: FilePenLine },
  { key: 'archived', label: 'Archived', icon: Archive },
]
const POLL_INTERVAL_MS = 30_000
const THREAD_PAGE_SIZE = 50

function formatDate(value: string, compact = false) {
  return new Intl.DateTimeFormat('en-US', compact
    ? { month: 'short', day: 'numeric' }
    : { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function statusTone(state: string) {
  if (['delivered', 'received'].includes(state)) return 'success' as const
  if (['failed', 'bounced', 'complained', 'suppressed'].includes(state)) return 'danger' as const
  if (['pending', 'queued', 'delivery_delayed'].includes(state)) return 'warning' as const
  return 'neutral' as const
}

function fileSize(bytes: number | null) {
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function displayAddress(value: string) {
  return value.split('@')[0] || value
}

export function GeneralInbox() {
  const [mailboxes, setMailboxes] = useState<MailboxView[]>([])
  const [mailboxKey, setMailboxKey] = useState<GeneralMailboxKey>('admin')
  const [folder, setFolder] = useState<GeneralMailFolder>('inbox')
  const [threads, setThreads] = useState<GeneralMailThreadSummary[]>([])
  const [totalThreads, setTotalThreads] = useState(0)
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null)
  const [detail, setDetail] = useState<GeneralMailThreadDetail | null>(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const [mobileColumn, setMobileColumn] = useState<'threads' | 'reader'>('threads')
  const [mailboxMenuOpen, setMailboxMenuOpen] = useState(false)
  const [composer, setComposer] = useState<ComposerState | null>(null)
  const [actionPending, setActionPending] = useState(false)
  const listIntentRef = useRef(0)
  const detailIntentRef = useRef(0)
  const threadCountRef = useRef(0)
  const mailboxMenuRef = useRef<HTMLDivElement>(null)
  const deferredSearch = useDeferredValue(search.trim())

  const currentMailbox = mailboxes.find((mailbox) => mailbox.mailboxKey === mailboxKey)
  const currentMailboxDefinition = GENERAL_MAILBOX_DEFINITIONS.find((mailbox) => mailbox.key === mailboxKey)
  const mailboxAddress = currentMailbox?.address
    ?? `${GENERAL_MAILBOX_DEFINITIONS.find((mailbox) => mailbox.key === mailboxKey)?.localPart ?? mailboxKey}@ymistory.com`

  const loadMailboxes = useCallback(async () => {
    const response = await fetch('/api/admin/mail/mailboxes', { cache: 'no-store', credentials: 'include' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data?.error || 'Failed to load mailboxes')
    setMailboxes(Array.isArray(data?.mailboxes) ? data.mailboxes : [])
  }, [])

  const loadThreads = useCallback(async (silent = false, append = false, replace = false) => {
    const intent = ++listIntentRef.current
    const offset = append ? threadCountRef.current : 0
    if (append) setLoadingMore(true)
    else if (!silent) setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        mailboxKey,
        folder,
        limit: String(THREAD_PAGE_SIZE),
        offset: String(offset),
      })
      if (deferredSearch) params.set('search', deferredSearch)
      const response = await fetch(`/api/admin/mail/threads?${params}`, { cache: 'no-store', credentials: 'include' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to load mail')
      if (listIntentRef.current !== intent) return
      const next = Array.isArray(data?.threads) ? data.threads as GeneralMailThreadSummary[] : []
      setThreads((current) => {
        const knownIds = new Set(current.map((thread) => thread.threadId))
        const merged = replace
          ? next
          : append
            ? [...current, ...next.filter((thread) => !knownIds.has(thread.threadId))]
            : mergeGeneralMailThreadRefresh(current, next)
        threadCountRef.current = merged.length
        return merged
      })
      setTotalThreads(Number.isFinite(Number(data?.total)) ? Number(data.total) : 0)
      if (replace) {
        setSelectedThreadId((current) => current && next.some((thread) => thread.threadId === current)
          ? current : next[0]?.threadId ?? null)
      }
    } catch (loadError) {
      if (listIntentRef.current === intent) setError(loadError instanceof Error ? loadError.message : 'Failed to load mail')
    } finally {
      if (listIntentRef.current === intent) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [deferredSearch, folder, mailboxKey])

  const loadDetail = useCallback(async (threadId: string, silent = false) => {
    const intent = ++detailIntentRef.current
    if (!silent) setDetailLoading(true)
    try {
      const response = await fetch(`/api/admin/mail/threads/${threadId}`, { cache: 'no-store', credentials: 'include' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to load conversation')
      if (detailIntentRef.current !== intent) return
      const next = data.thread as GeneralMailThreadDetail
      setDetail(next)
      if (!next.adminReadAt && next.messages.some((message) => message.direction === 'inbound')) {
        void fetch(`/api/admin/mail/threads/${threadId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ action: 'mark_read' }),
        }).then(() => {
          setDetail((current) => current?.threadId === threadId ? { ...current, adminReadAt: new Date().toISOString() } : current)
          void loadMailboxes()
        }).catch(() => undefined)
      }
    } catch (loadError) {
      if (detailIntentRef.current === intent) setError(loadError instanceof Error ? loadError.message : 'Failed to load conversation')
    } finally {
      if (detailIntentRef.current === intent) setDetailLoading(false)
    }
  }, [loadMailboxes])

  useEffect(() => {
    void loadMailboxes().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Failed to load mailboxes'))
  }, [loadMailboxes])

  useEffect(() => {
    if (!mailboxMenuOpen) return
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!mailboxMenuRef.current?.contains(event.target as Node)) setMailboxMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMailboxMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnPointerDown)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [mailboxMenuOpen])

  useEffect(() => {
    setThreads([])
    threadCountRef.current = 0
    setTotalThreads(0)
    setSelectedThreadId(null)
    setDetail(null)
    setMobileColumn('threads')
    void loadThreads(false, false, true)
  }, [loadThreads])

  useEffect(() => {
    if (!selectedThreadId) {
      setDetail(null)
      return
    }
    setDetail((current) => current?.threadId === selectedThreadId ? current : null)
    void loadDetail(selectedThreadId)
    return () => { detailIntentRef.current += 1 }
  }, [loadDetail, selectedThreadId])

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      void loadMailboxes()
      void loadThreads(true)
      if (selectedThreadId) void loadDetail(selectedThreadId, true)
    }
    const timer = window.setInterval(refresh, POLL_INTERVAL_MS)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [loadDetail, loadMailboxes, loadThreads, selectedThreadId])

  const patchThread = async (action: 'mark_read' | 'mark_unread' | 'archive' | 'restore') => {
    if (!selectedThreadId || actionPending) return
    setActionPending(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/mail/threads/${selectedThreadId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ action }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to update conversation')
      const leavesCurrentFolder = (folder === 'inbox' && action === 'archive')
        || (folder === 'archived' && action === 'restore')
      if (leavesCurrentFolder) {
        const remaining = threads.filter((thread) => thread.threadId !== selectedThreadId)
        setThreads(remaining)
        threadCountRef.current = remaining.length
        setTotalThreads((current) => Math.max(0, current - 1))
        setSelectedThreadId(remaining[0]?.threadId ?? null)
      }
      await Promise.all([loadThreads(true), loadMailboxes()])
      if (action === 'archive' || action === 'restore') setDetail(null)
      else setDetail((current) => current ? { ...current, adminReadAt: action === 'mark_read' ? new Date().toISOString() : null } : current)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Failed to update conversation')
    } finally {
      setActionPending(false)
    }
  }

  const openDraft = async (messageId: string) => {
    setActionPending(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/mail/drafts/${messageId}`, { cache: 'no-store', credentials: 'include' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to load draft')
      setComposer({
        mode: data.draft?.in_reply_to ? 'reply' : 'new',
        threadId: data.draft?.thread_id,
        existingDraft: data.draft,
      })
      setMobileColumn('reader')
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : 'Failed to load draft')
    } finally {
      setActionPending(false)
    }
  }

  const latestInbound = detail ? [...detail.messages].reverse().find((message) => message.direction === 'inbound') : null
  const latestMessage = detail?.messages[detail.messages.length - 1] ?? null
  const refreshWorkspace = () => {
    void Promise.all([loadMailboxes(), loadThreads(true)])
    if (selectedThreadId) void loadDetail(selectedThreadId, true)
  }
  const openComposer = (next: ComposerState) => {
    setMailboxMenuOpen(false)
    setComposer(next)
    setMobileColumn('reader')
  }
  const closeComposer = () => {
    setComposer(null)
    setMobileColumn(detail ? 'reader' : 'threads')
  }

  return (
    <div className="admin-v2-comm-workspace min-h-0 min-w-0 flex-1 xl:flex xl:h-full">
      <aside className={`${!composer && mobileColumn === 'threads' ? 'flex' : 'hidden'} admin-v2-comm-queue min-h-0 w-full shrink-0 flex-col border-b border-[var(--admin-line)] xl:flex xl:w-[25rem] xl:border-b-0 xl:border-r`}>
        <div className="admin-v2-comm-toolbar space-y-3 border-b p-3">
          <div className="flex items-center gap-2">
            <div ref={mailboxMenuRef} className="relative min-w-0 flex-1">
              <button type="button" aria-haspopup="menu" aria-expanded={mailboxMenuOpen} disabled={Boolean(composer)} onClick={() => setMailboxMenuOpen((open) => !open)} className="admin-v2-comm-item flex h-11 w-full min-w-0 items-center gap-2 px-3 text-left disabled:cursor-default disabled:opacity-60">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--admin-accent)_20%,var(--admin-card))] text-xs font-bold text-[var(--admin-page-ink)]">{currentMailboxDefinition?.displayName.charAt(0) ?? 'M'}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-[var(--admin-page-ink)]">{currentMailboxDefinition?.displayName ?? 'Mailbox'}</span><span className="block truncate text-[10px] text-[var(--admin-page-muted)]">{mailboxAddress}</span></span>
                {currentMailbox?.unread ? <span className="rounded-full bg-[var(--admin-accent)] px-2 py-0.5 text-[10px] font-bold text-[var(--admin-accent-ink)]">{currentMailbox.unread}</span> : null}
                <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--admin-page-muted)] transition-transform ${mailboxMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {mailboxMenuOpen ? <div role="menu" aria-label="Mailboxes" className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-50 space-y-1 rounded-xl border border-[var(--admin-card-line)] bg-[color-mix(in_srgb,var(--admin-card)_94%,transparent)] p-1.5 shadow-[var(--admin-card-sh)] backdrop-blur-xl">
                {GENERAL_MAILBOX_DEFINITIONS.map((definition) => {
                  const mailbox = mailboxes.find((candidate) => candidate.mailboxKey === definition.key)
                  const active = mailboxKey === definition.key
                  return <button key={definition.key} type="button" role="menuitemradio" aria-checked={active} onClick={() => { setMailboxKey(definition.key); setMailboxMenuOpen(false); setMobileColumn('threads') }} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left transition ${active ? 'bg-[color-mix(in_srgb,var(--admin-accent)_18%,var(--admin-card))]' : 'hover:bg-[color-mix(in_srgb,var(--admin-card)_78%,transparent)]'}`}>
                    <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-[var(--admin-page-ink)]">{definition.displayName}</span><span className="block truncate text-[10px] text-[var(--admin-page-muted)]">{mailbox?.address}</span></span>
                    {mailbox?.unread ? <span className="text-xs font-bold text-[var(--admin-accent-dp)]">{mailbox.unread}</span> : null}
                    {active ? <Check className="h-4 w-4 text-[var(--admin-accent-dp)]" /> : null}
                  </button>
                })}
              </div> : null}
            </div>
            <AdminButton type="button" tone="primary" onClick={() => openComposer({ mode: 'new' })} disabled={Boolean(composer)} className="px-3"><PenLine className="h-4 w-4" />New</AdminButton>
          </div>
          <div className="grid grid-cols-4 gap-1" role="tablist" aria-label="Mail folders">
            {FOLDERS.map(({ key, label, icon: Icon }) => <button key={key} type="button" role="tab" aria-selected={folder === key} aria-controls="general-mail-thread-list" tabIndex={folder === key ? 0 : -1} onKeyDown={handleAdminTabKeyDown} onClick={() => setFolder(key)} disabled={Boolean(composer)} className={`admin-v2-comm-tab min-w-0 px-1.5 py-2 text-[11px] disabled:cursor-default disabled:opacity-60 ${folder === key ? 'admin-v2-comm-tab--active' : ''}`}><span className="flex items-center justify-center gap-1.5"><Icon className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{label}</span></span><span className="mt-0.5 block text-[9px] opacity-75">{currentMailbox?.[key] ?? 0}</span></button>)}
          </div>
          <label className="relative block"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--admin-page-muted)]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search mail" className={`${adminFieldClass} mt-0 h-10 min-h-10 pl-9`} /></label>
          <p className="text-[10px] text-[var(--admin-page-muted)]">{threads.length} of {totalThreads}</p>
        </div>
        <div id="general-mail-thread-list" className="admin-v2-comm-scroll min-h-0 max-h-[34rem] flex-1 overflow-y-auto p-2 xl:max-h-none">
          {error ? <AdminNotice tone="danger" className="m-2">{error}</AdminNotice> : null}
          {!loading && threads.length === 0 ? <AdminEmptyState className="flex min-h-52 items-center justify-center border-0 bg-transparent">{deferredSearch ? 'No matching mail.' : 'No mail in this folder.'}</AdminEmptyState> : null}
          <div className="space-y-1.5">{threads.map((thread) => {
            const selected = thread.threadId === selectedThreadId
            const unread = thread.lastInboundAt && !thread.adminReadAt && !thread.archivedAt
            return <button key={thread.threadId} type="button" disabled={Boolean(composer)} onClick={() => { setSelectedThreadId(thread.threadId); setMobileColumn('reader') }} className={`admin-v2-comm-item w-full p-3 text-left disabled:cursor-default ${selected ? 'admin-v2-comm-item--selected' : ''}`}>
              <div className="flex items-start justify-between gap-3"><p className={`truncate text-sm text-[var(--admin-page-ink)] ${unread ? 'font-bold' : 'font-semibold'}`}>{thread.latestDirection === 'inbound' ? displayAddress(thread.latestFrom) : thread.latestTo.map(displayAddress).join(', ')}</p><time className="shrink-0 text-[10px] text-[var(--admin-page-muted)]">{formatDate(thread.latestMessageAt, true)}</time></div>
              <p className={`mt-1 truncate text-xs text-[var(--admin-page-ink)] ${unread ? 'font-bold' : ''}`}>{thread.subject}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--admin-page-muted)]">{thread.preview || thread.latestState}</p>
              <div className="mt-2 flex items-center justify-between text-[10px] text-[var(--admin-page-muted)]"><AdminStatusBadge tone={statusTone(thread.latestState)}>{thread.latestState.replaceAll('_', ' ')}</AdminStatusBadge>{thread.attachmentCount ? <span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3" />{thread.attachmentCount}</span> : null}</div>
            </button>
          })}</div>
          {threads.length < totalThreads ? <AdminButton type="button" onClick={() => void loadThreads(false, true)} disabled={loadingMore} className="mt-3 w-full justify-center">{loadingMore ? 'Loading...' : 'Load more'}</AdminButton> : null}
        </div>
      </aside>

      <section className={`${composer || mobileColumn === 'reader' ? 'flex' : 'hidden'} admin-v2-comm-canvas min-h-[38rem] min-w-0 flex-1 flex-col xl:flex xl:min-h-0`}>
        {composer ? <GeneralMailComposer
          key={`${composer.mode}:${composer.existingDraft?.message_id ?? composer.threadId ?? 'new'}`}
          mailboxKey={composer.existingDraft?.mailbox_key ?? mailboxKey}
          mailboxAddress={mailboxAddress}
          {...composer}
          onClose={closeComposer}
          onCommitted={refreshWorkspace}
        /> : detail ? <>
          <header className="flex shrink-0 items-start gap-2 border-b border-[var(--admin-line)] p-3 sm:p-4">
            <AdminIconButton type="button" onClick={() => setMobileColumn('threads')} title="Back to messages" className="h-9 min-h-9 w-9 basis-9 xl:hidden"><ArrowLeft className="h-4 w-4" /></AdminIconButton>
            <div className="min-w-0 flex-1"><h2 className="truncate text-base font-bold text-[var(--admin-page-ink)]">{detail.subject}</h2><p className="mt-1 text-xs text-[var(--admin-page-muted)]">{detail.messages.length} message{detail.messages.length === 1 ? '' : 's'} / {mailboxAddress}</p></div>
            <AdminIconButton type="button" onClick={() => void patchThread(detail.adminReadAt ? 'mark_unread' : 'mark_read')} disabled={actionPending} title={detail.adminReadAt ? 'Mark unread' : 'Mark read'} className="h-9 min-h-9 w-9 basis-9">{detail.adminReadAt ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}</AdminIconButton>
            <AdminIconButton type="button" onClick={() => void patchThread(detail.archivedAt ? 'restore' : 'archive')} disabled={actionPending} title={detail.archivedAt ? 'Restore' : 'Archive'} className="h-9 min-h-9 w-9 basis-9">{detail.archivedAt ? <RotateCcw className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</AdminIconButton>
          </header>
          {detail.isSeparateConversation ? <AdminNotice tone="warning" className="m-3 mb-0">Separate conversation. The sender&apos;s mail client did not provide a uniquely matchable thread reference.</AdminNotice> : null}
          <div className="admin-v2-comm-scroll min-h-0 flex-1 overflow-y-auto px-3 py-5 sm:px-5"><AdminEmailThread>{detail.messages.map((message) => <AdminEmailMessageCard
            key={message.messageId} direction={message.direction} senderName={message.direction === 'outbound' ? 'YMI Story' : displayAddress(message.from)} senderEmail={message.from} roleLabel={message.direction === 'outbound' ? 'YMI' : 'Sender'} timestamp={formatDate(message.occurredAt)} statusLabel={message.state.replaceAll('_', ' ')} statusTone={statusTone(message.state)} deliveryError={message.deliveryError}
            body={message.direction === 'outbound' && message.bodyDocument ? <GeneralMailDocumentView document={message.bodyDocument} /> : <span className="whitespace-pre-wrap">{message.bodyText || '(No message body)'}</span>}
            attachmentContent={message.attachments.length ? <div className="flex flex-wrap gap-2">{message.attachments.map((attachment) => <a key={attachment.attachmentId} href={`/api/admin/mail/attachments/${attachment.attachmentId}/download`} className="inline-flex items-center gap-2 rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-card)] px-3 py-2 text-xs font-semibold text-[var(--admin-page-ink)] hover:border-[var(--admin-accent-dp)]"><Paperclip className="h-3.5 w-3.5" />{attachment.fileName}<span className="font-normal text-[var(--admin-page-muted)]">{fileSize(attachment.sizeBytes)}</span></a>)}</div> : null}
            footer={message.state === 'draft' || message.state === 'failed' ? <AdminButton type="button" onClick={() => void openDraft(message.messageId)} disabled={actionPending}><FilePenLine className="h-4 w-4" />Edit draft</AdminButton> : null}
          />)}</AdminEmailThread></div>
          <footer className="flex shrink-0 flex-wrap gap-2 border-t border-[var(--admin-line)] p-3 sm:p-4">
            <AdminButton type="button" onClick={() => openComposer({ mode: 'reply', threadId: detail.threadId, initialTo: latestInbound ? [latestInbound.from] : [], initialSubject: detail.subject })} disabled={!latestInbound}><Reply className="h-4 w-4" />Reply</AdminButton>
            <AdminButton type="button" onClick={() => openComposer({ mode: 'reply_all', threadId: detail.threadId, initialTo: latestInbound ? [latestInbound.from] : [], initialCc: latestInbound?.cc ?? [], initialSubject: detail.subject })} disabled={!latestInbound}><ReplyAll className="h-4 w-4" />Reply all</AdminButton>
            <AdminButton type="button" onClick={() => openComposer({ mode: 'forward', initialSubject: `Fwd: ${detail.subject.replace(/^fwd:\s*/i, '')}`, initialBody: latestMessage ? `\n\n---------- Forwarded message ----------\nFrom: ${latestMessage.from}\nDate: ${formatDate(latestMessage.occurredAt)}\nSubject: ${latestMessage.subject}\nTo: ${latestMessage.to.join(', ')}\n\n${latestMessage.bodyText}` : '' })} disabled={!latestMessage}><Forward className="h-4 w-4" />Forward</AdminButton>
          </footer>
        </> : detailLoading ? <div className="flex flex-1 items-center justify-center text-sm text-[var(--admin-page-muted)]"><LoaderCircle className="mr-2 h-5 w-5 animate-spin" />Loading conversation...</div> : <div className="flex flex-1 flex-col items-center justify-center text-sm text-[var(--admin-page-muted)]"><Mail className="mb-3 h-8 w-8" />Select a conversation.</div>}
      </section>

    </div>
  )
}
