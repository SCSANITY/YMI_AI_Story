export function layoutSegmentsToPathname(segments: readonly string[]): string {
  const visibleSegments = segments.filter(
    (segment) => segment && !segment.startsWith('(') && !segment.startsWith('@'),
  )

  return visibleSegments.length > 0 ? `/${visibleSegments.join('/')}` : '/'
}

// Exact destinations of the desktop, mobile and account navigation. Descendant
// pages and the Cart purchase flow still need their existing Back controls.
const PRIMARY_NAVIGATION_PATHS = new Set([
  '/',
  '/books',
  '/favorites',
  '/my-books',
  '/collaboration',
  '/support',
  '/orders',
  '/account',
])

export function isPrimaryNavigationRoute(pathname: string): boolean {
  return PRIMARY_NAVIGATION_PATHS.has(pathname)
}
