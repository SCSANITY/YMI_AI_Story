export function isBrowserTranslated(): boolean {
  if (typeof document === 'undefined') return false

  const root = document.documentElement
  if (root.classList.contains('translated-ltr') || root.classList.contains('translated-rtl')) {
    return true
  }

  if (document.body?.classList.contains('translated-ltr') || document.body?.classList.contains('translated-rtl')) {
    return true
  }

  return Boolean(document.querySelector('body > .skiptranslate, font[style*="vertical-align: inherit"]'))
}

export function getTranslatedInternalNavigationHref(event: MouseEvent): string | null {
  if (!isBrowserTranslated()) return null
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return null
  }

  const target = event.target
  if (!(target instanceof Element)) return null

  const anchor = target.closest('a[href]')
  if (!(anchor instanceof HTMLAnchorElement)) return null
  if (anchor.target && anchor.target !== '_self') return null
  if (anchor.hasAttribute('download')) return null

  const url = new URL(anchor.href)
  if (url.origin !== window.location.origin) return null

  return `${url.pathname}${url.search}${url.hash}`
}
