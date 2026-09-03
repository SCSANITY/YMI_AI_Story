import type { TemplateFinalPreviewPage } from '@/types'
import { buildBookPresentation, type BookPresentation } from '@/lib/book-presentation'

type TemplateFinalPreviewConfigPage = {
  index?: unknown
  template_image?: unknown
  presentation?: {
    role?: unknown
    spread_index?: unknown
    side?: unknown
    page_number?: unknown
  } | null
}

type TemplateFinalPreviewConfig = {
  schema_version?: unknown
  asset_layout?: unknown
  base_path?: unknown
  pages?: unknown
}

function normalizeStoragePath(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/^app-templates\//, '')
    .replace(/^\/+|\/+$/g, '')
}

function resolveFinalTemplatePath(basePath: string, templateImage: string) {
  const imagePath = templateImage.trim().replace(/^\/+|\/+$/g, '')
  return imagePath.includes('/')
    ? `${basePath}/${imagePath}`
    : `${basePath}/final/${imagePath}`
}

export function parseTemplateFinalPreviewPages(
  value: unknown,
  toPublicUrl: (storagePath: string) => string
): TemplateFinalPreviewPage[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const config = value as TemplateFinalPreviewConfig
  if (Number(config.schema_version) !== 3 || config.asset_layout !== 'single-page') return []

  const basePath = normalizeStoragePath(config.base_path)
  const pages = Array.isArray(config.pages)
    ? (config.pages as TemplateFinalPreviewConfigPage[])
    : []
  if (!basePath || !pages.length) return []

  const result: TemplateFinalPreviewPage[] = []
  const occupied = new Set<string>()
  const pageIndices = new Set<number>()
  for (const page of pages) {
    const pageIndex = Number(page?.index)
    const templateImage = String(page?.template_image ?? '').trim()
    const presentation = page?.presentation
    const role = presentation?.role
    if (role === 'preview_cover' || role === 'preview_interior') continue
    if (role !== 'final_front_cover' && role !== 'final_interior') return []
    const spreadIndex = Number(presentation?.spread_index)
    const side = presentation?.side === 'left' || presentation?.side === 'right'
      ? presentation.side
      : null
    const rawPageNumber = presentation?.page_number
    const pageNumber = rawPageNumber == null ? null : Number(rawPageNumber)

    if (
      !Number.isInteger(pageIndex) ||
      pageIndex < 0 ||
      !templateImage ||
      !Number.isInteger(spreadIndex) ||
      spreadIndex < 0
    ) {
      return []
    }
    if (role === 'final_front_cover' && (spreadIndex !== 0 || side !== null || pageNumber !== null)) {
      return []
    }
    if (
      role === 'final_interior' &&
      (spreadIndex < 1 || !Number.isInteger(pageNumber) || Number(pageNumber) < 1)
    ) {
      return []
    }

    const positionKey = `${String(role)}:${spreadIndex}:${side}`
    if (occupied.has(positionKey) || pageIndices.has(pageIndex)) return []
    occupied.add(positionKey)
    pageIndices.add(pageIndex)
    result.push({
      pageIndex,
      url: toPublicUrl(resolveFinalTemplatePath(basePath, templateImage)),
      role: role as TemplateFinalPreviewPage['role'],
      spreadIndex,
      side,
      pageNumber,
    })
  }

  const frontCoverCount = result.filter((page) => page.role === 'final_front_cover').length
  const interiorPages = result.filter((page) => page.role === 'final_interior')
  if (frontCoverCount !== 1 || interiorPages.length !== 30 || result.length !== 31) return []

  const spreads = new Map<number, Map<'left' | 'right', TemplateFinalPreviewPage>>()
  for (const page of interiorPages) {
    if (page.side !== 'left' && page.side !== 'right') return []
    const sides = spreads.get(page.spreadIndex) ?? new Map<'left' | 'right', TemplateFinalPreviewPage>()
    sides.set(page.side, page)
    spreads.set(page.spreadIndex, sides)
  }
  for (let spreadIndex = 1; spreadIndex <= 15; spreadIndex += 1) {
    const spread = spreads.get(spreadIndex)
    if (
      !spread ||
      spread.size !== 2 ||
      spread.get('left')?.pageNumber !== spreadIndex * 2 - 1 ||
      spread.get('right')?.pageNumber !== spreadIndex * 2
    ) {
      return []
    }
  }
  if (spreads.size !== 15) return []

  return result.sort((a, b) => {
    if (a.spreadIndex !== b.spreadIndex) return a.spreadIndex - b.spreadIndex
    if (a.role !== b.role) return a.role === 'final_front_cover' ? -1 : 1
    return a.side === b.side ? 0 : a.side === 'left' ? -1 : 1
  })
}

export function buildTemplateFinalPreviewPresentation(
  pages: TemplateFinalPreviewPage[] | null | undefined
): BookPresentation | null {
  if (!pages?.length) return null
  try {
    return buildBookPresentation(
      pages.map((page) => ({
        id: `template-final-${page.pageIndex}`,
        url: page.url,
        role: page.role,
        spreadIndex: page.spreadIndex,
        side: page.side,
        pageIndex: page.pageIndex,
        pageNumber: page.pageNumber,
        source: { layout: 'single-page' as const },
      })),
      { coverRole: 'final_front_cover', interiorRole: 'final_interior' }
    )
  } catch {
    return null
  }
}
