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
  if (Number(config.schema_version) !== 2 || config.asset_layout !== 'single-page') return []

  const basePath = normalizeStoragePath(config.base_path)
  const pages = Array.isArray(config.pages)
    ? (config.pages as TemplateFinalPreviewConfigPage[])
    : []
  if (!basePath || !pages.length) return []

  const result: TemplateFinalPreviewPage[] = []
  const occupied = new Set<string>()
  for (const page of pages) {
    const pageIndex = Number(page?.index)
    const templateImage = String(page?.template_image ?? '').trim()
    const presentation = page?.presentation
    const role = presentation?.role
    const spreadIndex = Number(presentation?.spread_index)
    const side = presentation?.side
    const rawPageNumber = presentation?.page_number
    const pageNumber = rawPageNumber == null ? null : Number(rawPageNumber)

    if (
      !Number.isInteger(pageIndex) ||
      pageIndex < 0 ||
      !templateImage ||
      !['final_back_cover', 'final_front_cover', 'final_interior'].includes(String(role)) ||
      !Number.isInteger(spreadIndex) ||
      spreadIndex < 0 ||
      (side !== 'left' && side !== 'right')
    ) {
      continue
    }
    if (role === 'final_back_cover' && (spreadIndex !== 0 || side !== 'left' || pageNumber !== null)) {
      continue
    }
    if (role === 'final_front_cover' && (spreadIndex !== 0 || side !== 'right' || pageNumber !== null)) {
      continue
    }
    if (
      role === 'final_interior' &&
      (spreadIndex < 1 || !Number.isInteger(pageNumber) || Number(pageNumber) < 1)
    ) {
      continue
    }

    const positionKey = `${String(role)}:${spreadIndex}:${side}`
    if (occupied.has(positionKey)) return []
    occupied.add(positionKey)
    result.push({
      pageIndex,
      url: toPublicUrl(resolveFinalTemplatePath(basePath, templateImage)),
      role: role as TemplateFinalPreviewPage['role'],
      spreadIndex,
      side,
      pageNumber,
    })
  }

  const backCoverCount = result.filter((page) => page.role === 'final_back_cover').length
  const frontCoverCount = result.filter((page) => page.role === 'final_front_cover').length
  const interiorPages = result.filter((page) => page.role === 'final_interior')
  if (backCoverCount !== 1 || frontCoverCount !== 1 || !interiorPages.length) return []

  const spreads = new Map<number, Set<'left' | 'right'>>()
  for (const page of interiorPages) {
    const sides = spreads.get(page.spreadIndex) ?? new Set<'left' | 'right'>()
    sides.add(page.side)
    spreads.set(page.spreadIndex, sides)
  }
  if ([...spreads.values()].some((sides) => sides.size !== 2)) return []

  return result.sort((a, b) => {
    if (a.spreadIndex !== b.spreadIndex) return a.spreadIndex - b.spreadIndex
    if (a.role !== b.role) return a.role === 'final_back_cover' ? -1 : 1
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
