'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { KolLeadDetail } from '@/components/admin/sections/kol/KolLeadDetail'
import { KolLeadQueue } from '@/components/admin/sections/kol/KolLeadQueue'
import {
  ADMIN_KOL_ATTENTION_REFRESH_EVENT,
  isKolPartnershipDetail,
  isKolPartnershipLead,
  isKolPartnershipMessage,
  KOL_PARTNERSHIP_STATUSES,
  type KolPartnershipCounts,
  type KolPartnershipDetail,
  type KolPartnershipLead,
  type KolPartnershipQueueFilter,
  type KolPartnershipStatus,
} from '@/lib/kol-partnerships'

const POLL_INTERVAL_MS = 30_000

type MutationAction =
  | { action: 'update_status'; status: KolPartnershipStatus }
  | { action: 'assign_self' }
  | { action: 'unassign' }
  | { action: 'save_notes'; internalNotes: string }

function isCounts(value: unknown): value is KolPartnershipCounts {
  if (!value || typeof value !== 'object') return false
  const counts = value as Partial<KolPartnershipCounts>
  return ['active', 'attention', 'all', ...KOL_PARTNERSHIP_STATUSES].every(
    (key) => typeof counts[key as keyof KolPartnershipCounts] === 'number'
  )
}

function replaceLead(leads: KolPartnershipLead[], updated: KolPartnershipLead) {
  const exists = leads.some((lead) => lead.lead_id === updated.lead_id)
  const next = exists
    ? leads.map((lead) => (lead.lead_id === updated.lead_id ? updated : lead))
    : [updated, ...leads]
  return next.sort((left, right) => {
    if (left.unread_admin_count !== right.unread_admin_count) {
      return right.unread_admin_count - left.unread_admin_count
    }
    return new Date(right.submitted_at || right.created_at).getTime() -
      new Date(left.submitted_at || left.created_at).getTime()
  })
}

function requestAttentionRefresh() {
  window.dispatchEvent(new Event(ADMIN_KOL_ATTENTION_REFRESH_EVENT))
}

export function KolPartnershipWorkspace() {
  const [leads, setLeads] = useState<KolPartnershipLead[]>([])
  const [counts, setCounts] = useState<KolPartnershipCounts | null>(null)
  const [filter, setFilter] = useState<KolPartnershipQueueFilter>('attention')
  const [search, setSearch] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [detail, setDetail] = useState<KolPartnershipDetail | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [listError, setListError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const listIntentRef = useRef(0)
  const detailIntentRef = useRef(0)

  const loadLeads = useCallback(async (targetFilter: KolPartnershipQueueFilter, silent = false) => {
    const intent = ++listIntentRef.current
    if (!silent) setListLoading(true)
    setListError('')
    try {
      const response = await fetch(`/api/admin/kol-partnerships?status=${encodeURIComponent(targetFilter)}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Unable to load partnership applications')
      if (listIntentRef.current !== intent) return

      const nextLeads = Array.isArray(data?.leads)
        ? (data.leads as unknown[]).filter(isKolPartnershipLead)
        : []
      setLeads(nextLeads)
      if (isCounts(data?.counts)) setCounts(data.counts)
      setSelectedLeadId((current) => {
        if (current && nextLeads.some((lead) => lead.lead_id === current)) return current
        return nextLeads[0]?.lead_id || null
      })
    } catch (error) {
      if (listIntentRef.current !== intent) return
      setListError(error instanceof Error ? error.message : 'Unable to load partnership applications')
    } finally {
      if (listIntentRef.current === intent) setListLoading(false)
    }
  }, [])

  const patchLeadInState = useCallback((lead: KolPartnershipLead) => {
    setLeads((current) => replaceLead(current, lead))
    setDetail((current) =>
      current?.lead.lead_id === lead.lead_id ? { ...current, lead } : current
    )
  }, [])

  const markLeadRead = useCallback(async (lead: KolPartnershipLead) => {
    if (lead.unread_admin_count === 0) return
    try {
      const response = await fetch(`/api/admin/kol-partnerships/${lead.lead_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'mark_read', expectedUpdatedAt: lead.updated_at }),
      })
      const data = await response.json().catch(() => ({}))
      if (isKolPartnershipLead(data?.lead)) patchLeadInState(data.lead)
      if (response.ok) requestAttentionRefresh()
    } catch {
      // The next poll retries against the latest server version.
    }
  }, [patchLeadInState])

  const loadDetail = useCallback(async (leadId: string, silent = false) => {
    const intent = ++detailIntentRef.current
    if (!silent) {
      setDetailLoading(true)
      setDetailError('')
    }
    try {
      const response = await fetch(`/api/admin/kol-partnerships/${leadId}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Unable to load partnership application')
      if (detailIntentRef.current !== intent || !isKolPartnershipDetail(data?.detail)) return

      setDetail(data.detail)
      setLeads((current) => replaceLead(current, data.detail.lead))
      if (data.detail.lead.unread_admin_count > 0) {
        void markLeadRead(data.detail.lead)
      }
    } catch (error) {
      if (detailIntentRef.current !== intent) return
      setDetailError(error instanceof Error ? error.message : 'Unable to load partnership application')
    } finally {
      if (detailIntentRef.current === intent) setDetailLoading(false)
    }
  }, [markLeadRead])

  useEffect(() => {
    setLeads([])
    setSelectedLeadId(null)
    setDetail(null)
    setMobileDetailOpen(false)
    void loadLeads(filter)
  }, [filter, loadLeads])

  useEffect(() => {
    if (!selectedLeadId) {
      setDetail(null)
      return
    }
    setDetail((current) => current?.lead.lead_id === selectedLeadId ? current : null)
    void loadDetail(selectedLeadId)
    return () => {
      detailIntentRef.current += 1
    }
  }, [loadDetail, selectedLeadId])

  useEffect(() => {
    const refreshVisibleData = () => {
      if (document.visibilityState !== 'visible') return
      void loadLeads(filter, true)
      if (selectedLeadId) void loadDetail(selectedLeadId, true)
    }
    const timer = window.setInterval(refreshVisibleData, POLL_INTERVAL_MS)
    window.addEventListener('focus', refreshVisibleData)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshVisibleData)
    }
  }, [filter, loadDetail, loadLeads, selectedLeadId])

  useEffect(() => () => {
    listIntentRef.current += 1
    detailIntentRef.current += 1
  }, [])

  const visibleLeads = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return leads
    return leads.filter((lead) =>
      [
        lead.nickname,
        lead.contact_email,
        lead.account_email_snapshot,
        lead.country_region,
        lead.primary_market,
        lead.content_focus,
        lead.lead_code,
      ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query))
    )
  }, [leads, search])

  const mutateLead = useCallback(async (
    mutation: MutationAction,
    expectedUpdatedAt: string
  ) => {
    if (!selectedLeadId) throw new Error('No partnership application is selected')
    const response = await fetch(`/api/admin/kol-partnerships/${selectedLeadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ ...mutation, expectedUpdatedAt }),
    })
    const data = await response.json().catch(() => ({}))

    if (isKolPartnershipLead(data?.lead)) patchLeadInState(data.lead)
    if (!response.ok || !isKolPartnershipLead(data?.lead)) {
      throw new Error(data?.error || 'Unable to update partnership application')
    }

    requestAttentionRefresh()
    void loadLeads(filter, true)
    return data.lead
  }, [filter, loadLeads, patchLeadInState, selectedLeadId])

  const sendMessage = useCallback(async (message: string, requestId: string) => {
    if (!selectedLeadId) throw new Error('No partnership application is selected')
    const response = await fetch(`/api/admin/kol-partnerships/${selectedLeadId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ message, requestId }),
    })
    const data = await response.json().catch(() => ({}))
    const responseMessages = Array.isArray(data?.messages)
      ? (data.messages as unknown[]).filter(isKolPartnershipMessage)
      : null

    if (isKolPartnershipLead(data?.lead) && responseMessages) {
      const nextLead = data.lead
      patchLeadInState(nextLead)
      setDetail((current) => {
        if (!current || current.lead.lead_id !== nextLead.lead_id) return current
        return { ...current, lead: nextLead, messages: responseMessages }
      })
    }

    if (!response.ok) {
      void loadDetail(selectedLeadId, true)
      throw new Error(data?.error || 'Unable to send partnership email')
    }
    if (!isKolPartnershipLead(data?.lead) || !responseMessages) {
      throw new Error('Partnership email sent but the response could not be reconciled')
    }

    requestAttentionRefresh()
    void loadLeads(filter, true)
  }, [filter, loadDetail, loadLeads, patchLeadInState, selectedLeadId])

  const reviewSender = useCallback(async (
    messageId: string,
    action: 'confirm' | 'reject'
  ) => {
    if (!selectedLeadId) throw new Error('No partnership application is selected')
    const response = await fetch(
      `/api/admin/kol-partnerships/${selectedLeadId}/messages/${messageId}/association`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action }),
      }
    )
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(data?.error || 'Unable to review partnership sender')
    }

    await loadDetail(selectedLeadId, true)
    requestAttentionRefresh()
    void loadLeads(filter, true)
  }, [filter, loadDetail, loadLeads, selectedLeadId])

  return (
    <div className="admin-v2-comm-workspace min-h-0 min-w-0 flex-1 2xl:flex 2xl:h-full">
      <div className={`${mobileDetailOpen ? 'hidden' : 'contents'} 2xl:contents`}>
        <KolLeadQueue
          leads={visibleLeads}
          counts={counts}
          selectedLeadId={selectedLeadId}
          filter={filter}
          search={search}
          loading={listLoading}
          loadError={listError}
          onFilterChange={setFilter}
          onSearchChange={setSearch}
          onSelect={(leadId) => {
            setSelectedLeadId(leadId)
            setMobileDetailOpen(true)
          }}
          onRefresh={() => void loadLeads(filter)}
        />
      </div>

      <div className={`${mobileDetailOpen ? 'contents' : 'hidden'} min-h-0 min-w-0 flex-1 2xl:contents`}>
        <KolLeadDetail
          detail={detail}
          loading={detailLoading}
          loadError={detailError}
          onBack={() => setMobileDetailOpen(false)}
          onReload={() => selectedLeadId && void loadDetail(selectedLeadId)}
          onMutate={mutateLead}
          onSendMessage={sendMessage}
          onReviewSender={reviewSender}
        />
      </div>
    </div>
  )
}
