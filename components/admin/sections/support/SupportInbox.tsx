'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { SupportConversation } from '@/components/admin/sections/support/SupportConversation'
import { SupportCustomerContext } from '@/components/admin/sections/support/SupportCustomerContext'
import {
  SupportTicketQueue,
  type SupportQueueFilter,
} from '@/components/admin/sections/support/SupportTicketQueue'
import {
  isSupportMessageRow,
  isSupportTicketSummary,
  type SupportMessageRow,
  type SupportOrderContext,
  type SupportTicketDetail,
  type SupportTicketSummary,
} from '@/lib/support-types'
import { isInboundEmailAttachmentRow } from '@/lib/inbound-email-attachment-types'

const POLL_INTERVAL_MS = 15_000

function replaceTicket(
  tickets: SupportTicketSummary[],
  updated: SupportTicketSummary
): SupportTicketSummary[] {
  const existing = tickets.some((ticket) => ticket.question_id === updated.question_id)
  const next = existing
    ? tickets.map((ticket) => (ticket.question_id === updated.question_id ? updated : ticket))
    : [updated, ...tickets]
  return next.sort(
    (left, right) =>
      new Date(right.last_message_at || right.created_at).getTime() -
      new Date(left.last_message_at || left.created_at).getTime()
  )
}

export function SupportInbox() {
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([])
  const [filter, setFilter] = useState<SupportQueueFilter>('active')
  const [search, setSearch] = useState('')
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SupportTicketDetail | null>(null)
  const [listLoading, setListLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [listError, setListError] = useState('')
  const [detailError, setDetailError] = useState('')
  const [actionPending, setActionPending] = useState(false)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const listIntentRef = useRef(0)
  const detailIntentRef = useRef(0)

  const loadTickets = useCallback(async (targetFilter: SupportQueueFilter, silent = false) => {
    const intent = ++listIntentRef.current
    if (!silent) setListLoading(true)
    setListError('')
    try {
      const response = await fetch(`/api/admin/support/tickets?status=${encodeURIComponent(targetFilter)}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to load support tickets')
      if (listIntentRef.current !== intent) return
      const nextTickets = Array.isArray(data?.tickets)
        ? (data.tickets as unknown[]).filter(isSupportTicketSummary)
        : []
      setTickets(nextTickets)
      setSelectedTicketId((current) => {
        if (current && nextTickets.some((ticket) => ticket.question_id === current)) return current
        return nextTickets[0]?.question_id || null
      })
    } catch (error) {
      if (listIntentRef.current !== intent) return
      setListError(error instanceof Error ? error.message : 'Failed to load support tickets')
    } finally {
      if (listIntentRef.current === intent) setListLoading(false)
    }
  }, [])

  const loadDetail = useCallback(async (ticketId: string, silent = false) => {
    const intent = ++detailIntentRef.current
    if (!silent) {
      setDetailLoading(true)
      setDetailError('')
    }
    try {
      const response = await fetch(`/api/admin/support/tickets/${ticketId}`, {
        credentials: 'include',
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to load support conversation')
      if (detailIntentRef.current !== intent || !isSupportTicketSummary(data?.ticket)) return

      const nextDetail: SupportTicketDetail = {
        ticket: data.ticket,
        messages: Array.isArray(data?.messages)
          ? data.messages.filter(isSupportMessageRow)
          : [],
        orders: Array.isArray(data?.orders) ? (data.orders as SupportOrderContext[]) : [],
        attachments: Array.isArray(data?.attachments)
          ? data.attachments.filter(isInboundEmailAttachmentRow)
          : [],
      }
      setDetail(nextDetail)
      setTickets((current) => replaceTicket(current, nextDetail.ticket))

      if (nextDetail.ticket.unread_admin_count > 0) {
        void fetch(`/api/admin/support/tickets/${ticketId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            action: 'mark_read',
            expectedLastMessageAt: nextDetail.ticket.last_message_at,
          }),
        })
          .then((markResponse) => markResponse.json())
          .then((markData) => {
            if (!isSupportTicketSummary(markData?.ticket)) return
            const markedTicket: SupportTicketSummary = markData.ticket
            setTickets((current) => replaceTicket(current, markedTicket))
            setDetail((current) =>
              current?.ticket.question_id === markedTicket.question_id
                ? { ...current, ticket: markedTicket }
                : current
            )
          })
          .catch(() => undefined)
      }
    } catch (error) {
      if (detailIntentRef.current !== intent) return
      setDetailError(error instanceof Error ? error.message : 'Failed to load support conversation')
    } finally {
      if (detailIntentRef.current === intent) setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    setTickets([])
    setSelectedTicketId(null)
    setDetail(null)
    setMobileDetailOpen(false)
    void loadTickets(filter)
  }, [filter, loadTickets])

  useEffect(() => {
    if (!selectedTicketId) {
      setDetail(null)
      return
    }
    setDetail((current) =>
      current?.ticket.question_id === selectedTicketId ? current : null
    )
    void loadDetail(selectedTicketId)
    return () => {
      detailIntentRef.current += 1
    }
  }, [loadDetail, selectedTicketId])

  useEffect(() => {
    const refreshVisibleData = () => {
      if (document.visibilityState !== 'visible') return
      void loadTickets(filter, true)
      if (selectedTicketId) void loadDetail(selectedTicketId, true)
    }
    const timer = window.setInterval(refreshVisibleData, POLL_INTERVAL_MS)
    window.addEventListener('focus', refreshVisibleData)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshVisibleData)
    }
  }, [filter, loadDetail, loadTickets, selectedTicketId])

  useEffect(
    () => () => {
      listIntentRef.current += 1
      detailIntentRef.current += 1
    },
    []
  )

  const visibleTickets = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return tickets
    return tickets.filter((ticket) =>
      [ticket.display_name, ticket.email, ticket.ticket_code, ticket.last_message_preview]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    )
  }, [search, tickets])

  const patchMessage = useCallback((message: SupportMessageRow) => {
    setDetail((current) => {
      if (!current || current.ticket.question_id !== message.question_id) return current
      const exists = current.messages.some((candidate) => candidate.message_id === message.message_id)
      return {
        ...current,
        messages: exists
          ? current.messages.map((candidate) =>
              candidate.message_id === message.message_id ? message : candidate
            )
          : [...current.messages, message],
      }
    })
  }, [])

  const sendReply = useCallback(
    async (messageBody: string, requestId: string) => {
      if (!selectedTicketId) throw new Error('No support ticket is selected')
      const response = await fetch(`/api/admin/support/tickets/${selectedTicketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: messageBody, requestId }),
      })
      const data = await response.json().catch(() => ({}))
      if (isSupportMessageRow(data?.message)) patchMessage(data.message)
      if (isSupportTicketSummary(data?.ticket)) {
        const updatedTicket: SupportTicketSummary = data.ticket
        setTickets((current) => replaceTicket(current, updatedTicket))
        setDetail((current) =>
          current?.ticket.question_id === updatedTicket.question_id
            ? { ...current, ticket: updatedTicket }
            : current
        )
      }
      if (!response.ok) throw new Error(data?.error || 'Failed to send support reply')
      void loadTickets(filter, true)
    },
    [filter, loadTickets, patchMessage, selectedTicketId]
  )

  const changeTicketState = useCallback(
    async (action: 'close' | 'reopen') => {
      if (!selectedTicketId || actionPending) return
      setActionPending(true)
      try {
        const response = await fetch(`/api/admin/support/tickets/${selectedTicketId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ action }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || !isSupportTicketSummary(data?.ticket)) {
          throw new Error(data?.error || `Failed to ${action} support ticket`)
        }
        const updatedTicket = data.ticket
        setTickets((current) => replaceTicket(current, updatedTicket))
        setDetail((current) => (current ? { ...current, ticket: updatedTicket } : current))
        void loadTickets(filter, true)
      } catch (error) {
        setDetailError(error instanceof Error ? error.message : `Failed to ${action} support ticket`)
      } finally {
        setActionPending(false)
      }
    },
    [actionPending, filter, loadTickets, selectedTicketId]
  )

  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.035] xl:flex xl:h-full">
      <div className={`${mobileDetailOpen ? 'hidden' : 'contents'} xl:contents`}>
        <SupportTicketQueue
          tickets={visibleTickets}
          selectedTicketId={selectedTicketId}
          filter={filter}
          search={search}
          loading={listLoading}
          loadError={listError}
          onFilterChange={setFilter}
          onSearchChange={setSearch}
          onSelect={(ticketId) => {
            setSelectedTicketId(ticketId)
            setMobileDetailOpen(true)
          }}
          onRefresh={() => void loadTickets(filter)}
        />
      </div>

      <div className={`${mobileDetailOpen ? 'contents' : 'hidden'} min-h-0 min-w-0 flex-1 xl:contents`}>
        <SupportConversation
          detail={detail}
          loading={detailLoading}
          loadError={detailError}
          actionPending={actionPending}
          onBack={() => setMobileDetailOpen(false)}
          onReload={() => selectedTicketId && void loadDetail(selectedTicketId)}
          onSend={sendReply}
          onClose={() => changeTicketState('close')}
          onReopen={() => changeTicketState('reopen')}
        />
        {detail ? <SupportCustomerContext detail={detail} /> : null}
      </div>
    </div>
  )
}
