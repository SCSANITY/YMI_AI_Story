import type { ReactNode, RefObject } from 'react'
import { ChevronDown, LoaderCircle, Reply, Send } from 'lucide-react'
import {
  AdminButton,
  AdminStatusBadge,
  type AdminStatusTone,
} from '@/components/admin/AdminUi'

export type AdminEmailDirection = 'inbound' | 'outbound'

function senderInitial(value: string, fallback: string) {
  return value.trim().charAt(0).toUpperCase() || fallback
}

export function AdminEmailThread({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`admin-v2-email-thread ${className}`.trim()}>{children}</div>
}

export function AdminEmailMessageCard({
  direction,
  senderName,
  senderEmail,
  roleLabel,
  timestamp,
  sourceLabel,
  statusLabel,
  statusTone = 'neutral',
  body,
  deliveryError,
  attachmentContent,
  footer,
  emphasis = 'standard',
}: {
  direction: AdminEmailDirection
  senderName: string
  senderEmail?: string | null
  roleLabel: string
  timestamp: string
  sourceLabel?: string | null
  statusLabel?: string | null
  statusTone?: AdminStatusTone
  body: ReactNode
  deliveryError?: string | null
  attachmentContent?: ReactNode
  footer?: ReactNode
  emphasis?: 'standard' | 'quarantine'
}) {
  const isOutbound = direction === 'outbound'
  const initial = senderInitial(senderName, isOutbound ? 'Y' : 'C')

  return (
    <article
      className={`admin-v2-email-message admin-v2-email-message--${direction} ${
        emphasis === 'quarantine' ? 'admin-v2-email-message--quarantine' : ''
      }`.trim()}
      data-email-direction={direction}
    >
      <header className={`admin-v2-email-message__header ${isOutbound ? 'admin-v2-email-message__header--outbound' : ''}`}>
        <span className="admin-v2-email-message__avatar" aria-hidden="true">
          {initial}
        </span>
        <div className={`admin-v2-email-message__identity min-w-0 flex-1 ${isOutbound ? 'text-right' : ''}`}>
          <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${isOutbound ? 'justify-end' : ''}`}>
            <p className="truncate text-sm font-bold text-[var(--admin-page-ink)]">{senderName}</p>
            <span className="admin-v2-email-message__role">{roleLabel}</span>
          </div>
          {senderEmail ? (
            <p className="mt-0.5 truncate text-[10px] text-[var(--admin-page-muted)]">{senderEmail}</p>
          ) : null}
        </div>
        <div className={`admin-v2-email-message__delivery flex shrink-0 flex-col gap-1 ${isOutbound ? 'items-start' : 'items-end'}`}>
          {statusLabel ? <AdminStatusBadge tone={statusTone}>{statusLabel}</AdminStatusBadge> : null}
          <time className="text-[10px] text-[var(--admin-page-muted)]">{timestamp}</time>
        </div>
      </header>

      <div className="admin-v2-email-message__body">
        {sourceLabel ? <p className="admin-v2-email-message__source">{sourceLabel}</p> : null}
        <div className="whitespace-pre-wrap break-words text-sm leading-6 text-[var(--admin-page-ink)]">
          {body}
        </div>
        {deliveryError ? (
          <p role="alert" className="mt-3 text-xs font-semibold text-[var(--admin-crit)]">
            {deliveryError}
          </p>
        ) : null}
        {attachmentContent ? (
          <div className="mt-4 border-t border-[var(--admin-line)] pt-3">{attachmentContent}</div>
        ) : null}
      </div>

      {footer ? <footer className="admin-v2-email-message__footer">{footer}</footer> : null}
    </article>
  )
}

export function AdminEmailComposer({
  expanded,
  onExpandedChange,
  value,
  onChange,
  onSubmit,
  sending,
  error,
  textareaRef,
  maxLength,
  placeholder,
  label,
  meta,
  submitLabel = 'Send reply',
  sendingLabel = 'Sending...',
}: {
  expanded: boolean
  onExpandedChange: (expanded: boolean) => void
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  sending: boolean
  error?: string
  textareaRef?: RefObject<HTMLTextAreaElement | null>
  maxLength: number
  placeholder: string
  label: string
  meta?: ReactNode
  submitLabel?: string
  sendingLabel?: string
}) {
  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => onExpandedChange(true)}
        className="admin-v2-email-composer-trigger"
      >
        <Reply className="h-4 w-4 shrink-0 text-[var(--admin-page-muted)]" />
        <span className={`flex-1 truncate ${value.trim() ? 'text-[var(--admin-page-ink)]' : 'text-[var(--admin-page-muted)]'}`}>
          {value.trim() || placeholder}
        </span>
        {value.trim() ? <span className="admin-v2-email-draft-badge">Draft</span> : null}
      </button>
    )
  }

  return (
    <div className="admin-v2-email-composer">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-bold text-[var(--admin-page-muted)]">{label}</p>
        <button
          type="button"
          onClick={() => onExpandedChange(false)}
          aria-label="Collapse reply"
          title="Collapse"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[var(--admin-page-muted)] transition hover:bg-[color-mix(in_srgb,var(--admin-ink)_8%,transparent)] hover:text-[var(--admin-page-ink)] sm:h-8 sm:w-8"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      <label className="block">
        <span className="sr-only">{label}</span>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault()
              onSubmit()
            }
          }}
          maxLength={maxLength}
          placeholder={placeholder}
          className="min-h-24 w-full resize-y rounded-lg border border-[var(--admin-card-line)] bg-[var(--admin-card)] px-4 py-3 text-sm leading-6 text-[var(--admin-page-ink)] outline-none transition placeholder:text-[var(--admin-page-muted)] focus:border-[var(--admin-accent-dp)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--admin-accent)_30%,transparent)]"
        />
      </label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {meta ? <div className="text-[10px] text-[var(--admin-page-muted)]">{meta}</div> : null}
          {error ? <p role="alert" className="mt-1 text-xs text-[var(--admin-crit)]">{error}</p> : null}
        </div>
        <AdminButton
          type="button"
          onClick={onSubmit}
          disabled={sending || !value.trim()}
          tone="primary"
          className="w-full sm:w-auto"
        >
          {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          {sending ? sendingLabel : submitLabel}
        </AdminButton>
      </div>
    </div>
  )
}
