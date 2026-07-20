import { isUuid } from '@/lib/validators'
import type { PendingUserAssetUpload } from '@/services/assets'

export interface JobRecord {
  job_id: string
  job_type: 'preview' | 'final'
  story_language?: 'English' | 'Simplified Chinese' | 'Traditional Chinese' | 'Spanish' | null
  selected_book_type?: 'Cloud Explorer' | 'Classic' | 'Immersive' | 'Signature Voice' | null
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancel_requested' | 'cancelled'
  progress?: number | null
  error_message?: string | null
  input_snapshot: Record<string, unknown>
  output_assets?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
}

export type CreatePreviewVariantInput = {
  creationId: string
  variantSessionId: string
  requestId: string
  faceAssetId?: string | null
  pendingFaceAsset?: PendingUserAssetUpload
}

export type CreatePreviewVariantResult = {
  jobId: string
  creationId: string
  variantSessionId: string
  status: JobRecord['status']
  reused: boolean
  sessionVariantCount: number
  sessionVariantCap: number
}

export type CommitPreviewVariantInput = {
  creationId: string
  expectedPreviewJobId: string
  selectedPreviewJobId: string
  variantSessionId?: string | null
}

export type CommitPreviewVariantResult = {
  result: 'committed' | 'idempotent'
  creationId: string
  activePreviewJobId: string
  discardedJobCount: number
}

export type DiscardPreviewVariantInput = {
  creationId: string
  jobId: string
  variantSessionId: string
}

export type DiscardPreviewVariantSessionInput = {
  creationId: string
  variantSessionId: string
  keepalive?: boolean
}

export class PreviewVariantRequestError extends Error {
  status: number
  code: string | null

  constructor(message: string, status: number, code?: string | null) {
    super(message)
    this.name = 'PreviewVariantRequestError'
    this.status = status
    this.code = code ?? null
  }
}

function appendCustomerId(url: string, customerId?: string | null) {
  if (!customerId) return url
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}customerId=${encodeURIComponent(customerId)}`
}

const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = 15000
) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { cache: 'no-store', ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function createPreviewJob(
  templateId: string,
  faceAssetId: string,
  textOverrides?: Record<string, unknown>,
  params?: Record<string, unknown>,
  customerId?: string,
  pendingFaceAsset?: PendingUserAssetUpload
): Promise<{ jobId: string; creationId: string }> {
  if (!templateId || !faceAssetId) throw new Error('Template ID and face asset ID are required')

  const response = await fetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template_id: templateId,
      face_asset_id: faceAssetId,
      text_overrides: textOverrides ?? null,
      params: params ?? null,
      customerId: customerId ?? null,
      pending_face_asset: pendingFaceAsset ?? null,
    }),
    credentials: 'include',
  })

  if (!response.ok) {
    let details = ''
    try {
      const data = await response.json()
      if (data?.error) {
        details = `: ${data.error}`
      }
    } catch {
      // no-op
    }
    throw new Error(`Failed to create preview job${details}`)
  }

  const data = await response.json()
  const jobId = data?.jobId ?? data?.job_id ?? data?.job?.job_id
  const creationId = data?.creationId ?? data?.creation_id
  if (!jobId) {
    throw new Error('Preview job missing jobId')
  }
  if (!creationId) {
    throw new Error('Preview job missing creationId')
  }
  if (!isUuid(String(jobId))) {
    throw new Error(`Invalid jobId returned: ${jobId}`)
  }
  if (!isUuid(String(creationId))) {
    throw new Error(`Invalid creationId returned: ${creationId}`)
  }
  return { jobId: String(jobId), creationId: String(creationId) }
}

export async function createPreviewVariant(
  input: CreatePreviewVariantInput
): Promise<CreatePreviewVariantResult> {
  if (!isUuid(input.creationId)) throw new Error('Invalid creationId')
  if (!isUuid(input.variantSessionId)) throw new Error('Invalid variantSessionId')
  if (!isUuid(input.requestId)) throw new Error('Invalid requestId')
  if (!input.pendingFaceAsset && !isUuid(input.faceAssetId)) {
    throw new Error('A face asset is required')
  }

  const response = await fetch(
    `/api/creations/${encodeURIComponent(input.creationId)}/preview-variants`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        variant_session_id: input.variantSessionId,
        request_id: input.requestId,
        face_asset_id: input.faceAssetId ?? null,
        pending_face_asset: input.pendingFaceAsset ?? null,
      }),
    }
  )

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new PreviewVariantRequestError(
      data?.error || 'Failed to create preview variant',
      response.status,
      data?.code
    )
  }

  if (!isUuid(data?.jobId) || !isUuid(data?.creationId)) {
    throw new Error('Preview variant response is invalid')
  }

  return {
    jobId: data.jobId,
    creationId: data.creationId,
    variantSessionId: String(data.variantSessionId || input.variantSessionId),
    status: data.status as JobRecord['status'],
    reused: Boolean(data.reused),
    sessionVariantCount: Number(data.sessionVariantCount || 0),
    sessionVariantCap: Number(data.sessionVariantCap || 0),
  }
}

export async function commitPreviewVariant(
  input: CommitPreviewVariantInput
): Promise<CommitPreviewVariantResult> {
  if (!isUuid(input.creationId)) throw new Error('Invalid creationId')
  if (!isUuid(input.expectedPreviewJobId)) throw new Error('Invalid expectedPreviewJobId')
  if (!isUuid(input.selectedPreviewJobId)) throw new Error('Invalid selectedPreviewJobId')
  if (input.variantSessionId && !isUuid(input.variantSessionId)) {
    throw new Error('Invalid variantSessionId')
  }

  const response = await fetch(
    `/api/creations/${encodeURIComponent(input.creationId)}/preview-variants/commit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        expected_preview_job_id: input.expectedPreviewJobId,
        selected_preview_job_id: input.selectedPreviewJobId,
        variant_session_id: input.variantSessionId ?? null,
      }),
    }
  )

  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new PreviewVariantRequestError(
      data?.error || 'Failed to commit preview selection',
      response.status,
      data?.code
    )
  }

  if (!isUuid(data?.activePreviewJobId) || !isUuid(data?.creationId)) {
    throw new Error('Preview commit response is invalid')
  }

  return {
    result: data.result === 'idempotent' ? 'idempotent' : 'committed',
    creationId: data.creationId,
    activePreviewJobId: data.activePreviewJobId,
    discardedJobCount: Number(data.discardedJobCount ?? 0),
  }
}

export async function discardPreviewVariant(input: DiscardPreviewVariantInput) {
  if (!isUuid(input.creationId)) throw new Error('Invalid creationId')
  if (!isUuid(input.jobId)) throw new Error('Invalid jobId')
  if (!isUuid(input.variantSessionId)) throw new Error('Invalid variantSessionId')

  const response = await fetch(
    `/api/creations/${encodeURIComponent(input.creationId)}/preview-variants/${encodeURIComponent(input.jobId)}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ variant_session_id: input.variantSessionId }),
    }
  )
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new PreviewVariantRequestError(
      data?.error || 'Failed to discard preview variant',
      response.status,
      data?.code
    )
  }

  return {
    jobId: String(data?.jobId || input.jobId),
    status: data?.status as JobRecord['status'],
    discarded: Boolean(data?.discarded),
  }
}

export async function discardPreviewVariantSession(
  input: DiscardPreviewVariantSessionInput
) {
  if (!isUuid(input.creationId)) throw new Error('Invalid creationId')
  if (!isUuid(input.variantSessionId)) throw new Error('Invalid variantSessionId')

  const response = await fetch(
    `/api/creations/${encodeURIComponent(input.creationId)}/preview-variants`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      keepalive: input.keepalive,
      body: JSON.stringify({ variant_session_id: input.variantSessionId }),
    }
  )
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new PreviewVariantRequestError(
      data?.error || 'Failed to discard preview variants',
      response.status,
      data?.code
    )
  }

  return {
    discardedJobCount: Number(data?.discardedJobCount ?? 0),
  }
}

export async function updatePreviewJobInput(
  jobId: string,
  faceSourcePath: string,
  textOverrides?: Record<string, unknown>,
  params?: Record<string, unknown>
): Promise<void> {
  if (!jobId || !faceSourcePath) {
    throw new Error('Job ID and face source path are required')
  }

  const response = await fetch('/api/jobs', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobId,
      face_source_path: faceSourcePath,
      textOverrides: textOverrides ?? null,
      params: params ?? null,
    }),
    credentials: 'include',
  })

  if (!response.ok) {
    throw new Error('Failed to update job input')
  }
}

export async function getJob(jobId: string, customerId?: string | null): Promise<JobRecord> {
  if (!jobId) throw new Error('Missing job ID')
  if (!isUuid(jobId)) {
    throw new Error(`Invalid job ID: ${jobId}`)
  }
  const response = await fetchWithTimeout(
    appendCustomerId(`/api/jobs/${jobId}`, customerId),
    { credentials: 'include', cache: 'no-store' },
    30000
  )
  if (!response.ok) {
    let details = ''
    try {
      const data = await response.json()
      if (data?.error) {
        details = `: ${data.error}`
      }
    } catch {
      // no-op
    }
    throw new Error(`Failed to fetch job${details}`)
  }
  return (await response.json()) as JobRecord
}

export async function cancelPreviewJob(
  jobId: string,
  options?: { creationId?: string | null; customerId?: string | null }
): Promise<{ ok: boolean; status: JobRecord['status']; jobId: string }> {
  if (!jobId) throw new Error('Missing job ID')
  if (!isUuid(jobId)) {
    throw new Error(`Invalid job ID: ${jobId}`)
  }

  const response = await fetch(`/api/jobs/${jobId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      creationId: options?.creationId ?? null,
      customerId: options?.customerId ?? null,
    }),
  })

  if (!response.ok) {
    let details = ''
    try {
      const data = await response.json()
      if (data?.error) {
        details = `: ${data.error}`
      }
    } catch {
      // no-op
    }
    throw new Error(`Failed to cancel preview job${details}`)
  }

  const data = await response.json()
  return {
    ok: Boolean(data?.ok),
    status: data?.status as JobRecord['status'],
    jobId: String(data?.jobId ?? jobId),
  }
}

export async function getPreviewUrl(jobId: string, customerId?: string | null): Promise<string> {
  if (!jobId) {
    throw new Error('Missing job ID')
  }
  if (!isUuid(jobId)) {
    throw new Error(`Invalid job ID: ${jobId}`)
  }
  const response = await fetchWithTimeout(
    appendCustomerId(`/api/jobs/${jobId}/preview-url`, customerId),
    { credentials: 'include', cache: 'no-store' },
    15000
  )
  if (!response.ok) {
    throw new Error('Failed to fetch preview URL')
  }
  const data = await response.json()
  return data.url as string
}

export async function getPreviewPages(
  jobId: string,
  pageIndices?: number[],
  options?: { size?: 'small' | 'full'; customerId?: string | null }
): Promise<string[]> {
  if (!jobId) {
    throw new Error('Missing job ID')
  }
  if (!isUuid(jobId)) {
    throw new Error(`Invalid job ID: ${jobId}`)
  }

  const params = new URLSearchParams()
  if (Array.isArray(pageIndices) && pageIndices.length) {
    params.set('pages', pageIndices.join(','))
  }
  if (options?.size) {
    params.set('size', options.size)
  }
  if (options?.customerId) {
    params.set('customerId', options.customerId)
  }
  const query = params.toString()
  const response = await fetchWithTimeout(
    `/api/jobs/${jobId}/preview-url${query ? `?${query}` : ''}`,
    { credentials: 'include', cache: 'no-store' },
    15000
  )
  if (!response.ok) {
    let details = ''
    try {
      const data = await response.json()
      if (data?.error) {
        details = `: ${data.error}`
      }
    } catch {
      // no-op
    }
    throw new Error(`Failed to fetch preview URLs${details}`)
  }
  const data = await response.json()
  const urls = Array.isArray(data?.urls) ? data.urls : []
  if (urls.length) return urls as string[]
  if (typeof data?.url === 'string') return [data.url]
  return []
}
