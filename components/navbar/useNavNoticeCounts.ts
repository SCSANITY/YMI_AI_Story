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

function clampCount(value: unknown): number {
  const numeric = Number(value ?? 0)
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0
}

function noticeStorageKey(customerId: string) {
  return `ymi_nav_seen_counts:${customerId}`
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
  isRewardsOpen: boolean
  pathname: string | null
}

export function useNavNoticeCounts({ customerId, isRewardsOpen, pathname }: UseNavNoticeCountsParams) {
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

    const cancelIdleTask = runAfterIdle(() => {
      const encodedCustomerId = encodeURIComponent(customerId)
      Promise.all([
        fetch(`/api/favourites?customerId=${encodedCustomerId}`, {
          credentials: 'include',
        }).then((res) => (res.ok ? res.json() : { items: [] })),
        fetch('/api/account/reward-vouchers', {
          credentials: 'include',
        }).then((res) => (res.ok ? res.json() : { active: [] })),
        fetch(`/api/orders/list?customerId=${encodedCustomerId}`, {
          credentials: 'include',
        }).then((res) => (res.ok ? res.json() : { orders: [], count: 0 })),
        fetch(`/api/my-books?customerId=${encodedCustomerId}`, {
          credentials: 'include',
        }).then((res) => (res.ok ? res.json() : { items: [] })),
      ])
        .then(([favoritesData, rewardsData, ordersData, booksData]) => {
          if (cancelled) return
          const nextCounts: NavNoticeCounts = {
            favorites: Array.isArray(favoritesData?.items) ? favoritesData.items.length : 0,
            rewards: Array.isArray(rewardsData?.active) ? rewardsData.active.length : 0,
            orders: clampCount(ordersData?.count ?? (Array.isArray(ordersData?.orders) ? ordersData.orders.length : 0)),
            books: Array.isArray(booksData?.items) ? booksData.items.length : 0,
          }
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
        })
        .catch(() => {
          if (cancelled) return
          setModuleCounts(EMPTY_NOTICE_COUNTS)
        })
    })

    return () => {
      cancelled = true
      cancelIdleTask()
    }
  }, [customerId, isRewardsOpen, pathname, persistSeenCounts])

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
