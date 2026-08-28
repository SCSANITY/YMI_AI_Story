import { isUuid } from '@/lib/validators'

export const FINAL_REPLACEMENT_UPLOAD_BUCKET = 'raw-private'
export const FINAL_REPLACEMENT_UPLOAD_MAX_BYTES = 40 * 1024 * 1024
export const FINAL_REPLACEMENT_STAGING_TTL_MS = 24 * 60 * 60 * 1000

export type FinalReplacementUpload = {
  fileName: string
  sizeBytes: number
  contentType: 'image/jpeg' | 'image/png' | 'image/webp'
}

export class FinalReplacementUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FinalReplacementUploadError'
  }
}

const CONTENT_TYPE_TO_EXTENSION: Record<FinalReplacementUpload['contentType'], 'jpg' | 'png' | 'webp'> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

const EXTENSION_TO_CONTENT_TYPE: Record<string, FinalReplacementUpload['contentType'] | undefined> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

function isSupportedContentType(value: string): value is FinalReplacementUpload['contentType'] {
  return Object.prototype.hasOwnProperty.call(CONTENT_TYPE_TO_EXTENSION, value)
}

function normalizeContentType(value: unknown) {
  const normalized = String(value || '').split(';', 1)[0].trim().toLowerCase()
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized
}

function fileExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)
  return match?.[1] || ''
}

export function validateFinalReplacementUpload(input: {
  fileName: unknown
  sizeBytes: unknown
  contentType: unknown
}): FinalReplacementUpload {
  const fileName = typeof input.fileName === 'string' ? input.fileName.trim() : ''
  if (!fileName || fileName.length > 255) {
    throw new FinalReplacementUploadError('Replacement image filename is invalid')
  }

  const extension = fileExtension(fileName)
  const extensionType = EXTENSION_TO_CONTENT_TYPE[extension]
  const declaredType = normalizeContentType(input.contentType)
  const contentType = declaredType || extensionType
  if (!extensionType || !contentType || !isSupportedContentType(contentType)) {
    throw new FinalReplacementUploadError('Replacement image must be a PNG, JPEG, or WebP file')
  }
  if (declaredType && declaredType !== extensionType) {
    throw new FinalReplacementUploadError('Replacement image file type does not match its filename')
  }

  const sizeBytes = Number(input.sizeBytes)
  if (
    !Number.isInteger(sizeBytes)
    || sizeBytes <= 0
    || sizeBytes > FINAL_REPLACEMENT_UPLOAD_MAX_BYTES
  ) {
    throw new FinalReplacementUploadError(
      `Replacement image must be no larger than ${FINAL_REPLACEMENT_UPLOAD_MAX_BYTES / 1024 / 1024} MB`
    )
  }

  return {
    fileName,
    sizeBytes,
    contentType: contentType as FinalReplacementUpload['contentType'],
  }
}

export function buildFinalReplacementStagingPath(args: {
  finalJobId: string
  pageIndex: number
  reviewIntentId: string
  contentType: FinalReplacementUpload['contentType']
}) {
  if (!isUuid(args.finalJobId) || !isUuid(args.reviewIntentId)) {
    throw new FinalReplacementUploadError('Invalid replacement upload identity')
  }
  if (!Number.isInteger(args.pageIndex) || args.pageIndex < 0) {
    throw new FinalReplacementUploadError('Invalid replacement page index')
  }
  const extension = CONTENT_TYPE_TO_EXTENSION[args.contentType]
  if (!extension) throw new FinalReplacementUploadError('Unsupported replacement image type')
  return `final-review/staging/${args.finalJobId}/page_${args.pageIndex}/${args.reviewIntentId}.${extension}`
}

export function isFinalReplacementStagingPath(args: {
  storagePath: unknown
  finalJobId: string
  pageIndex: number
  reviewIntentId: string
  contentType: FinalReplacementUpload['contentType']
}) {
  if (typeof args.storagePath !== 'string') return false
  try {
    return args.storagePath === buildFinalReplacementStagingPath(args)
  } catch {
    return false
  }
}

export function validateStoredFinalReplacementMetadata(
  declared: FinalReplacementUpload,
  stored: {
    size?: unknown
    contentType?: unknown
    content_type?: unknown
    metadata?: { mimetype?: unknown } | null
  }
) {
  const storedSize = Number(stored.size)
  const storedType = normalizeContentType(
    stored.contentType ?? stored.content_type ?? stored.metadata?.mimetype
  )
  if (!Number.isInteger(storedSize) || storedSize !== declared.sizeBytes) {
    throw new FinalReplacementUploadError('Uploaded replacement image size does not match the selected file')
  }
  if (storedType !== declared.contentType) {
    throw new FinalReplacementUploadError('Uploaded replacement image type does not match the selected file')
  }
  return declared
}

export function assertFinalReplacementSourceFormat(
  contentType: FinalReplacementUpload['contentType'],
  sourceFormat: 'jpeg' | 'png' | 'webp'
) {
  const expected = contentType === 'image/jpeg' ? 'jpeg' : contentType.slice('image/'.length)
  if (sourceFormat !== expected) {
    throw new FinalReplacementUploadError('Replacement image bytes do not match the selected file type')
  }
}
