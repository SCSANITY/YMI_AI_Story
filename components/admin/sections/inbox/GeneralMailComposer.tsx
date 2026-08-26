'use client'

import { useRef, useState } from 'react'
import { ArrowLeft, File as FileIcon, Paperclip, Save, Send, Trash2, UploadCloud, X } from 'lucide-react'
import { AdminButton, AdminIconButton, AdminNotice } from '@/components/admin/AdminUi'
import {
  GeneralMailRichEditor,
} from '@/components/admin/sections/inbox/GeneralMailRichText'
import { supabase } from '@/lib/supabase'
import type {
  GeneralMailContentBlock,
  GeneralMailDocument,
  GeneralMailInline,
} from '@/lib/general-mail-content'
import type { GeneralMailboxKey } from '@/lib/general-inbox-mailboxes'

type ComposerMode = 'new' | 'reply' | 'reply_all' | 'forward'

type DraftMessage = {
  message_id: string
  thread_id: string
  updated_at: string
  to_addresses: string[]
  cc_addresses: string[]
  subject: string
}

type DraftAttachment = {
  attachment_id: string
  original_filename: string | null
  safe_filename: string
  size_bytes: number | null
  attachment_state: string
}

const MAX_ATTACHMENTS = 10
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
const MAX_TOTAL_ATTACHMENT_BYTES = 25 * 1024 * 1024
const ACCEPTED_ATTACHMENTS = 'application/pdf,image/jpeg,image/png,image/webp,image/gif'
const ACCEPTED_ATTACHMENT_TYPES = new Set(ACCEPTED_ATTACHMENTS.split(','))
const ATTACHMENT_TYPE_BY_EXTENSION: Record<string, string> = {
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  pdf: 'application/pdf',
  png: 'image/png',
  webp: 'image/webp',
}

export type GeneralMailEditableDraft = DraftMessage & {
  mailbox_key: GeneralMailboxKey
  bcc_addresses: string[]
  body_document: GeneralMailDocument | null
  in_reply_to: string | null
  attachments: DraftAttachment[]
}

function plainDocument(text = ''): GeneralMailDocument {
  return { version: 1, blocks: [{ type: 'paragraph', content: [{ text }] }] }
}

function parseAddresses(value: string) {
  return value.split(/[;,]/).map((item) => item.trim().toLowerCase()).filter(Boolean)
}

function documentHasText(document: GeneralMailDocument) {
  return document.blocks.some((block) => block.type === 'bulletList' || block.type === 'orderedList'
    ? block.items.some((item) => item.some((inline) => inline.text.trim()))
    : (block as Extract<GeneralMailContentBlock, { content: GeneralMailInline[] }>).content.some((inline) => inline.text.trim()))
}

function messageFromResponse(value: unknown): DraftMessage | null {
  if (!value || typeof value !== 'object') return null
  const message = value as Partial<DraftMessage>
  return typeof message.message_id === 'string' && typeof message.updated_at === 'string'
    ? message as DraftMessage
    : null
}

function formatFileSize(bytes: number | null) {
  if (bytes === null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function resolveAttachmentContentType(file: File) {
  if (ACCEPTED_ATTACHMENT_TYPES.has(file.type)) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase() ?? ''
  return ATTACHMENT_TYPE_BY_EXTENSION[extension] ?? null
}

export function GeneralMailComposer({
  mailboxKey,
  mailboxAddress,
  mode,
  threadId,
  initialTo = [],
  initialCc = [],
  initialSubject = '',
  initialBody = '',
  existingDraft = null,
  onClose,
  onCommitted,
}: {
  mailboxKey: GeneralMailboxKey
  mailboxAddress: string
  mode: ComposerMode
  threadId?: string | null
  initialTo?: string[]
  initialCc?: string[]
  initialSubject?: string
  initialBody?: string
  existingDraft?: GeneralMailEditableDraft | null
  onClose: () => void
  onCommitted: () => void
}) {
  const requestIdRef = useRef(existingDraft?.message_id || crypto.randomUUID())
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [draftMessage, setDraftMessage] = useState<DraftMessage | null>(existingDraft)
  const [toValue, setToValue] = useState((existingDraft?.to_addresses ?? initialTo).join(', '))
  const [ccValue, setCcValue] = useState((existingDraft?.cc_addresses ?? initialCc).join(', '))
  const [bccValue, setBccValue] = useState((existingDraft?.bcc_addresses ?? []).join(', '))
  const [subject, setSubject] = useState(existingDraft?.subject ?? initialSubject)
  const [bodyDocument, setBodyDocument] = useState(() => existingDraft?.body_document ?? plainDocument(initialBody))
  const [attachments, setAttachments] = useState<DraftAttachment[]>(existingDraft?.attachments ?? [])
  const [pending, setPending] = useState<'save' | 'send' | 'upload' | 'delete' | null>(null)
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; fileName: string } | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [showCc, setShowCc] = useState(Boolean((existingDraft?.cc_addresses ?? initialCc).length))
  const [showBcc, setShowBcc] = useState(Boolean(existingDraft?.bcc_addresses.length))
  const dragDepthRef = useRef(0)
  const [error, setError] = useState('')
  const isThreadAction = mode === 'reply' || mode === 'reply_all'
  const allowBcc = !existingDraft?.in_reply_to && (mode === 'new' || mode === 'forward')
  const title = mode === 'new' ? 'New message' : mode === 'forward' ? 'Forward message' : mode === 'reply_all' ? 'Reply all' : 'Reply'

  const payload = () => ({
    requestId: requestIdRef.current,
    mailboxKey,
    to: parseAddresses(toValue),
    cc: parseAddresses(ccValue),
    bcc: allowBcc ? parseAddresses(bccValue) : [],
    subject,
    bodyDocument,
  })

  const saveDraft = async () => {
    const existing = draftMessage
    const response = existing
      ? await fetch(`/api/admin/mail/drafts/${existing.message_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ ...payload(), expectedUpdatedAt: existing.updated_at }),
        })
      : isThreadAction && threadId
        ? await fetch(`/api/admin/mail/threads/${threadId}/reply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              requestId: requestIdRef.current,
              mode,
              saveDraft: true,
              bodyDocument,
            }),
          })
        : await fetch('/api/admin/mail/drafts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload()),
          })
    const data = await response.json().catch(() => ({}))
    const message = messageFromResponse(data?.message)
    if (!response.ok || !message) throw new Error(data?.error || 'Failed to save draft')
    setDraftMessage(message)
    if (isThreadAction) {
      setToValue(message.to_addresses.join(', '))
      setCcValue(message.cc_addresses.join(', '))
      setSubject(message.subject)
    }
    return message
  }

  const handleSave = async () => {
    if (pending) return
    setPending('save')
    setError('')
    try {
      await saveDraft()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save draft')
    } finally {
      setPending(null)
    }
  }

  const handleSend = async () => {
    if (pending || !documentHasText(bodyDocument)) return
    setPending('send')
    setError('')
    try {
      const message = await saveDraft()
      const response = await fetch(`/api/admin/mail/drafts/${message.message_id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ expectedUpdatedAt: message.updated_at }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to send email')
      onCommitted()
      onClose()
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Failed to send email')
    } finally {
      setPending(null)
    }
  }

  const handleUploads = async (selectedFiles: File[]) => {
    if (pending || selectedFiles.length === 0) return
    const files = selectedFiles
    if (files.some((file) => file.size <= 0)) {
      setError('Empty files cannot be attached.')
      return
    }
    if (files.some((file) => !resolveAttachmentContentType(file))) {
      setError('Attachments must be PDF, JPG, PNG, WebP, or GIF files.')
      return
    }
    const existingBytes = attachments.reduce((total, attachment) => total + (attachment.size_bytes ?? 0), 0)
    if (attachments.length + files.length > MAX_ATTACHMENTS) {
      setError(`A message can include up to ${MAX_ATTACHMENTS} attachments.`)
      return
    }
    if (files.some((file) => file.size > MAX_ATTACHMENT_BYTES)) {
      setError('Each attachment must be 10 MB or smaller.')
      return
    }
    if (existingBytes + files.reduce((total, file) => total + file.size, 0) > MAX_TOTAL_ATTACHMENT_BYTES) {
      setError('Attachments can total up to 25 MB per message.')
      return
    }
    setPending('upload')
    setError('')
    try {
      let message = await saveDraft()
      for (const [index, file] of files.entries()) {
        setUploadProgress({ current: index + 1, total: files.length, fileName: file.name })
        const attachmentId = crypto.randomUUID()
        const response = await fetch(`/api/admin/mail/drafts/${message.message_id}/attachments/upload-url`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            attachmentId,
            expectedUpdatedAt: message.updated_at,
            fileName: file.name,
            contentType: resolveAttachmentContentType(file),
            sizeBytes: file.size,
          }),
        })
        const spec = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(spec?.error || `Failed to prepare ${file.name}`)
        if (typeof spec.messageUpdatedAt === 'string') {
          message = { ...message, updated_at: spec.messageUpdatedAt }
          setDraftMessage(message)
        }
        const uploadFile = new File([file], file.name, { type: 'application/octet-stream' })
        const { error: uploadError } = await supabase.storage
          .from(spec.bucket)
          .uploadToSignedUrl(spec.storagePath, spec.token, uploadFile, { contentType: 'application/octet-stream' })
        if (uploadError) throw new Error(uploadError.message)
        const confirmResponse = await fetch(`/api/admin/mail/drafts/${message.message_id}/attachments/${attachmentId}`, {
          method: 'POST',
          credentials: 'include',
        })
        const confirmed = await confirmResponse.json().catch(() => ({}))
        if (!confirmResponse.ok) throw new Error(confirmed?.error || `Failed to confirm ${file.name}`)
        if (typeof confirmed.messageUpdatedAt === 'string') {
          message = { ...message, updated_at: confirmed.messageUpdatedAt }
          setDraftMessage(message)
        }
        setAttachments((current) => [...current, confirmed.attachment])
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload attachment')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
      setUploadProgress(null)
      setPending(null)
    }
  }

  const removeAttachment = async (attachmentId: string) => {
    if (!draftMessage || pending) return
    setPending('delete')
    setError('')
    try {
      const response = await fetch(`/api/admin/mail/drafts/${draftMessage.message_id}/attachments/${attachmentId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to remove attachment')
      setDraftMessage((current) => current && data.messageUpdatedAt
        ? { ...current, updated_at: data.messageUpdatedAt }
        : current)
      setAttachments((current) => current.filter((attachment) => attachment.attachment_id !== attachmentId))
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Failed to remove attachment')
    } finally {
      setPending(null)
    }
  }

  const deleteDraft = async () => {
    if (!draftMessage || pending) return onClose()
    setPending('delete')
    try {
      const response = await fetch(`/api/admin/mail/drafts/${draftMessage.message_id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ expectedUpdatedAt: draftMessage.updated_at }),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'Failed to delete draft')
      }
      onCommitted()
      onClose()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete draft')
    } finally {
      setPending(null)
    }
  }

  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col bg-[color-mix(in_srgb,var(--admin-card)_72%,transparent)]"
      onDragEnter={(event) => { event.preventDefault(); dragDepthRef.current += 1; setDragActive(true) }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { event.preventDefault(); dragDepthRef.current -= 1; if (dragDepthRef.current <= 0) { dragDepthRef.current = 0; setDragActive(false) } }}
      onDrop={(event) => {
        event.preventDefault()
        dragDepthRef.current = 0
        setDragActive(false)
        void handleUploads(Array.from(event.dataTransfer.files))
      }}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--admin-line)] px-3 py-2 sm:px-4">
        <AdminIconButton type="button" onClick={onClose} disabled={Boolean(pending)} title="Back to mail" className="h-11 min-h-11 w-11 basis-11 xl:hidden"><ArrowLeft className="h-4 w-4" /></AdminIconButton>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-[var(--admin-page-ink)]">{title}</h2>
          <p className="truncate text-xs text-[var(--admin-page-muted)]">From {mailboxAddress}</p>
        </div>
        <AdminButton type="button" onClick={() => fileInputRef.current?.click()} disabled={Boolean(pending)} className="hidden sm:inline-flex">
          <Paperclip className="h-4 w-4" />
          Attach files
        </AdminButton>
        <AdminIconButton type="button" onClick={onClose} disabled={Boolean(pending)} title="Close composer" className="hidden h-11 min-h-11 w-11 basis-11 xl:inline-flex"><X className="h-4 w-4" /></AdminIconButton>
      </header>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_ATTACHMENTS}
        className="hidden"
        onChange={(event) => void handleUploads(Array.from(event.target.files ?? []))}
      />

      <div className="admin-v2-comm-scroll flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-3 sm:px-5">
        <div className="shrink-0 divide-y divide-[var(--admin-line)] border-b border-[var(--admin-line)]">
          <div className="flex min-h-12 items-center gap-2 py-1">
            <span className="w-14 shrink-0 text-xs font-semibold text-[var(--admin-page-muted)]">To</span>
            <input value={toValue} onChange={(event) => setToValue(event.target.value)} disabled={isThreadAction} className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-[var(--admin-page-ink)] outline-none disabled:opacity-70" placeholder="name@example.com" />
            {!isThreadAction ? <button type="button" onClick={() => setShowCc((current) => !current)} className="min-h-11 px-2 text-xs font-semibold text-[var(--admin-page-muted)] hover:text-[var(--admin-page-ink)]">Cc</button> : null}
            {allowBcc ? <button type="button" onClick={() => setShowBcc((current) => !current)} className="min-h-11 px-2 text-xs font-semibold text-[var(--admin-page-muted)] hover:text-[var(--admin-page-ink)]">Bcc</button> : null}
          </div>
          {showCc ? <div className="flex min-h-12 items-center gap-2 py-1"><span className="w-14 shrink-0 text-xs font-semibold text-[var(--admin-page-muted)]">Cc</span><input value={ccValue} onChange={(event) => setCcValue(event.target.value)} disabled={isThreadAction} className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-[var(--admin-page-ink)] outline-none disabled:opacity-70" placeholder="Optional" /></div> : null}
          {allowBcc && showBcc ? <div className="flex min-h-12 items-center gap-2 py-1"><span className="w-14 shrink-0 text-xs font-semibold text-[var(--admin-page-muted)]">Bcc</span><input value={bccValue} onChange={(event) => setBccValue(event.target.value)} className="min-h-11 min-w-0 flex-1 bg-transparent text-sm text-[var(--admin-page-ink)] outline-none" placeholder="Optional" /></div> : null}
          <div className="flex min-h-12 items-center gap-2 py-1"><span className="w-14 shrink-0 text-xs font-semibold text-[var(--admin-page-muted)]">Subject</span><input value={subject} onChange={(event) => setSubject(event.target.value)} disabled={isThreadAction} className="min-h-11 min-w-0 flex-1 bg-transparent text-sm font-semibold text-[var(--admin-page-ink)] outline-none disabled:opacity-70" placeholder="Add a subject" /></div>
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={Boolean(pending)}
          className="mt-3 flex min-h-16 shrink-0 items-center gap-3 rounded-lg border border-dashed border-[var(--admin-card-line)] bg-[color-mix(in_srgb,var(--admin-card)_56%,transparent)] px-4 text-left transition hover:border-[var(--admin-accent-dp)] hover:bg-[color-mix(in_srgb,var(--admin-accent)_8%,var(--admin-card))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent-dp)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--admin-accent)_16%,transparent)] text-[var(--admin-accent-dp)]">
            <UploadCloud className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-[var(--admin-page-ink)]">Attach files</span>
            <span className="block truncate text-xs text-[var(--admin-page-muted)]">Choose files or drop them here, PDF and images, 10 MB each</span>
          </span>
        </button>

        {attachments.length ? (
          <div className="grid shrink-0 gap-2 border-b border-[var(--admin-line)] py-3 sm:grid-cols-2 2xl:grid-cols-3">
            {attachments.map((attachment) => (
              <div key={attachment.attachment_id} className="flex min-w-0 items-center gap-2 rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-card)] px-3 py-2 shadow-sm">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[color-mix(in_srgb,var(--admin-accent)_16%,transparent)] text-[var(--admin-accent-dp)]"><FileIcon className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-[var(--admin-page-ink)]">{attachment.original_filename || attachment.safe_filename}</span><span className="text-[10px] text-[var(--admin-page-muted)]">{formatFileSize(attachment.size_bytes)}</span></span>
                <button type="button" onClick={() => void removeAttachment(attachment.attachment_id)} disabled={Boolean(pending)} aria-label={`Remove ${attachment.original_filename || attachment.safe_filename}`} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--admin-page-muted)] transition hover:bg-[color-mix(in_srgb,var(--admin-page-ink)_8%,transparent)] hover:text-[var(--admin-page-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-accent-dp)] lg:h-8 lg:w-8"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="relative flex min-h-[24rem] flex-1 py-3">
          <GeneralMailRichEditor value={bodyDocument} onChange={setBodyDocument} disabled={pending === 'send' || pending === 'delete'} />
          {dragActive ? <div className="pointer-events-none absolute inset-3 z-10 grid place-items-center rounded-lg border-2 border-dashed border-[var(--admin-accent-dp)] bg-[color-mix(in_srgb,var(--admin-card)_88%,transparent)] text-sm font-bold text-[var(--admin-page-ink)] backdrop-blur-sm">Drop files to attach</div> : null}
        </div>

        {uploadProgress ? <AdminNotice className="mb-3">Uploading {uploadProgress.current} of {uploadProgress.total}: {uploadProgress.fileName}</AdminNotice> : null}
        {error ? <AdminNotice tone="danger" className="mb-3">{error}</AdminNotice> : null}
      </div>

      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--admin-line)] bg-[color-mix(in_srgb,var(--admin-card)_90%,transparent)] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl sm:px-4">
        <AdminButton type="button" onClick={() => void handleSend()} disabled={Boolean(pending) || !documentHasText(bodyDocument)} tone="primary"><Send className="h-4 w-4" />{pending === 'send' ? 'Sending...' : 'Send'}</AdminButton>
        <AdminButton type="button" onClick={() => fileInputRef.current?.click()} disabled={Boolean(pending)} className="sm:hidden"><Paperclip className="h-4 w-4" /><span className="sr-only">Attach files</span></AdminButton>
        <AdminButton type="button" onClick={() => void handleSave()} disabled={Boolean(pending)}><Save className="h-4 w-4" /><span className="hidden sm:inline">Save draft</span></AdminButton>
        <div className="min-w-0 flex-1" />
        <AdminButton type="button" onClick={() => void deleteDraft()} disabled={Boolean(pending)} tone="quiet"><Trash2 className="h-4 w-4" /><span className="hidden sm:inline">Discard</span></AdminButton>
      </footer>
    </div>
  )
}
