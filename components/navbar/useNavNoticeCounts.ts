'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { runAfterIdle } from '@/lib/schedule-idle'

export type NavNoticeModule = 'favorites' | 'rewards' | 'orders' | 'books'
export type NavNoticeCounts = Record<NavNoticeModule, number>

export const EMPTY_NOTICE_COUNTS: NavNoticeCounts = {
  favorites: 0,
  rewards: 0,
  orders: 0,
  books: 0,
}

const NOTICE_COUNTS_TTL_MS = 60_000
const noticeCountsCache = new Map<string, { counts: NavNoticeCounts; loadedAt: number }>()
const noticeCountsRequests = new Map<string, Promise<NavNoticeCounts>>()

function clampCount(value: unknown): number {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0
}

function noticeStorageKey(customerId: string) {
  return `ymi_nav_seen_counts:${customerId}`
}

async function fetchNoticeCounts(customerId: string): Promise<NavNoticeCounts> {
  const existingRequest = noticeCountsRequests.get(customerId)
  if (existingRequest) return existingRequest

  const request = (async () => {
    const response = await fetch('/api/user/notice-counts', {
      credentials: 'include',
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`Notice counts failed with ${response.status}`)
    const data = await response.json() as Partial<NavNoticeCounts>
    const counts: NavNoticeCounts = {
      favorites: clampCount(data.favorites),
      rewards: clampCount(data.rewards),
      orders: clampCount(data.orders),
      books: clampCount(data.books),
    }

    noticeCountsCache.set(customerId, { counts, loadedAt: Date.now() })
    return counts
  })().finally(() => {
    noticeCountsRequests.delete(customerId)
  })

  noticeCountsRequests.set(customerId, request)
  return request
}

function parseNoticeCounts(raw: string | null): NavNoticeCounts | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<NavNoticeCounts>
    return {
      favorites: clampCount(parsed.favorites),
      rewards: clampCount(parsed.rewards),
      orders: clampCount(parsed.orders),
      books: clampCount(parsed.books),
    }
  } catch {
    return null
  }
}

type UseNavNoticeCountsParams = {
  customerId?: string | null
  pathname: string | null
}

export function useNavNoticeCounts({ customerId, pathname }: UseNavNoticeCountsParams) {
  const [moduleCounts, setModuleCounts] = useState<NavNoticeCounts>(EMPTY_NOTICE_COUNTS)
  const [seenCounts, setSeenCounts] = useState<NavNoticeCounts>(EMPTY_NOTICE_COUNTS)
  const seenCountsInitializedRef = useRef(false)

  const newCounts: NavNoticeCounts = customerId
    ? {
        favorites: Math.max(0, moduleCounts.favorites - seenCounts.favorites),
        rewards: Math.max(0, moduleCounts.rewards - seenCounts.rewards),
        orders: Math.max(0, moduleCounts.orders - seenCounts.orders),
        books: Math.max(0, moduleCounts.books - seenCounts.books),
      }
    : EMPTY_NOTICE_COUNTS

  const totalNewCount = newCounts.favorites + newCounts.rewards + newCounts.orders + newCounts.books

  useEffect(() => {
    if (!customerId) {
      setModuleCounts(EMPTY_NOTICE_COUNTS)
      setSeenCounts(EMPTY_NOTICE_COUNTS)
      seenCountsInitializedRef.current = false
      return
    }

    const stored = typeof window !== 'undefined' ? parseNoticeCounts(window.localStorage.getItem(noticeStorageKey(customerId))) : null
    setSeenCounts(stored ?? EMPTY_NOTICE_COUNTS)
    seenCountsInitializedRef.current = Boolean(stored)
  }, [customerId])

  const persistSeenCounts = useCallback((next: NavNoticeCounts) => {
    if (!customerId || typeof window === 'undefined') return
    window.localStorage.setItem(noticeStorageKey(customerId), JSON.stringify(next))
  }, [customerId])

  const markModuleSeen = useCallback((module: NavNoticeModule) => {
    if (!customerId) return
    setSeenCounts((prev) => {
      const next = {
        ...prev,
        [module]: moduleCounts[module],
      }
      persistSeenCounts(next)
      return next
    })
  }, [customerId, moduleCounts, persistSeenCounts])

  useEffect(() => {
    if (!customerId) return

    let cancelled = false

    const applyCounts = (nextCounts: NavNoticeCounts) => {
      setModuleCounts(nextCounts)
      setSeenCounts((prev) => {
        if (!seenCountsInitializedRef.current) {
          seenCountsInitializedRef.current = true
          persistSeenCounts(nextCounts)
          return nextCounts
        }

        const normalized: NavNoticeCounts = {
          favorites: Math.min(prev.favorites, nextCounts.favorites),
          rewards: Math.min(prev.rewards, nextCounts.rewards),
          orders: Math.min(prev.orders, nextCounts.orders),
          books: Math.min(prev.books, nextCounts.books),
        }
        const changed =
          normalized.favorites !== prev.favorites ||
          normalized.rewards !== prev.rewards ||
          normalized.orders !== prev.orders ||
          normalized.books !== prev.books
        if (changed) persistSeenCounts(normalized)
        return changed ? normalized : prev
      })
    }

    const cached = noticeCountsCache.get(customerId)
    if (cached) {
      applyCounts(cached.counts)
      if (Date.now() - cached.loadedAt < NOTICE_COUNTS_TTL_MS) {
        return () => {
          cancelled = true
        }
      }
    }

    const cancelIdleTask = runAfterIdle(() => {
      fetchNoticeCounts(customerId)
        .then((nextCounts) => {
          if (cancelled) return
          applyCounts(nextCounts)
        })
        .catch(() => {
          if (cancelled) return
        })
    })

    return () => {
      cancelled = true
      cancelIdleTask()
    }
  }, [customerId, persistSeenCounts])

  useEffect(() => {
    if (pathname === '/favorites') markModuleSeen('favorites')
    else if (pathname === '/orders' || pathname?.startsWith('/orders/')) markModuleSeen('orders')
    else if (pathname === '/my-books') markModuleSeen('books')
  }, [markModuleSeen, pathname])

  return {
    newCounts,
    totalNewCount,
    markModuleSeen,
  }
}
