export function normalizeAppPathname(pathname: string | null | undefined): string {
  return pathname || '/'
}
