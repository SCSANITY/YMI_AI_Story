export const HOMEPAGE_BANNER_SLOT_KEYS = [
  'after_hero',
  'after_for_boys',
  'after_in_discount',
] as const

export type HomepageBannerSlotKey = (typeof HOMEPAGE_BANNER_SLOT_KEYS)[number]
export type HomepageBannerAssetSource = 'builtin' | 'storage'

export type HomepageBannerAsset = {
  src: string
  width: number
  height: number
}

export type PublishedHomepageBanner = {
  slotKey: HomepageBannerSlotKey
  displayName: string
  desktop: HomepageBannerAsset
  mobile: HomepageBannerAsset
  altText: string
  href: string
}

export type AdminHomepageBannerAsset = HomepageBannerAsset & {
  source: HomepageBannerAssetSource
  path: string
}

export type AdminHomepageBannerSlot = {
  slotKey: HomepageBannerSlotKey
  displayName: string
  desktop: AdminHomepageBannerAsset
  mobile: AdminHomepageBannerAsset
  altText: string
  href: string
  isVisible: boolean
  rowVersion: number
  updatedAt: string
  warnings: string[]
}

export type HomepageBannerSlotRow = {
  slot_key: unknown
  display_name: unknown
  desktop_asset_source: unknown
  desktop_asset_path: unknown
  desktop_width: unknown
  desktop_height: unknown
  mobile_asset_source: unknown
  mobile_asset_path: unknown
  mobile_width: unknown
  mobile_height: unknown
  alt_text: unknown
  href: unknown
  is_visible: unknown
}

type AssetUrlResolver = (
  source: HomepageBannerAssetSource,
  path: string,
) => string

export function isHomepageBannerSlotKey(value: string): value is HomepageBannerSlotKey {
  return (HOMEPAGE_BANNER_SLOT_KEYS as readonly string[]).includes(value)
}

function parseAssetSource(value: unknown): HomepageBannerAssetSource {
  if (value === 'builtin' || value === 'storage') return value
  throw new Error('Unsupported Homepage banner asset source')
}

function parsePositiveInteger(value: unknown, label: string) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`)
  }
  return parsed
}

function assertLandscapeGeometry(width: number, height: number, label: string) {
  const ratio = width / height
  if (ratio < 1.5) {
    throw new Error(`${label} aspect ratio must be at least 1.5:1`)
  }
}

function parseInternalHref(value: unknown) {
  const href = String(value ?? '').trim()
  if (
    !href.startsWith('/') ||
    href.startsWith('//') ||
    href.startsWith('/\\') ||
    /[\r\n]/.test(href)
  ) {
    throw new Error('Homepage banner href must be a same-origin path')
  }
  return href
}

export function resolvePublishedHomepageBanner(
  row: HomepageBannerSlotRow,
  resolveAssetUrl: AssetUrlResolver,
): PublishedHomepageBanner | null {
  if (row.is_visible !== true) return null

  const slotKey = String(row.slot_key ?? '')
  if (!isHomepageBannerSlotKey(slotKey)) throw new Error('Unsupported Homepage banner slot')

  const displayName = String(row.display_name ?? '').trim()
  const altText = String(row.alt_text ?? '').trim()
  if (!displayName || !altText) {
    throw new Error('Homepage banner display name and alt text are required')
  }

  const desktopSource = parseAssetSource(row.desktop_asset_source)
  const mobileSource = parseAssetSource(row.mobile_asset_source)
  const desktopPath = String(row.desktop_asset_path ?? '').trim()
  const mobilePath = String(row.mobile_asset_path ?? '').trim()
  if (!desktopPath || !mobilePath) {
    throw new Error('Homepage banner desktop and mobile assets are required')
  }

  const desktopWidth = parsePositiveInteger(row.desktop_width, 'Desktop width')
  const desktopHeight = parsePositiveInteger(row.desktop_height, 'Desktop height')
  const mobileWidth = parsePositiveInteger(row.mobile_width, 'Mobile width')
  const mobileHeight = parsePositiveInteger(row.mobile_height, 'Mobile height')
  assertLandscapeGeometry(desktopWidth, desktopHeight, 'Desktop banner')
  assertLandscapeGeometry(mobileWidth, mobileHeight, 'Mobile banner')

  return {
    slotKey,
    displayName,
    desktop: {
      src: resolveAssetUrl(desktopSource, desktopPath),
      width: desktopWidth,
      height: desktopHeight,
    },
    mobile: {
      src: resolveAssetUrl(mobileSource, mobilePath),
      width: mobileWidth,
      height: mobileHeight,
    },
    altText,
    href: parseInternalHref(row.href),
  }
}

export function resolvePublishedHomepageBanners(
  rows: HomepageBannerSlotRow[],
  resolveAssetUrl: AssetUrlResolver,
  onInvalidRow?: (row: HomepageBannerSlotRow, error: Error) => void,
) {
  const banners = new Map<HomepageBannerSlotKey, PublishedHomepageBanner>()

  for (const row of rows) {
    try {
      const banner = resolvePublishedHomepageBanner(row, resolveAssetUrl)
      if (banner) banners.set(banner.slotKey, banner)
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error))
      if (!onInvalidRow) throw normalized
      onInvalidRow(row, normalized)
    }
  }

  return Object.fromEntries(banners) as Partial<
    Record<HomepageBannerSlotKey, PublishedHomepageBanner>
  >
}
