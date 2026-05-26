'use client'

import { DEFAULT_CUSTOMIZE_ACCESS_MESSAGE, normalizeCustomizeAccessSettings, type CustomizeAccessSettings } from '@/lib/customize-access'
import { CUSTOMIZE_ACCESS_BLOCKED_EVENT } from '@/lib/customize-access'

type CustomizeAccessResponse = {
  customizeAccess?: unknown
  enabled?: boolean
  message?: string
}

export async function fetchCustomizeAccess(): Promise<CustomizeAccessSettings> {
  try {
    const response = await fetch('/api/customize-access', {
      credentials: 'include',
      cache: 'no-store',
    })

    if (!response.ok) {
      return {
        enabled: true,
        message: DEFAULT_CUSTOMIZE_ACCESS_MESSAGE,
      }
    }

    const data = (await response.json().catch(() => ({}))) as CustomizeAccessResponse
    const raw = data.customizeAccess ?? data
    return normalizeCustomizeAccessSettings(raw)
  } catch {
    return {
      enabled: true,
      message: DEFAULT_CUSTOMIZE_ACCESS_MESSAGE,
    }
  }
}

export function openCustomizeAccessBlocked(message: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(CUSTOMIZE_ACCESS_BLOCKED_EVENT, {
      detail: { message },
    })
  )
}

export async function canEnterCustomize(): Promise<boolean> {
  const access = await fetchCustomizeAccess()
  if (!access.enabled) {
    openCustomizeAccessBlocked(access.message)
    return false
  }
  return true
}
