'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  AtSign,
  CircleAlert,
  ClipboardCheck,
  Globe2,
  Handshake,
  LoaderCircle,
  MapPin,
  Save,
  UserCheck,
  UserMinus,
  UsersRound,
} from 'lucide-react'
import {
  AdminButton,
  AdminEmptyState,
  AdminIconButton,
  AdminNotice,
  AdminStatusBadge,
  adminFieldClass,
  adminLabelClass,
} from '@/components/admin/AdminUi'
import {
  KOL_OPEN_STATUSES,
  KOL_PARTNERSHIP_STATUSES,
  type KolPartnershipDetail,
  type KolPartnershipLead,
  type KolPartnershipStatus,
} from '@/lib/kol-partnerships'
import { formatAudience, formatKolDate, getKolStatusLabel, kolStatusTone } from './kolUi'
import { KolPartnershipConversation } from './KolPartnershipConversation'
import { KolPartnershipCodePanel } from './KolPartnershipCodePanel'

type MutationAction =
  | { action: 'update_status'; status: KolPartnershipStatus }
  | { action: 'assign_self' }
  | { action: 'unassign' }
  | { action: 'save_notes'; internalNotes: string }

export function KolLeadDetail({
  detail,
  loading,
  loadError,
  onBack,
  onReload,
  onMutate,
  onSendMessage,
  onReviewSender,
}: {
  detail: KolPartnershipDetail | null
  loading: boolean
  loadError: string
  onBack: () => void
  onReload: () => void
  onMutate: (mutation: MutationAction, expectedUpdatedAt: string) => Promise<KolPartnershipLead>
  onSendMessage: (message: string, requestId: string) => Promise<void>
  onReviewSender: (messageId: string, action: 'confirm' | 'reject') => Promise<void>
}) {
  const [notesDraft, setNotesDraft] = useState('')
  const [savedNotes, setSavedNotes] = useState('')
  const [statusPending, setStatusPending] = useState(false)
  const [assignmentPending, setAssignmentPending] = useState(false)
  const [notesPending, setNotesPending] = useState(false)
  const [actionError, setActionError] = useState('')
  const leadId = detail?.lead.lead_id ?? null
  const activeLeadIdRef = useRef<string | null>(null)
  const notesDirtyRef = useRef(false)
  const notesDirty = notesDraft !== savedNotes
  notesDirtyRef.current = notesDirty

  useEffect(() => {
    if (activeLeadIdRef.current === leadId) return
    activeLeadIdRef.current = leadId
    const nextNotes = detail?.lead.internal_notes || ''
    setNotesDraft(nextNotes)
    setSavedNotes(nextNotes)
    setActionError('')
  }, [detail?.lead.internal_notes, leadId])

  useEffect(() => {
    if (!detail || notesDirtyRef.current) return
    const nextNotes = detail.lead.internal_notes || ''
    setNotesDraft(nextNotes)
    setSavedNotes(nextNotes)
  }, [detail])

  if (loading && !detail) {
    return (
      <section className="admin-v2-comm-canvas relative flex min-h-[34rem] min-w-0 flex-1 items-center justify-center text-sm text-[var(--admin-page-muted)]">
        <AdminIconButton type="button" onClick={onBack} title="Back to partnership list" className="absolute left-3 top-3 h-9 min-h-9 w-9 basis-9 2xl:hidden">
          <ArrowLeft className="h-4 w-4" />
        </AdminIconButton>
        <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Loading application...
      </section>
    )
  }

  if (loadError && !detail) {
    return (
      <section className="admin-v2-comm-canvas relative flex min-h-[34rem] min-w-0 flex-1 flex-col items-center justify-center px-6 text-center">
        <AdminIconButton type="button" onClick={onBack} title="Back to partnership list" className="absolute left-3 top-3 h-9 min-h-9 w-9 basis-9 2xl:hidden">
          <ArrowLeft className="h-4 w-4" />
        </AdminIconButton>
        <CircleAlert className="mb-3 h-7 w-7 text-[var(--admin-crit)]" />
        <p className="text-sm text-[var(--admin-crit)]">{loadError}</p>
        <button type="button" onClick={onReload} className="mt-4 text-sm font-bold text-[var(--admin-accent-dp)] underline underline-offset-4">
          Retry
        </button>
      </section>
    )
  }

  if (!detail) {
    return (
      <AdminEmptyState className="admin-v2-comm-canvas flex min-h-[34rem] min-w-0 flex-1 flex-col items-center justify-center border-0 px-6 text-center">
        <AdminIconButton type="button" onClick={onBack} title="Back to partnership list" className="absolute left-3 top-3 h-9 min-h-9 w-9 basis-9 2xl:hidden">
          <ArrowLeft className="h-4 w-4" />
        </AdminIconButton>
        <Handshake className="mb-3 h-8 w-8" />
        Select a partnership application to review its profile.
      </AdminEmptyState>
    )
  }

  const { lead, applicant, messages, quarantinedMessages, attachments, codes } = detail
  const canChangeStatus = KOL_OPEN_STATUSES.includes(
    lead.review_status as (typeof KOL_OPEN_STATUSES)[number]
  )
  const assignedLabel =
    lead.assigned_admin_name || lead.assigned_admin_email || 'Unassigned'

  const mutate = async (
    mutation: MutationAction,
    setPending: (pending: boolean) => void
  ) => {
    setPending(true)
    setActionError('')
    try {
      return await onMutate(mutation, lead.updated_at)
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to update application')
      throw error
    } finally {
      setPending(false)
    }
  }

  const saveNotes = async () => {
    if (!notesDirty || notesPending) return
    try {
      const updated = await mutate(
        { action: 'save_notes', internalNotes: notesDraft },
        setNotesPending
      )
      const nextNotes = updated.internal_notes || ''
      setSavedNotes(nextNotes)
      setNotesDraft(nextNotes)
    } catch {
      // The shared action notice keeps the draft visible for retry.
    }
  }

  return (
    <section className="admin-v2-comm-canvas flex min-h-[40rem] min-w-0 flex-1 flex-col 2xl:h-full 2xl:min-h-0">
      <header className="flex shrink-0 items-start gap-3 border-b border-[var(--admin-line)] bg-[var(--admin-panel-2)] p-3 sm:p-4">
        <AdminIconButton type="button" onClick={onBack} title="Back to partnership list" className="h-9 min-h-9 w-9 basis-9 2xl:hidden">
          <ArrowLeft className="h-4 w-4" />
        </AdminIconButton>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-bold text-[var(--admin-page-ink)]">{lead.nickname}</h2>
            <AdminStatusBadge tone={kolStatusTone(lead.review_status)}>{getKolStatusLabel(lead.review_status)}</AdminStatusBadge>
            {lead.unread_admin_count > 0 ? (
              <AdminStatusBadge tone="warning">{lead.unread_admin_count} unread</AdminStatusBadge>
            ) : null}
            {lead.pending_sender_count > 0 ? (
              <AdminStatusBadge tone="warning">{lead.pending_sender_count} sender check</AdminStatusBadge>
            ) : null}
          </div>
          <p className="mt-1 truncate text-xs text-[var(--admin-page-muted)]">
            #{lead.lead_code} / Submitted {formatKolDate(lead.submitted_at || lead.created_at)}
          </p>
        </div>
      </header>

      {loadError ? (
        <div role="alert" className="shrink-0 border-b border-[var(--admin-line)] bg-red-50 px-4 py-2 text-xs font-semibold text-[var(--admin-crit)]">
          Refresh failed: {loadError}. Showing the last loaded application.
        </div>
      ) : null}

      <div className="admin-v2-comm-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="min-w-0 space-y-4">
            <section className="admin-v2-data-row p-4 sm:p-5">
              <SectionTitle icon={ClipboardCheck} title="Application profile" />
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Fact label="Creator or channel" value={lead.nickname} />
                <Fact label="Audience" value={formatAudience(lead.audience_size)} icon={UsersRound} />
                <Fact label="Country / region" value={lead.country_region} icon={MapPin} />
                <Fact label="Primary market" value={lead.primary_market} icon={Globe2} />
              </div>
              <div className="mt-5 space-y-4 border-t border-[var(--admin-line)] pt-4">
                <LongFact label="Content focus" value={lead.content_focus} />
                <LongFact label="Collaboration notes" value={lead.notes} />
              </div>
            </section>

            <section className="admin-v2-data-row p-4 sm:p-5">
              <SectionTitle icon={AtSign} title="Public presence" />
              <p className="mt-2 text-[10px] leading-5 text-[var(--admin-page-muted)]">
                Applicant-supplied values are shown as text. Links are intentionally not opened directly from this review surface.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Fact label="Website / media kit" value={lead.website_url} breakWords />
                <Fact label="Instagram" value={lead.instagram} breakWords />
                <Fact label="TikTok" value={lead.tiktok} breakWords />
                <Fact label="YouTube" value={lead.youtube} breakWords />
                <Fact label="Xiaohongshu" value={lead.xiaohongshu} breakWords />
              </div>
            </section>

            <KolPartnershipConversation
              lead={lead}
              messages={messages}
              quarantinedMessages={quarantinedMessages}
              attachments={attachments}
              onSend={onSendMessage}
              onReviewSender={onReviewSender}
            />

            <KolPartnershipCodePanel
              leadId={lead.lead_id}
              leadStatus={lead.review_status}
              initialCodes={codes}
            />
          </div>

          <aside className="min-w-0 space-y-4">
            <section className="admin-v2-data-row p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-page-muted)]">Review controls</p>
              <label className={`${adminLabelClass} mt-4`}>
                Application status
                <select
                  value={lead.review_status}
                  disabled={!canChangeStatus || statusPending}
                  onChange={(event) => {
                    const status = event.target.value as KolPartnershipStatus
                    void mutate({ action: 'update_status', status }, setStatusPending).catch(() => undefined)
                  }}
                  className={adminFieldClass}
                >
                  {KOL_PARTNERSHIP_STATUSES.map((status) => (
                    <option key={status} value={status} disabled={!canChangeStatus && status !== lead.review_status}>
                      {getKolStatusLabel(status)}
                    </option>
                  ))}
                </select>
              </label>
              {!canChangeStatus ? (
                <p className="mt-2 text-[10px] leading-5 text-[var(--admin-page-muted)]">Declined and archived applications are terminal in S3.</p>
              ) : null}

              <div className="mt-4 border-t border-[var(--admin-line)] pt-4">
                <p className={adminLabelClass}>Assigned reviewer</p>
                <p className="mt-2 break-words text-sm font-semibold text-[var(--admin-page-ink)]">{assignedLabel}</p>
                <div className="mt-3 grid gap-2">
                  <AdminButton
                    type="button"
                    tone="primary"
                    disabled={assignmentPending}
                    onClick={() => void mutate({ action: 'assign_self' }, setAssignmentPending).catch(() => undefined)}
                  >
                    <UserCheck className="h-4 w-4" /> Assign to me
                  </AdminButton>
                  <AdminButton
                    type="button"
                    tone="quiet"
                    disabled={assignmentPending || !lead.assigned_admin_customer_id}
                    onClick={() => void mutate({ action: 'unassign' }, setAssignmentPending).catch(() => undefined)}
                  >
                    <UserMinus className="h-4 w-4" /> Unassign
                  </AdminButton>
                </div>
              </div>
            </section>

            <section className="admin-v2-data-row p-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--admin-page-muted)]">Account and contact</p>
              <div className="mt-4 space-y-3">
                <Fact label="Account" value={applicant?.display_name || 'No display name'} />
                <Fact label="Account email" value={applicant?.email || lead.account_email_snapshot} breakWords />
                <Fact label="Partnership email" value={lead.contact_email} breakWords />
                <Fact label="Phone" value={lead.phone} breakWords />
                <Fact label="WhatsApp / WeChat" value={lead.whatsapp_or_wechat} breakWords />
              </div>
            </section>

            <section className="admin-v2-data-row p-4">
              <label className={adminLabelClass} htmlFor="kol-internal-notes">Internal notes</label>
              <textarea
                id="kol-internal-notes"
                value={notesDraft}
                onChange={(event) => {
                  setNotesDraft(event.target.value)
                  setActionError('')
                }}
                maxLength={12000}
                className={`${adminFieldClass} min-h-36 py-3 leading-6`}
                placeholder="Private review notes for the YMI team"
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-[10px] text-[var(--admin-page-muted)]">Not visible to the applicant</span>
                <AdminButton type="button" tone="primary" disabled={!notesDirty || notesPending} onClick={() => void saveNotes()}>
                  {notesPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {notesPending ? 'Saving...' : 'Save notes'}
                </AdminButton>
              </div>
            </section>

            {actionError ? <AdminNotice tone="danger">{actionError}</AdminNotice> : null}
          </aside>
        </div>
      </div>
    </section>
  )
}

function SectionTitle({ icon: Icon, title }: { icon: typeof Handshake; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--admin-accent)_22%,transparent)] text-[var(--admin-accent-dp)]">
        <Icon className="h-4 w-4" />
      </span>
      <h3 className="text-base font-bold text-[var(--admin-page-ink)]">{title}</h3>
    </div>
  )
}

function Fact({ label, value, icon: Icon, breakWords = false }: { label: string; value: string | null | undefined; icon?: typeof Handshake; breakWords?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--admin-page-muted)]">
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}{label}
      </p>
      <p className={`mt-1 text-sm leading-6 text-[#4d524b] ${breakWords ? 'break-all' : 'break-words'}`}>{value || '-'}</p>
    </div>
  )
}

function LongFact({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--admin-page-muted)]">{label}</p>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[#4d524b]">{value || '-'}</p>
    </div>
  )
}
