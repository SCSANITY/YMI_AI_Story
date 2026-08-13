export type BrowserBackAction =
  | { method: 'history' }
  | { method: 'assign'; href: string }

type BrowserNavigationEntry = {
  index: number
  url: string
}

type BrowserNavigation = {
  currentEntry?: BrowserNavigationEntry | null
  entries?: () => BrowserNavigationEntry[]
}

function normalizeHistoryUrl(value: unknown) {
  if (typeof value !== 'string' || !value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

export function getPreviousBrowserHistoryUrl() {
  if (typeof window === 'undefined') return null
  const navigation = (window as Window & { navigation?: BrowserNavigation }).navigation
  const currentIndex = navigation?.currentEntry?.index
  const entries = navigation?.entries?.()
  if (!Number.isInteger(currentIndex) || !entries?.length) return null
  return normalizeHistoryUrl(entries.find((entry) => entry.index === currentIndex! - 1)?.url)
}

export function resolveBrowserBackAction({
  browserTranslated,
  historyLength,
  previousHistoryUrl,
  fallbackHref = '/',
}: {
  browserTranslated: boolean
  historyLength: number
  previousHistoryUrl?: string | null
  fallbackHref?: string
}): BrowserBackAction {
  if (browserTranslated) {
    return {
      method: 'assign',
      href: normalizeHistoryUrl(previousHistoryUrl) ?? fallbackHref,
    }
  }

  return historyLength > 1
    ? { method: 'history' }
    : { method: 'assign', href: fallbackHref }
}
