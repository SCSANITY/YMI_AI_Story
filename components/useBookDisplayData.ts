'use client'

import { useEffect, useState } from 'react'
import { runAfterIdle } from '@/lib/schedule-idle'

export type BookRatingSummary = {
  average: number
  count: number
}

const EMPTY_LOOKUP: Record<string, string> = {}

export function useBookDisplayData() {
  const [ratingMap, setRatingMap] = useState<Record<string, BookRatingSummary>>({})

  useEffect(() => {
    let isMounted = true

    const cancelIdleTask = runAfterIdle(() => {
      fetch('/api/reviews/summary', { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : { summary: {} }))
        .then((data) => {
          if (!isMounted) return
          const summary = data?.summary ?? {}
          if (summary && typeof summary === 'object') {
            setRatingMap(summary as Record<string, BookRatingSummary>)
          }
        })
        .catch(() => {
          if (!isMounted) return
          setRatingMap({})
        })
    })

    return () => {
      isMounted = false
      cancelIdleTask()
    }
  }, [])

  return {
    coverMap: EMPTY_LOOKUP,
    titleMap: EMPTY_LOOKUP,
    typeMap: EMPTY_LOOKUP,
    descMap: EMPTY_LOOKUP,
    ratingMap,
  }
}
