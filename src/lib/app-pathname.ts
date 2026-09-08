export function layoutSegmentsToPathname(segments: readonly string[]): string {
  const visibleSegments = segments.filter(
    (segment) => segment && !segment.startsWith('(') && !segment.startsWith('@'),
  )

  return visibleSegments.length > 0 ? `/${visibleSegments.join('/')}` : '/'
}
