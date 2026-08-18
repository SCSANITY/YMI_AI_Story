function normalizeSiteUrl(value: string) {
  return value.replace(/\/+$/, '')
}

export function getSiteUrl(requestUrl?: string) {
  const vercelPreviewUrl = process.env.VERCEL_ENV === 'preview'
    ? process.env.VERCEL_URL?.trim()
    : null
  if (vercelPreviewUrl) {
    return normalizeSiteUrl(`https://${vercelPreviewUrl.replace(/^https?:\/\//, '')}`)
  }

  const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL
  if (configuredSiteUrl) return normalizeSiteUrl(configuredSiteUrl)

  if (requestUrl) {
    try {
      return normalizeSiteUrl(new URL(requestUrl).origin)
    } catch {
      // Fall through to the local development origin.
    }
  }

  return 'http://localhost:3000'
}

export function buildAbsoluteUrl(path: string) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${getSiteUrl()}${normalizedPath}`
}
