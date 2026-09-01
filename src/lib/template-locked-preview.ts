import type {
  TemplateLockedPreviewPage,
  TemplatePreviewFirstSpreadPage,
} from '@/types'
import {
  buildBookPresentation,
  resolveBookLeaf,
  type BookPresentation,
} from '@/lib/book-presentation'

const LOCKED_PREVIEW_IMAGE_PATTERN = /^page(0[1-9]|1[0-5])_([LR])_([AB])\.webp$/i
const FIRST_SPREAD_PREVIEW_IMAGE_PATTERN = /^preview1_([LR])_([AB])\.webp$/i

type LockedPreviewStorageObject = {
  name?: unknown
  created_at?: unknown
  updated_at?: unknown
  metadata?: {
    mimetype?: unknown
  } | null
}

function normalizeTemplateId(value: unknown) {
  return String(value ?? '').trim().replace(/^\/+|\/+$/g, '')
}

function appendObjectVersion(url: string, value: unknown) {
  const version = String(value ?? '').trim()
  if (!url || !version) return url
  return `${url}${url.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}`
}

export function parseTemplateLockedPreviewPages(
  templateIdValue: unknown,
  value: unknown,
  toPublicUrl: (storagePath: string) => string
): TemplateLockedPreviewPage[] {
  const templateId = normalizeTemplateId(templateIdValue)
  const objects = Array.isArray(value) ? (value as LockedPreviewStorageObject[]) : []
  if (!templateId || !objects.length) return []

  const candidatesByCoordinate = new Map<string, TemplateLockedPreviewPage[]>()

  for (const object of objects) {
    const sourceName = String(object?.name ?? '').trim()
    const match = sourceName.match(LOCKED_PREVIEW_IMAGE_PATTERN)
    if (!match) continue

    const mimeType = String(object?.metadata?.mimetype ?? '').trim().toLowerCase()
    if (mimeType && mimeType !== 'image/webp') continue

    const spreadIndex = Number(match[1])
    const side = match[2].toUpperCase() === 'L' ? 'left' : 'right'
    const coordinate = `${spreadIndex}:${side}`
    const path = `${templateId}/preview-final/${sourceName}`
    const url = appendObjectVersion(
      toPublicUrl(path),
      object.updated_at ?? object.created_at
    )
    if (!url) continue

    const candidate: TemplateLockedPreviewPage = {
      sourceName,
      url,
      spreadIndex,
      side,
      pageNumber: (spreadIndex - 1) * 2 + (side === 'left' ? 1 : 2),
    }
    const coordinateCandidates = candidatesByCoordinate.get(coordinate) ?? []
    coordinateCandidates.push(candidate)
    candidatesByCoordinate.set(coordinate, coordinateCandidates)
  }

  const pages: TemplateLockedPreviewPage[] = []
  for (let spreadIndex = 1; spreadIndex <= 15; spreadIndex += 1) {
    const left = candidatesByCoordinate.get(`${spreadIndex}:left`) ?? []
    const right = candidatesByCoordinate.get(`${spreadIndex}:right`) ?? []
    if (left.length !== 1 || right.length !== 1) continue
    pages.push(left[0], right[0])
  }
  return pages
}

export function parseTemplatePreviewFirstSpreadPages(
  templateIdValue: unknown,
  value: unknown,
  toPublicUrl: (storagePath: string) => string
): TemplatePreviewFirstSpreadPage[] {
  const templateId = normalizeTemplateId(templateIdValue)
  const objects = Array.isArray(value) ? (value as LockedPreviewStorageObject[]) : []
  if (!templateId || !objects.length) return []

  const candidatesBySide = new Map<'left' | 'right', TemplatePreviewFirstSpreadPage[]>()

  for (const object of objects) {
    const sourceName = String(object?.name ?? '').trim()
    const match = sourceName.match(FIRST_SPREAD_PREVIEW_IMAGE_PATTERN)
    if (!match) continue

    const mimeType = String(object?.metadata?.mimetype ?? '').trim().toLowerCase()
    if (mimeType && mimeType !== 'image/webp') continue

    const side = match[1].toUpperCase() === 'L' ? 'left' : 'right'
    const path = `${templateId}/${sourceName}`
    const url = appendObjectVersion(
      toPublicUrl(path),
      object.updated_at ?? object.created_at
    )
    if (!url) continue

    const candidate: TemplatePreviewFirstSpreadPage = {
      sourceName,
      url,
      spreadIndex: 1,
      side,
      pageNumber: side === 'left' ? 1 : 2,
    }
    const sideCandidates = candidatesBySide.get(side) ?? []
    sideCandidates.push(candidate)
    candidatesBySide.set(side, sideCandidates)
  }

  return (['left', 'right'] as const).flatMap((side) => {
    const candidates = candidatesBySide.get(side) ?? []
    return candidates.length === 1 ? candidates : []
  })
}

export function buildTemplateLockedPreviewPresentation(
  pages: TemplateLockedPreviewPage[] | null | undefined
): BookPresentation | null {
  if (!pages?.length) return null
  try {
    return buildBookPresentation(
      pages.map((page) => ({
        id: `template-locked-${page.spreadIndex}-${page.side}`,
        url: page.url,
        role: 'final_interior' as const,
        spreadIndex: page.spreadIndex,
        side: page.side,
        pageNumber: page.pageNumber,
        source: { layout: 'single-page' as const },
      })),
      { coverRole: 'final_front_cover', interiorRole: 'final_interior' }
    )
  } catch {
    return null
  }
}

export function buildTemplatePreviewFirstSpreadPresentation(
  pages: TemplatePreviewFirstSpreadPage[] | null | undefined
): BookPresentation | null {
  if (!pages?.length) return null
  try {
    return buildBookPresentation(
      pages.map((page) => ({
        id: `template-preview-first-spread-${page.side}`,
        url: page.url,
        role: 'preview_interior' as const,
        spreadIndex: 1,
        side: page.side,
        pageNumber: page.pageNumber,
        source: { layout: 'single-page' as const },
      })),
      { coverRole: 'preview_cover', interiorRole: 'preview_interior' }
    )
  } catch {
    return null
  }
}

export function getTemplatePreviewFirstSpreadDisplayUrls(
  generatedPresentation: BookPresentation | null | undefined,
  underlayPresentation: BookPresentation | null | undefined
): string[] {
  return (['left', 'right'] as const).flatMap((side) => {
    const url = resolveBookLeaf(generatedPresentation, 1, side)?.url
      || resolveBookLeaf(underlayPresentation, 1, side)?.url
    return url ? [url] : []
  })
}
