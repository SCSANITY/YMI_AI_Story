'use client'

import { DEFAULT_CUSTOMIZE_ACCESS_MESSAGE, normalizeCustomizeAccessSettings, type CustomizeAccessSettings } from '@/lib/customize-access'
import { CUSTOMIZE_ACCESS_BLOCKED_EVENT } from '@/lib/customize-access'

type CustomizeAccessResponse = {
  customizeAccess?: unknown
  enabled?: boolean
  message?: string
}

const CUSTOMIZE_ACCESS_CACHE_TTL_MS = 30_000

let cachedCustomizeAccess: CustomizeAccessSettings | null = null
let cachedCustomizeAccessAt = 0
let customizeAccessRequest: Promise<CustomizeAccessSettings> | null = null

function isCustomizeAccessCacheFresh() {
  return Boolean(
    cachedCustomizeAccess &&
    Date.now() - cachedCustomizeAccessAt < CUSTOMIZE_ACCESS_CACHE_TTL_MS
  )
}

export function getCachedCustomizeAccess(): CustomizeAccessSettings | null {
  return isCustomizeAccessCacheFresh() ? cachedCustomizeAccess : null
}

export async function fetchCustomizeAccess(options?: { force?: boolean }): Promise<CustomizeAccessSettings> {
  if (!options?.force && isCustomizeAccessCacheFresh() && cachedCustomizeAccess) {
    return cachedCustomizeAccess
  }

  if (!options?.force && customizeAccessRequest) {
    return customizeAccessRequest
  }

  customizeAccessRequest = fetchCustomizeAccessUncached()
    .then((access) => {
      cachedCustomizeAccess = access
      cachedCustomizeAccessAt = Date.now()
      return access
    })
    .finally(() => {
      customizeAccessRequest = null
    })

  return customizeAccessRequest
}

async function fetchCustomizeAccessUncached(): Promise<CustomizeAccessSettings> {
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

export function preloadCustomizeAccess() {
  if (isCustomizeAccessCacheFresh() || customizeAccessRequest) return
  void fetchCustomizeAccess()
}

export function openCustomizeAccessBlocked(message: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(CUSTOMIZE_ACCESS_BLOCKED_EVENT, {
      detail: { message },
    })
  )
}

export async function canEnterCustomize(options?: { force?: boolean }): Promise<boolean> {
  const access = await fetchCustomizeAccess(options)
  if (!access.enabled) {
    openCustomizeAccessBlocked(access.message)
    return false
  }
  return true
}
