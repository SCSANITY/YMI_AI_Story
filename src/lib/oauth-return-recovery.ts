'use client'

import { useEffect, useEffectEvent, type RefObject } from 'react'

type OAuthReturnLifecycle = {
  pageHide: () => void
  pageShow: () => boolean
  visibilityChange: (state: DocumentVisibilityState) => boolean
}

export function createOAuthReturnLifecycle(
  hasPendingOAuth: () => boolean,
  onReturn: () => void
): OAuthReturnLifecycle {
  let departedWithPendingOAuth = false

  const markDeparture = () => {
    if (hasPendingOAuth()) departedWithPendingOAuth = true
  }

  const recover = () => {
    if (!departedWithPendingOAuth || !hasPendingOAuth()) return false
    departedWithPendingOAuth = false
    onReturn()
    return true
  }

  return {
    pageHide: markDeparture,
    pageShow: recover,
    visibilityChange: (state) => {
      if (state === 'hidden') {
        markDeparture()
        return false
      }
      return state === 'visible' ? recover() : false
    },
  }
}

/**
 * Releases an OAuth-only UI lock when the original document becomes active
 * again after leaving for the provider. This covers browser back/forward cache
 * restoration without clearing a legitimate redirect before navigation.
 */
export function useOAuthReturnRecovery(
  pendingOAuthRef: RefObject<unknown>,
  onReturn: () => void
) {
  const onReturnEvent = useEffectEvent(onReturn)

  useEffect(() => {
    const lifecycle = createOAuthReturnLifecycle(
      () => Boolean(pendingOAuthRef.current),
      () => onReturnEvent()
    )
    const handleVisibilityChange = () => {
      lifecycle.visibilityChange(document.visibilityState)
    }

    window.addEventListener('pagehide', lifecycle.pageHide)
    window.addEventListener('pageshow', lifecycle.pageShow)
    window.addEventListener('focus', lifecycle.pageShow)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('pagehide', lifecycle.pageHide)
      window.removeEventListener('pageshow', lifecycle.pageShow)
      window.removeEventListener('focus', lifecycle.pageShow)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [pendingOAuthRef])
}
