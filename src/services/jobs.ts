import { isUuid } from '@/lib/validators'

export interface JobRecord {
  job_id: string
  job_type: 'preview' | 'final'
  story_language?: 'English' | 'Traditional Chinese' | 'Spanish' | null
  selected_book_type?: 'Cloud Explorer' | 'Classic' | 'Immersive' | 'Signature Voice' | null
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancel_requested' | 'cancelled'
  progress?: number | null
  error_message?: string | null
  input_snapshot: Record<string, unknown>
  output_assets?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
}

const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = 15000
) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export async function createPreviewJob(
  templateId: string,
  faceAssetId: string,
  textOverrides?: Record<string, unknown>,
  params?: Record<string, unknown>,
  customerId?: string
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

export async function getJob(jobId: string): Promise<JobRecord> {
  if (!jobId) throw new Error('Missing job ID')
  if (!isUuid(jobId)) {
    throw new Error(`Invalid job ID: ${jobId}`)
  }
  const response = await fetchWithTimeout(
    `/api/jobs/${jobId}`,
    { credentials: 'include' },
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

export async function getPreviewUrl(jobId: string): Promise<string> {
  if (!jobId) {
    throw new Error('Missing job ID')
  }
  if (!isUuid(jobId)) {
    throw new Error(`Invalid job ID: ${jobId}`)
  }
  const response = await fetchWithTimeout(
    `/api/jobs/${jobId}/preview-url`,
    { credentials: 'include' },
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
  options?: { size?: 'small' | 'full' }
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
  const query = params.toString()
  const response = await fetchWithTimeout(
    `/api/jobs/${jobId}/preview-url${query ? `?${query}` : ''}`,
    { credentials: 'include' },
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
