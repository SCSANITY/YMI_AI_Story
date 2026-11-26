'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Inbox,
  Mail,
  PanelRightClose,
  Paperclip,
  Reply,
  Send,
} from 'lucide-react'
import type { FinalJobSummary } from '@/lib/finalReview'
import { proofReplyDueAt, proofReviewLabel } from '@/lib/proof-review-clock'
import type { ProofThread, ProofThreadPage, proofThreadForRecipient } from '@/lib/proof-correspondence'
import './proof-replies.css'

const date = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Hong_Kong',
})
const format = (value: string | number) => date.format(new Date(value)) + ' HKT'
type Reader = NonNullable<ReturnType<typeof proofThreadForRecipient>>
type Draft = { text: string; requestId: string }
type Drafts = Map<string, Draft>

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { ...options, cache: 'no-store', credentials: 'same-origin' })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Correspondence unavailable')
  return data as T
}

function Conversation({
  url,
  thread,
  recipient,
  back,
  drafts,
}: {
  url: string
  thread: ProofThread
  recipient: string
  back: () => void
  drafts: Drafts
}) {
  const [reader, setReader] = useState<Reader | null>(null)
  const [error, setError] = useState('')
  const [reload, refresh] = useState(0)
  const [draft, setDraft] = useState(drafts.get(thread.threadId))
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const sending = useRef(false)
  const endpoint = url + '&thread=' + thread.threadId
  useEffect(() => {
    const controller = new AbortController()
    request<Reader>(endpoint, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setReader(data)
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    return () => controller.abort()
  }, [endpoint, reload])
  function saveDraft(next?: Draft) {
    if (next) drafts.set(thread.threadId, next)
    else drafts.delete(thread.threadId)
    setDraft(next)
  }
  async function send() {
    if (!draft?.text.trim() || sending.current) return
    sending.current = true
    setBusy(true)
    setError('')
    try {
      await request(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: draft.text, requestId: draft.requestId }),
      })
      if (drafts.get(thread.threadId)?.requestId === draft.requestId) saveDraft()
      setSent(true)
      refresh((n) => n + 1)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to send reply')
    } finally {
      sending.current = false
      setBusy(false)
    }
  }
  return (
    <>
      <button type="button" className="rd-back" onClick={back} disabled={busy}>
        <ArrowLeft size={14} />
        All conversations
      </button>
      <section className="rd-thread" aria-label="Messages">
        <h3>{thread.subject}</h3>
        {!reader && !error && <p role="status">Loading messages…</p>}
        {reader?.messages.map((m) => {
          const inbound = m.direction === 'inbound'
          return (
            <article key={m.messageId} className={'rd-msg ' + m.direction}>
              <div className="rd-by">
                <span className="rd-avatar" aria-hidden>
                  {inbound ? recipient[0].toUpperCase() : <Mail size={14} />}
                </span>
                <strong>{inbound ? recipient.split('@')[0] : 'YMI Story · Delivery'}</strong>
                <time dateTime={m.occurredAt}>{format(m.occurredAt)}</time>
              </div>
              <p>{m.bodyText}</p>
              {m.attachments.map((a) => (
                <a
                  className="rd-attachment"
                  key={a.attachmentId}
                  href={'/api/admin/mail/attachments/' + a.attachmentId + '/download'}
                >
                  <Paperclip size={13} />
                  {a.fileName}
                </a>
              ))}
              {!inbound && !['sent', 'delivered'].includes(m.state) && (
                <small>{m.state.replaceAll('_', ' ')}</small>
              )}
            </article>
          )
        })}
      </section>
      <footer className="rd-footer">
        {error && (
          <div role="alert" className="rd-error">
            {error}{' '}
            <button
              onClick={() => {
                setError('')
                refresh((n) => n + 1)
              }}
            >
              Refresh conversation
            </button>
          </div>
        )}
        {reader &&
          (reader.canReply ? (
            draft ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void send()
                }}
              >
                <label htmlFor="rd-response">Reply to {recipient}</label>
                <textarea
                  id="rd-response"
                  autoFocus
                  placeholder="Write your reply…"
                  value={draft.text}
                  disabled={busy}
                  maxLength={50000}
                  onChange={(e) => saveDraft({ text: e.target.value, requestId: crypto.randomUUID() })}
                />
                <div className="rd-actions">
                  <button type="button" className="rd-quiet" disabled={busy} onClick={() => saveDraft()}>
                    Discard draft
                  </button>
                  <button className="rd-send" disabled={busy || !draft.text.trim()}>
                    <Send size={14} />
                    {busy ? 'Sending…' : 'Send reply'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="rd-actions">
                <small role="status">
                  {sent ? (
                    <>
                      <Check size={12} />
                      Reply sent
                    </>
                  ) : (
                    'delivery@ymistory.com'
                  )}
                </small>
                <button
                  type="button"
                  className="rd-send"
                  onClick={() => {
                    saveDraft({ text: '', requestId: crypto.randomUUID() })
                    setSent(false)
                  }}
                >
                  <Reply size={15} />
                  Reply
                </button>
              </div>
            )
          ) : (
            <small>
              The latest sender has changed. Review the full conversation in Inbox before replying.
            </small>
          ))}
      </footer>
    </>
  )
}

function Drawer({
  job,
  cover,
  close,
  drafts,
}: {
  job: FinalJobSummary
  cover?: string | null
  close: () => void
  drafts: Drafts
}) {
  const node = useRef<HTMLDialogElement>(null)
  const backdrop = useRef(false)
  const [page, setPage] = useState<ProofThreadPage | null>(null)
  const [active, select] = useState<string | null>(null)
  const [expanded, expand] = useState(false)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, refresh] = useState(0)
  const url =
    '/api/admin/final-jobs/' +
    job.final_job_id +
    '/replies?' +
    new URLSearchParams({
      order: job.order_id,
      item: job.cart_item_id,
      revision: String(job.proof_revision ?? 1),
    })
  const sentAt = Date.parse(job.email_sent_at!)
  useEffect(() => {
    const controller = new AbortController()
    request<ProofThreadPage>(url + '&offset=' + offset, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return
        setPage((previous) => {
          const threads = offset ? (previous?.threads ?? []) : []
          const seen = new Set(threads.map((t) => t.threadId))
          return { ...data, threads: [...threads, ...data.threads.filter((t) => !seen.has(t.threadId))] }
        })
        if (!offset) {
          const newer = data.threads.filter((t) => Date.parse(t.lastInboundAt) >= sentAt)
          if (newer.length === 1 && data.nextOffset === null) select(newer[0].threadId)
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [url, offset, sentAt, reload])
  useLayoutEffect(() => {
    const dialog = node.current!
    dialog.showModal()
    dialog.querySelector<HTMLButtonElement>('.rd-close')?.focus({ preventScroll: true })
    return () => dialog.close()
  }, [])
  const threads = page?.threads ?? []
  const activeThread = threads.find((t) => t.threadId === active)
  const newer = threads.filter((t) => Date.parse(t.lastInboundAt) >= sentAt)
  const earlier = threads.filter((t) => Date.parse(t.lastInboundAt) < sentAt)
  function row(t: ProofThread) {
    return (
      <button type="button" className="rd-row" key={t.threadId} onClick={() => select(t.threadId)}>
        <span className="rd-row-copy">
          <strong>{t.subject}</strong>
          <small>{format(t.lastInboundAt)}</small>
          <span>{t.preview}</span>
        </span>
        <ChevronRight className="rd-row-arrow" size={20} />
      </button>
    )
  }
  const outside = (x: number) => {
    const r = node.current!.getBoundingClientRect()
    return x < r.left || x >= r.right
  }
  return createPortal(
    <dialog
      className="rd-panel"
      id="rd-panel"
      ref={node}
      aria-labelledby="rd-title"
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          close()
        }
      }}
      onPointerDown={(e) => {
        backdrop.current = e.target === node.current && outside(e.clientX)
      }}
      onClick={(e) => {
        if (backdrop.current && e.target === node.current && outside(e.clientX)) close()
        backdrop.current = false
      }}
    >
      <header className="rd-head">
        <div>
          <div className="rd-kicker">
            <Mail size={14} />
            Delivery
          </div>
          <h2 id="rd-title">Customer correspondence</h2>
        </div>
        <button type="button" className="rd-close" onClick={close}>
          <PanelRightClose size={16} />
          Hide replies
        </button>
      </header>
      <div className="rd-context">
        {cover ? (
          // Signed proof cover is already authorised for the active review.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" width={42} height={42} />
        ) : (
          <BookOpen size={28} />
        )}
        <div>
          <strong>{job.display_title}</strong>
          <div className="rd-meta">
            <span>
              {job.orders?.display_id || job.order_id.slice(0, 8)} · PDF Rev {job.proof_revision ?? 1}
            </span>
            <small>{page?.recipient}</small>
          </div>
        </div>
      </div>
      {activeThread && page ? (
        <Conversation
          key={activeThread.threadId}
          url={url}
          thread={activeThread}
          recipient={page.recipient}
          back={() => select(null)}
          drafts={drafts}
        />
      ) : (
        <section className="rd-list">
          {page && (
            <>
              <h3>
                Since this PDF was sent <span>{newer.length}</span>
              </h3>
              {newer.map(row)}
              {!newer.length && (
                <div className="rd-empty">
                  <Inbox size={25} />
                  <strong>
                    {earlier.length ? 'No new replies since delivery' : 'No replies found from this address'}
                  </strong>
                  <small>{page.recipient}</small>
                </div>
              )}
              {!!earlier.length && (
                <>
                  <button
                    type="button"
                    className="rd-older"
                    aria-expanded={expanded}
                    onClick={() => expand(!expanded)}
                  >
                    <ChevronDown size={14} />
                    Earlier conversations <small>{earlier.length}</small>
                  </button>
                  {expanded && earlier.map(row)}
                </>
              )}
            </>
          )}
          {loading && <p role="status">Loading conversations…</p>}
          {error && (
            <div role="alert" className="rd-error">
              {error}{' '}
              <button
                onClick={() => {
                  setError('')
                  setLoading(true)
                  refresh((n) => n + 1)
                }}
              >
                Try again
              </button>
            </div>
          )}
          {page?.nextOffset != null && !loading && !error && (
            <button
              className="rd-older"
              onClick={() => {
                setLoading(true)
                setOffset(page.nextOffset!)
              }}
            >
              Load more
            </button>
          )}
        </section>
      )}
    </dialog>,
    document.body,
  )
}

export function ProofReplies({ job, cover }: { job: FinalJobSummary; cover?: string | null }) {
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const trigger = useRef<HTMLButtonElement>(null)
  const [drafts] = useState<Drafts>(() => new Map())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000)
    return () => clearInterval(timer)
  }, [])
  const label = proofReviewLabel(job, now)
  if (!label) return null
  const due = proofReplyDueAt(job)
  return (
    <section
      className={'rd-strip' + (due !== null && now >= due ? ' late' : '')}
      aria-label="Customer reply review"
    >
      <Clock3 size={18} />
      <div>
        <strong>{label}</strong>
        {due !== null && job.email_sent_at && (
          <small>
            PDF email sent {format(job.email_sent_at)} · Check from {format(due)}
          </small>
        )}
      </div>
      {due !== null && (
        <button
          type="button"
          className="rd-trigger"
          ref={trigger}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <Mail size={15} />
          Check replies
        </button>
      )}
      {open && due !== null && (
        <Drawer
          job={job}
          cover={cover}
          drafts={drafts}
          close={() => {
            setOpen(false)
            requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }))
          }}
        />
      )}
    </section>
  )
}
