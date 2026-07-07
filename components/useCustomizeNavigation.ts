'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  canEnterCustomize,
  getCachedCustomizeAccess,
  preloadCustomizeAccess,
} from '@/lib/customize-access-client'

type NavigateOptions = {
  onBeforeNavigate?: () => void
}

export function useCustomizeNavigation() {
  const router = useRouter()
  const [pendingCustomizeHref, setPendingCustomizeHref] = useState<string | null>(null)
  const pendingHrefRef = useRef<string | null>(null)

  useEffect(() => {
    preloadCustomizeAccess()
  }, [])

  const clearPendingSoon = useCallback((href: string) => {
    window.setTimeout(() => {
      if (pendingHrefRef.current !== href) return
      pendingHrefRef.current = null
      setPendingCustomizeHref(null)
    }, 1200)
  }, [])

  const prefetchCustomizeHref = useCallback((href: string) => {
    if (!href) return
    router.prefetch(href)
    preloadCustomizeAccess()
  }, [router])

  const navigateToCustomize = useCallback(async (href: string, options?: NavigateOptions) => {
    if (!href || pendingHrefRef.current) return false

    pendingHrefRef.current = href
    setPendingCustomizeHref(href)

    const cachedAccess = getCachedCustomizeAccess()
    if (cachedAccess?.enabled) {
      options?.onBeforeNavigate?.()
      router.push(href)
      clearPendingSoon(href)
      return true
    }

    const allowed = await canEnterCustomize()
    if (!allowed) {
      if (pendingHrefRef.current === href) {
        pendingHrefRef.current = null
        setPendingCustomizeHref(null)
      }
      return false
    }

    options?.onBeforeNavigate?.()
    router.push(href)
    clearPendingSoon(href)
    return true
  }, [clearPendingSoon, router])

  return {
    navigateToCustomize,
    pendingCustomizeHref,
    prefetchCustomizeHref,
  }
}
