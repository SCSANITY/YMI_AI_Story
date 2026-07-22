import { isUuid } from '@/lib/validators'

const PREVIEW_SOURCE = 'preview'
const BOOK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

type PreviewCartOrigin = {
  bookId: string
  creationId: string
  committedPreviewJobId: string
}

export type CartBackNavigation = {
  href: string
  method: 'assign' | 'push' | 'replace'
}

function normalizeBookId(value: unknown) {
  if (typeof value !== 'string' || value !== value.trim()) return null
  return BOOK_ID_PATTERN.test(value) ? value : null
}

function hasSingleValue(params: URLSearchParams, key: string) {
  return params.getAll(key).length === 1
}

export function buildPreviewCartHref({
  bookId,
  creationId,
  committedPreviewJobId,
}: PreviewCartOrigin) {
  const safeBookId = normalizeBookId(bookId)
  if (!safeBookId || !isUuid(creationId) || !isUuid(committedPreviewJobId)) {
    return '/cart'
  }

  const params = new URLSearchParams({
    from: PREVIEW_SOURCE,
    bookId: safeBookId,
    creationId,
    jobId: committedPreviewJobId,
  })
  return `/cart?${params.toString()}`
}

export function resolvePreviewCartReturnPath(search: string | URLSearchParams) {
  const params = typeof search === 'string'
    ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    : search

  if (
    !hasSingleValue(params, 'from') ||
    !hasSingleValue(params, 'bookId') ||
    !hasSingleValue(params, 'creationId') ||
    !hasSingleValue(params, 'jobId') ||
    params.get('from') !== PREVIEW_SOURCE
  ) {
    return null
  }

  const bookId = normalizeBookId(params.get('bookId'))
  const creationId = params.get('creationId')
  const jobId = params.get('jobId')
  if (!bookId || !isUuid(creationId) || !isUuid(jobId)) return null

  const previewParams = new URLSearchParams({
    view: 'preview',
    creationId,
    jobId,
  })
  return `/personalize/${encodeURIComponent(bookId)}?${previewParams.toString()}`
}

export function resolveCartBackNavigation(
  search: string | URLSearchParams,
  browserTranslated: boolean
): CartBackNavigation {
  const returnPath = resolvePreviewCartReturnPath(search)
  const href = returnPath ?? '/'
  if (browserTranslated) return { href, method: 'assign' }
  return returnPath
    ? { href, method: 'replace' }
    : { href, method: 'push' }
}
