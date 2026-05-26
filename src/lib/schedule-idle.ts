'use client'

export function runAfterIdle(callback: () => void, timeout = 1200): () => void {
  if (typeof window === 'undefined') return () => undefined

  let cancelled = false
  const run = () => {
    if (!cancelled) callback()
  }

  if ('requestIdleCallback' in window && 'cancelIdleCallback' in window) {
    const id = window.requestIdleCallback(run, { timeout })
    return () => {
      cancelled = true
      window.cancelIdleCallback(id)
    }
  }

  const id = globalThis.setTimeout(run, Math.min(timeout, 1000))
  return () => {
    cancelled = true
    globalThis.clearTimeout(id)
  }
}
