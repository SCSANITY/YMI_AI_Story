import { isUuid } from '@/lib/validators'
import type { PendingUserAssetUpload } from '@/services/assets'
import { parseSignedPreviewAssets, type SignedPreviewAssets } from '@/lib/preview-page-contract'
import type { PreviewCapacityState } from '@/lib/preview-capacity'
import { parsePreviewJobState, type PreviewJobState } from '@/lib/preview-job-state'
import type { SaveTextProfileResult } from '@/lib/user-profile-history'

export interface JobRecord {
  job_id: string
  job_type: 'preview' | 'final'
  story_language?: 'English' | 'Simplified Chinese' | 'Traditional Chinese' | 'Spanish' | null
  // Read historical provider/job labels verbatim; current purchase types live
  // in purchase-configuration, not in this transport record.
  selected_book_type?: string | null
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancel_requested' | 'cancelled'
  progress?: number | null
  error_message?: string | null
  input_snapshot: Record<string, unknown>
  output_assets?: Record<string, unknown> | null
  capacity_state?: PreviewCapacityState
  created_at?: string
  updated_at?: string
}

export type CreatePreviewVersionInput = {
  creationId: string
  expectedPreviewJobId: string
  variantSessionId: string
  requestId: string
  faceAssetId?: string | null
  pendingFaceAsset?: PendingUserAssetUpload
}

export type CreatePreviewVersionResult = {
  jobId: string
  creationId: string
  variantSessionId: string
  reused: boolean
  sessionVariantCount: number
  sessionVariantCap: number
}

export type CreatePreviewVoiceBinding = {
  assetId: string
}

export type CreatePreviewJobResult = {
  jobId: string
  creationId: string
  textProfile: SaveTextProfileResult | null
}

export type RetryPreviewJobResult = {
  jobId: string
  creationId: string
  status: Extract<JobRecord['status'], 'queued' | 'running' | 'done'>
  reused: boolean
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
  pendingFaceAsset?: PendingUserAssetUpload,
  voiceBinding?: CreatePreviewVoiceBinding
): Promise<CreatePreviewJobResult> {
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
      voice_binding: voiceBinding
        ? {
            asset_id: voiceBinding.assetId,
          }
        : null,
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
  return {
    jobId: String(jobId),
    creationId: String(creationId),
    textProfile: data?.text_profile ?? null,
  }
}

export async function createPreviewVersion(
  input: CreatePreviewVersionInput
): Promise<CreatePreviewVersionResult> {
  if (!isUuid(input.creationId)) throw new Error('Invalid creationId')
  if (!isUuid(input.expectedPreviewJobId)) throw new Error('Invalid expectedPreviewJobId')
  if (!isUuid(input.variantSessionId)) throw new Error('Invalid variantSessionId')
  if (!isUuid(input.requestId)) throw new Error('Invalid requestId')
  if (!input.pendingFaceAsset && !isUuid(input.faceAssetId)) {
    throw new Error('A face asset is required')
  }

  const response = await fetch(
    `/api/creations/${encodeURIComponent(input.creationId)}/preview-versions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        expected_preview_job_id: input.expectedPreviewJobId,
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
      data?.error || 'Failed to create preview version',
      response.status,
      data?.code
    )
  }

  if (!isUuid(data?.jobId) || !isUuid(data?.creationId)) {
    throw new Error('Preview version response is invalid')
  }

  return {
    jobId: data.jobId,
    creationId: data.creationId,
    variantSessionId: String(data.variantSessionId || input.variantSessionId),
    reused: Boolean(data.reused),
    sessionVariantCount: Number(data.sessionVariantCount || 0),
    sessionVariantCap: Number(data.sessionVariantCap || 0),
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

export class JobRequestError extends Error {
  readonly status: number
  readonly code: string | null

  constructor(message: string, status: number, code?: string | null) {
    super(message)
    this.name = 'JobRequestError'
    this.status = status
    this.code = code ?? null
  }
}

async function readJobRequestError(
  response: Response,
  fallbackMessage: string
): Promise<JobRequestError> {
  let detail: string | null = null
  let code: string | null = null
  try {
    const data = await response.json()
    detail = typeof data?.error === 'string' ? data.error : null
    code = typeof data?.code === 'string' ? data.code : null
  } catch {
    // Keep the response status even when an upstream body is not JSON.
  }

  return new JobRequestError(
    detail ? `${fallbackMessage}: ${detail}` : fallbackMessage,
    response.status,
    code
  )
}

export function isTerminalJobAccessError(error: unknown) {
  return error instanceof JobRequestError && [401, 403, 404].includes(error.status)
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
    throw await readJobRequestError(response, 'Failed to fetch job')
  }
  return (await response.json()) as JobRecord
}

export async function getPreviewJobState(
  jobId: string,
  customerId?: string | null
): Promise<PreviewJobState> {
  if (!jobId) throw new Error('Missing job ID')
  if (!isUuid(jobId)) throw new Error(`Invalid job ID: ${jobId}`)

  const response = await fetchWithTimeout(
    appendCustomerId(`/api/jobs/${jobId}/preview-state`, customerId),
    { credentials: 'include', cache: 'no-store' },
    30000
  )
  if (!response.ok) {
    throw await readJobRequestError(response, 'Failed to fetch Preview state')
  }
  return parsePreviewJobState(await response.json())
}

export async function retryPreviewJob(
  jobId: string,
  creationId: string,
  customerId?: string | null
): Promise<RetryPreviewJobResult> {
  if (!isUuid(jobId)) throw new Error('Invalid Preview job ID')
  if (!isUuid(creationId)) throw new Error('Invalid creation ID')

  const response = await fetchWithTimeout(
    `/api/jobs/${encodeURIComponent(jobId)}/retry`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ creationId, customerId: customerId ?? null }),
    },
    30_000
  )
  if (!response.ok) {
    throw await readJobRequestError(response, 'Failed to retry Preview')
  }

  const data = await response.json()
  if (
    !isUuid(data?.jobId) ||
    !isUuid(data?.creationId) ||
    (data?.status !== 'queued' && data?.status !== 'running' && data?.status !== 'done')
  ) {
    throw new Error('Preview retry response is invalid')
  }

  return {
    jobId: data.jobId,
    creationId: data.creationId,
    status: data.status,
    reused: Boolean(data.reused),
  }
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

export async function getPreviewPageAssets(
  jobId: string,
  pageIndices?: number[],
  options?: { size?: 'small' | 'full'; customerId?: string | null }
): Promise<SignedPreviewAssets | null> {
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
  if (response.status === 202) return null
  if (!response.ok) {
    throw await readJobRequestError(response, 'Failed to fetch preview URLs')
  }
  return parseSignedPreviewAssets(await response.json())
}
