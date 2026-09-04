import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import {
  HOMEPAGE_BANNER_BUCKET,
  resolveHomepageBannerAssetUrl,
} from '@/lib/homepage-banners'
import {
  isHomepageBannerSlotKey,
  type AdminHomepageBannerAsset,
  type AdminHomepageBannerSlot,
  type HomepageBannerSlotKey,
  type HomepageBannerSlotRow,
} from '@/lib/homepage-banners-core'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const HOMEPAGE_BANNER_MAX_BYTES = 5 * 1024 * 1024
export const HOMEPAGE_BANNER_CONTENT_TYPES = new Set([
  'image/webp',
  'image/png',
  'image/jpeg',
])

export const HOMEPAGE_BANNER_ADMIN_SELECT = [
  'slot_key',
  'display_name',
  'desktop_asset_source',
  'desktop_asset_path',
  'desktop_width',
  'desktop_height',
  'mobile_asset_source',
  'mobile_asset_path',
  'mobile_width',
  'mobile_height',
  'alt_text',
  'href',
  'is_visible',
  'row_version',
  'updated_at',
].join(', ')

export type HomepageBannerAdminRow = HomepageBannerSlotRow & {
  row_version: unknown
  updated_at: unknown
}

const CONTENT_TYPE_EXTENSION: Record<string, string> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
}

function normalizeContentType(value: unknown) {
  return String(value ?? '').split(';', 1)[0].trim().toLowerCase()
}

function parseInteger(value: unknown, label: string) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} is invalid`)
  return parsed
}

function buildWarnings(desktop: { width: number }, mobile: { width: number }) {
  const warnings: string[] = []
  if (desktop.width < 1920) warnings.push('Desktop image is below the recommended 1920px width.')
  if (mobile.width < 1080) warnings.push('Mobile image is below the recommended 1080px width.')
  return warnings
}

function parseAdminAsset(
  sourceValue: unknown,
  pathValue: unknown,
  widthValue: unknown,
  heightValue: unknown,
): AdminHomepageBannerAsset {
  const source = String(sourceValue ?? '')
  if (source !== 'builtin' && source !== 'storage') {
    throw new Error('Unsupported Homepage banner asset source')
  }
  const path = String(pathValue ?? '').trim()
  if (!path) throw new Error('Homepage banner asset path is required')
  const width = parseInteger(widthValue, 'Homepage banner width')
  const height = parseInteger(heightValue, 'Homepage banner height')

  return {
    source,
    path,
    src: resolveHomepageBannerAssetUrl(source, path),
    width,
    height,
  }
}

export function buildAdminHomepageBannerSlot(
  row: HomepageBannerAdminRow,
): AdminHomepageBannerSlot {
  const slotKey = String(row.slot_key ?? '')
  if (!isHomepageBannerSlotKey(slotKey)) throw new Error('Unsupported Homepage banner slot')
  const desktop = parseAdminAsset(
    row.desktop_asset_source,
    row.desktop_asset_path,
    row.desktop_width,
    row.desktop_height,
  )
  const mobile = parseAdminAsset(
    row.mobile_asset_source,
    row.mobile_asset_path,
    row.mobile_width,
    row.mobile_height,
  )

  return {
    slotKey,
    displayName: String(row.display_name ?? '').trim(),
    desktop,
    mobile,
    altText: String(row.alt_text ?? '').trim(),
    href: String(row.href ?? '').trim(),
    isVisible: row.is_visible === true,
    rowVersion: parseInteger(row.row_version, 'Homepage banner row version'),
    updatedAt: String(row.updated_at ?? ''),
    warnings: buildWarnings(desktop, mobile),
  }
}

export function validateHomepageBannerUploadSpec(input: {
  contentType: unknown
  sizeBytes: unknown
}) {
  const contentType = normalizeContentType(input.contentType)
  const sizeBytes = Number(input.sizeBytes)
  if (!HOMEPAGE_BANNER_CONTENT_TYPES.has(contentType)) {
    throw new Error('Use a WebP, PNG, or JPEG image.')
  }
  if (!Number.isInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > HOMEPAGE_BANNER_MAX_BYTES) {
    throw new Error('Banner images must be no larger than 5 MB.')
  }
  return { contentType, sizeBytes, extension: CONTENT_TYPE_EXTENSION[contentType] }
}

export function buildHomepageBannerStoragePath(adminCustomerId: string, contentType: string) {
  const extension = CONTENT_TYPE_EXTENSION[normalizeContentType(contentType)]
  if (!extension) throw new Error('Unsupported Homepage banner image type')
  return `homepage-banners/admin/${adminCustomerId}/${randomUUID()}.${extension}`
}

export function isHomepageBannerStoragePath(path: string) {
  return /^homepage-banners\/admin\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|png|jpe?g)$/i.test(path)
}

export async function verifyStoredHomepageBannerAsset(
  storagePath: string,
): Promise<AdminHomepageBannerAsset> {
  if (!isHomepageBannerStoragePath(storagePath)) {
    throw new Error('Invalid Homepage banner storage path')
  }

  const { data: blob, error } = await supabaseAdmin.storage
    .from(HOMEPAGE_BANNER_BUCKET)
    .download(storagePath)
  if (error || !blob) throw new Error('Uploaded Homepage banner was not found')
  if (blob.size <= 0 || blob.size > HOMEPAGE_BANNER_MAX_BYTES) {
    throw new Error('Stored Homepage banner exceeds the 5 MB limit')
  }

  const bytes = Buffer.from(await blob.arrayBuffer())
  const metadata = await sharp(bytes, { limitInputPixels: 45_000_000 }).metadata()
  const width = Number(metadata.width)
  const height = Number(metadata.height)
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('Unable to read Homepage banner dimensions')
  }
  if (!metadata.format || !['webp', 'png', 'jpeg'].includes(metadata.format)) {
    throw new Error('Stored Homepage banner is not a supported image')
  }
  const extension = storagePath.split('.').pop()?.toLowerCase()
  const expectedFormat = extension === 'jpg' ? 'jpeg' : extension
  if (metadata.format !== expectedFormat) {
    throw new Error('Stored Homepage banner bytes do not match the uploaded file type')
  }
  if (width / height < 1.5) {
    throw new Error('Homepage banners must use a landscape ratio of at least 1.5:1')
  }

  return {
    source: 'storage',
    path: storagePath,
    src: resolveHomepageBannerAssetUrl('storage', storagePath),
    width,
    height,
  }
}

export function preserveBuiltinAsset(
  requested: { source?: unknown; path?: unknown },
  current: AdminHomepageBannerAsset,
) {
  if (requested.source !== 'builtin' || requested.path !== current.path || current.source !== 'builtin') {
    throw new Error('Built-in Banner assets cannot be reassigned directly')
  }
  return current
}

export function parseHomepageBannerSlotKey(value: unknown): HomepageBannerSlotKey {
  const key = String(value ?? '')
  if (!isHomepageBannerSlotKey(key)) throw new Error('Unsupported Homepage banner slot')
  return key
}

export function normalizeHomepageBannerFields(input: {
  displayName: unknown
  altText: unknown
  href: unknown
}) {
  const displayName = String(input.displayName ?? '').trim()
  const altText = String(input.altText ?? '').trim()
  const href = String(input.href ?? '').trim()
  if (!displayName || displayName.length > 120) throw new Error('Banner name is required.')
  if (!altText || altText.length > 240) throw new Error('Alternative text is required.')
  if (
    !href.startsWith('/') ||
    href.startsWith('//') ||
    href.startsWith('/\\') ||
    /[\r\n]/.test(href)
  ) {
    throw new Error('Banner destination must be an internal path beginning with /.')
  }
  return { displayName, altText, href }
}
