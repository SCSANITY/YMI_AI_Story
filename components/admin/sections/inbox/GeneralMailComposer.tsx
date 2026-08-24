'use client'

import { useMemo, useRef, useState } from 'react'
import { Paperclip, Save, Send, Trash2, X } from 'lucide-react'
import { AdminButton, AdminNotice, adminFieldClass, adminLabelClass } from '@/components/admin/AdminUi'
import { AdminFloatingDialog } from '@/components/admin/AdminFloatingDialog'
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
  const [error, setError] = useState('')
  const isThreadAction = mode === 'reply' || mode === 'reply_all'
  const allowBcc = mode === 'new' && !existingDraft?.in_reply_to
  const title = mode === 'new' ? 'New message' : mode === 'forward' ? 'Forward message' : mode === 'reply_all' ? 'Reply all' : 'Reply'
  const recipientLabel = useMemo(() => parseAddresses(toValue).join(', ') || 'Recipients are derived from the thread', [toValue])

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

  const handleUpload = async (file: File) => {
    if (pending) return
    setPending('upload')
    setError('')
    try {
      const message = await saveDraft()
      const attachmentId = crypto.randomUUID()
      const response = await fetch(`/api/admin/mail/drafts/${message.message_id}/attachments/upload-url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          attachmentId,
          expectedUpdatedAt: message.updated_at,
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        }),
      })
      const spec = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(spec?.error || 'Failed to prepare attachment')
      if (typeof spec.messageUpdatedAt === 'string') {
        setDraftMessage((current) => current
          ? { ...current, updated_at: spec.messageUpdatedAt }
          : current)
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
      if (!confirmResponse.ok) throw new Error(confirmed?.error || 'Failed to confirm attachment')
      setDraftMessage((current) => current && confirmed.messageUpdatedAt
        ? { ...current, updated_at: confirmed.messageUpdatedAt }
        : current)
      setAttachments((current) => [...current, confirmed.attachment])
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload attachment')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
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
    <AdminFloatingDialog
      eyebrow={mailboxAddress}
      title={title}
      subtitle={isThreadAction ? recipientLabel : undefined}
      onClose={onClose}
      backdrop="blur"
      placement="center"
      maxWidthClassName="max-w-4xl"
      bodyClassName="p-4 sm:p-5"
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={adminLabelClass}>
            To
            <input value={toValue} onChange={(event) => setToValue(event.target.value)} disabled={isThreadAction} className={adminFieldClass} placeholder="name@example.com" />
          </label>
          <label className={adminLabelClass}>
            CC
            <input value={ccValue} onChange={(event) => setCcValue(event.target.value)} disabled={isThreadAction} className={adminFieldClass} placeholder="Optional" />
          </label>
          {allowBcc ? (
            <label className={adminLabelClass}>
              BCC
              <input value={bccValue} onChange={(event) => setBccValue(event.target.value)} className={adminFieldClass} placeholder="Optional" />
            </label>
          ) : null}
          <label className={`${adminLabelClass} ${allowBcc ? '' : 'sm:col-span-2'}`}>
            Subject
            <input value={subject} onChange={(event) => setSubject(event.target.value)} disabled={isThreadAction} className={adminFieldClass} />
          </label>
        </div>
        <GeneralMailRichEditor value={bodyDocument} onChange={setBodyDocument} disabled={Boolean(pending)} />
        {attachments.length ? (
          <div className="flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <span key={attachment.attachment_id} className="inline-flex items-center gap-2 rounded-full border border-[var(--admin-card-line)] bg-[var(--admin-card)] px-3 py-1.5 text-xs text-[var(--admin-page-ink)]">
                <Paperclip className="h-3.5 w-3.5" />
                {attachment.original_filename || attachment.safe_filename}
                <button type="button" onClick={() => void removeAttachment(attachment.attachment_id)} aria-label="Remove attachment"><X className="h-3.5 w-3.5" /></button>
              </span>
            ))}
          </div>
        ) : null}
        {error ? <AdminNotice tone="danger">{error}</AdminNotice> : null}
        <div className="flex flex-col-reverse gap-2 border-t border-[var(--admin-line)] pt-4 sm:flex-row sm:items-center">
          <input ref={fileInputRef} type="file" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleUpload(file) }} />
          <AdminButton type="button" onClick={() => fileInputRef.current?.click()} disabled={Boolean(pending)}><Paperclip className="h-4 w-4" />Attach</AdminButton>
          <AdminButton type="button" onClick={() => void deleteDraft()} disabled={Boolean(pending)} tone="quiet"><Trash2 className="h-4 w-4" />Discard</AdminButton>
          <div className="flex-1" />
          <AdminButton type="button" onClick={() => void handleSave()} disabled={Boolean(pending)}><Save className="h-4 w-4" />Save draft</AdminButton>
          <AdminButton type="button" onClick={() => void handleSend()} disabled={Boolean(pending) || !documentHasText(bodyDocument)} tone="primary"><Send className="h-4 w-4" />{pending === 'send' ? 'Sending...' : 'Send'}</AdminButton>
        </div>
      </div>
    </AdminFloatingDialog>
  )
}
