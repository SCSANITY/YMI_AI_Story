export const MANUAL_PRINT_PDF_BUCKET = 'raw-private'
export const MANUAL_PRINT_PDF_CONTENT_TYPE = 'application/pdf'
export const MANUAL_PRINT_PDF_MAX_BYTES = 250 * 1024 * 1024
export const MANUAL_PRINT_PDF_HEADER_TIMEOUT_MS = 12_000
export const MANUAL_PRINT_PDF_HEADER_ATTEMPTS = 2

const PDF_HEADER = '%PDF-'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export class ManualPrintArtifactError extends Error {}

export type ManualPrintArtifactClient = {
  artifact_id: string
  original_filename: string
  size_bytes: number
  content_type: typeof MANUAL_PRINT_PDF_CONTENT_TYPE
  status: 'verified' | 'released'
  uploaded_at: string
  verified_at: string
  released_at: string | null
  download_url: string | null
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function sanitizeManualPrintFileName(value: unknown) {
  const normalized = typeof value === 'string' ? value.normalize('NFKC') : ''
  const leaf = normalized.split(/[\\/]/).pop() ?? ''
  const cleaned = leaf
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 176)
    .replace(/[. ]+$/g, '')

  if (!cleaned || !/\.pdf$/i.test(cleaned)) {
    throw new ManualPrintArtifactError('Choose a PDF file with a valid .pdf filename.')
  }
  return cleaned
}

export function validateManualPrintUpload(input: {
  fileName: unknown
  sizeBytes: unknown
  contentType: unknown
}) {
  const fileName = sanitizeManualPrintFileName(input.fileName)
  const sizeBytes = Number(input.sizeBytes)
  const contentType = typeof input.contentType === 'string'
    ? input.contentType.toLowerCase().trim()
    : ''

  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
    throw new ManualPrintArtifactError('The print PDF is empty or has an invalid size.')
  }
  if (sizeBytes > MANUAL_PRINT_PDF_MAX_BYTES) {
    throw new ManualPrintArtifactError('The print PDF exceeds the 250 MiB upload limit.')
  }
  if (contentType !== MANUAL_PRINT_PDF_CONTENT_TYPE) {
    throw new ManualPrintArtifactError('Only PDF files are accepted for print release.')
  }

  return { fileName, sizeBytes, contentType: MANUAL_PRINT_PDF_CONTENT_TYPE }
}

export function buildManualPrintStoragePath(orderId: string, artifactId: string) {
  if (!isUuid(orderId) || !isUuid(artifactId)) {
    throw new ManualPrintArtifactError('Invalid print PDF storage identity.')
  }
  return `orders/${orderId}/final/print/manual/${artifactId}.pdf`
}

export function assertStoredManualPrintMetadata(
  info: { size?: unknown; contentType?: unknown; content_type?: unknown },
  expectedSizeBytes: number
) {
  const sizeBytes = Number(info.size)
  const contentType = String(info.contentType ?? info.content_type ?? '').toLowerCase()
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes !== expectedSizeBytes) {
    throw new ManualPrintArtifactError('Uploaded PDF size does not match the selected file.')
  }
  if (sizeBytes <= 0 || sizeBytes > MANUAL_PRINT_PDF_MAX_BYTES) {
    throw new ManualPrintArtifactError('Uploaded PDF size is outside the allowed range.')
  }
  if (contentType !== MANUAL_PRINT_PDF_CONTENT_TYPE) {
    throw new ManualPrintArtifactError('Uploaded object is not stored as application/pdf.')
  }
  return { sizeBytes, contentType: MANUAL_PRINT_PDF_CONTENT_TYPE }
}

export function assertPdfHeader(bytes: Uint8Array) {
  const header = new TextDecoder('ascii').decode(bytes.subarray(0, PDF_HEADER.length))
  if (header !== PDF_HEADER) {
    throw new ManualPrintArtifactError('Uploaded object does not have a valid PDF signature.')
  }
}

export async function readPdfHeader(response: Response) {
  if (!response.ok || !response.body) {
    throw new ManualPrintArtifactError('Unable to inspect the uploaded PDF.')
  }

  const reader = response.body.getReader()
  const header = new Uint8Array(PDF_HEADER.length)
  let offset = 0
  try {
    while (offset < header.length) {
      const { done, value } = await reader.read()
      if (done || !value) break
      const copyLength = Math.min(value.length, header.length - offset)
      header.set(value.subarray(0, copyLength), offset)
      offset += copyLength
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }

  if (offset < header.length) {
    throw new ManualPrintArtifactError('Uploaded PDF is too short to verify.')
  }
  assertPdfHeader(header)
  return header
}

export async function verifyRemotePdfHeader(args: {
  getSignedUrl: () => Promise<string>
  fetchImpl?: typeof fetch
  timeoutMs?: number
  attempts?: number
}) {
  const fetchImpl = args.fetchImpl ?? fetch
  const timeoutMs = Math.max(1, args.timeoutMs ?? MANUAL_PRINT_PDF_HEADER_TIMEOUT_MS)
  const attempts = Math.max(1, args.attempts ?? MANUAL_PRINT_PDF_HEADER_ATTEMPTS)
  let lastError: unknown = null

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const signedUrl = await args.getSignedUrl()
      const response = await fetchImpl(signedUrl, {
        cache: 'no-store',
        headers: { Range: 'bytes=0-4' },
        signal: controller.signal,
      })
      return await readPdfHeader(response)
    } catch (error) {
      lastError = error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  if (lastError instanceof ManualPrintArtifactError) throw lastError
  throw new ManualPrintArtifactError('Print PDF verification timed out. Please try the upload again.')
}
