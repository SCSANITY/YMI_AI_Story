export const CURRENCY_GEO_COOKIE = 'ymi_geo_region'
export const CURRENCY_USER_SELECTED_KEY = 'ymi_currency_user_selected'

export function readCookieValue(cookieHeader: string, name: string): string | null {
  const prefix = `${name}=`
  const entry = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))

  if (!entry) return null

  try {
    return decodeURIComponent(entry.slice(prefix.length))
  } catch {
    return null
  }
}
