import axios from 'axios'

const FALLBACK_MOCK_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+4XkAAAAASUVORK5CYII='

const DEFAULT_POLL_INTERVAL_MS = Number.parseInt(process.env.RUNCOMFY_POLL_INTERVAL_MS || '5000', 10)
const DEFAULT_POLL_TIMEOUT_MS = Number.parseInt(process.env.RUNCOMFY_POLL_TIMEOUT_MS || '3600000', 10)
const DEFAULT_STATUS_RETRY_MAX = Number.parseInt(process.env.RUNCOMFY_STATUS_RETRY_MAX || '2', 10)
const DEFAULT_RESULT_RETRY_MAX = Number.parseInt(process.env.RUNCOMFY_RESULT_RETRY_MAX || '2', 10)

export type InputSnapshot = {
  face_source_path?: string
  config_url?: string
  text_overrides?: Record<string, unknown>
  final_page_indices?: number[]
  final_page_index?: number
  final_rerun_page_index?: number
  params?: {
    face_strength?: number
    style_strength?: number
    cfg_scale?: number
    step?: number
    seed?: number
  }
}

export type TemplatePage = {
  index: number
  template_image?: string
  Target_image?: string
  enable_face_swap?: boolean
  subtitle_render?: boolean
  params_override?: Record<string, unknown>
  workflow_overrides?: Partial<Record<WorkflowStageKey, PageWorkflowOverride>>
}

export type WorkflowStageKey = 'preview_face' | 'final_face'

export type InputBinding = {
  node_id: string
  input_key?: string
}

export type ProviderStageConfig = {
  enabled?: boolean
  deployment_id?: string
  result_node_id?: string
  workflow_json_path?: string
  seed_node_id?: string
  seed_input_key?: string
  seed?: number
  prompt_input?: InputBinding
  runpod_image_names?: {
    template_image?: string
    user_face_image?: string
  }
  dynamic_inputs?: {
    template_image?: InputBinding
    user_face_image?: InputBinding
  }
  static_inputs?: Record<string, Record<string, unknown>>
}

export type PageWorkflowOverride = {
  prompt?: string
  seed?: number
  static_inputs?: Record<string, Record<string, unknown>>
}

export type ProviderWorkflowConfig = {
  provider?: string
  stages?: Partial<Record<WorkflowStageKey, ProviderStageConfig>>
}

export type SubtitleRenderConfig = {
  enabled?: boolean
  template_path?: string
  fonts_path?: string
  placeholder_keys?: string[]
  template_variants?: Array<{
    id?: string
    template_path?: string
    when?: {
      child_age_min?: number
      child_age_max?: number
    }
  }>
  page_runtime_images?: {
    preview?: Record<string, string>
    final?: Record<string, string>
  }
}

export type TemplateConfig = {
  template_id?: string
  base_path?: string
  params_override?: Record<string, unknown>
  pages: TemplatePage[]
  preview?: {
    page_indices: number[]
  }
  final?: {
    page_indices: number[]
  }
  workflow: ProviderWorkflowConfig
  subtitle_render?: SubtitleRenderConfig
}

export type ProviderWorkflowCall = {
  stageKey: WorkflowStageKey
  stage: ProviderStageConfig
  payload: Record<string, unknown>
  faceUrl: string
  renderedTemplateUrl: string
  pageWorkflowOverride?: PageWorkflowOverride | null
  mockResultBuffer?: Buffer | null
  throwIfCancelled?: () => Promise<void> | void
  pollTimeoutMs?: number
  pollIntervalMs?: number
  statusRetryMax?: number
  resultRetryMax?: number
  onProviderEvent?: (state: ProviderRunState) => Promise<void> | void
}

export type ProviderPayloadBuildResult = {
  payload: Record<string, unknown>
}

export type ProviderRunState = {
  provider: string
  stage: WorkflowStageKey
  deployment_id: string
  request_id: string | null
  status_url: string | null
  result_url: string | null
  status: string
  started_at?: string
  finished_at?: string
  error?: string | null
}

export type RunComfyInputBinding = InputBinding
export type RunComfyStageConfig = ProviderStageConfig
export type WorkflowConfig = ProviderWorkflowConfig
export type WorkflowCall = ProviderWorkflowCall
export type PayloadBuildResult = ProviderPayloadBuildResult
export type RunComfyProviderRun = ProviderRunState

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function cloneStaticInputs(
  staticInputs?: Record<string, Record<string, unknown>>
): Record<string, { inputs: Record<string, unknown> }> {
  const overrides: Record<string, { inputs: Record<string, unknown> }> = {}
  if (!staticInputs) return overrides

  for (const [nodeId, inputs] of Object.entries(staticInputs)) {
    overrides[nodeId] = { inputs: { ...inputs } }
  }

  return overrides
}

function mergeNodeInput(
  overrides: Record<string, { inputs: Record<string, unknown> }>,
  binding: InputBinding | undefined,
  value: unknown
) {
  if (!binding?.node_id) return
  const inputKey = binding.input_key?.trim() || 'value'
  const nodeId = binding.node_id.trim()
  if (!nodeId) return

  overrides[nodeId] ??= { inputs: {} }
  overrides[nodeId].inputs[inputKey] = value
}

function assertStageConfig(stageKey: WorkflowStageKey, stage: ProviderStageConfig) {
  const deploymentId = stage.deployment_id?.trim()
  if (!deploymentId) {
    throw new Error(`Missing RunComfy deployment_id for stage ${stageKey}`)
  }

  const templateBinding = stage.dynamic_inputs?.template_image
  if (!templateBinding?.node_id) {
    throw new Error(`Missing template_image binding for stage ${stageKey}`)
  }

  const faceBinding = stage.dynamic_inputs?.user_face_image
  if (!faceBinding?.node_id) {
    throw new Error(`Missing user_face_image binding for stage ${stageKey}`)
  }
}

export function constructProviderPayload(args: {
  faceUrl: string
  renderedTemplateUrl: string
  stageKey: WorkflowStageKey
  stage: ProviderStageConfig
}): ProviderPayloadBuildResult {
  const { faceUrl, renderedTemplateUrl, stageKey, stage } = args

  assertStageConfig(stageKey, stage)

  const overrides = cloneStaticInputs(stage.static_inputs)

  mergeNodeInput(overrides, stage.dynamic_inputs?.template_image, renderedTemplateUrl)
  mergeNodeInput(overrides, stage.dynamic_inputs?.user_face_image, faceUrl)

  return {
    payload: { overrides },
  }
}

function normalizeStatus(status: unknown): string {
  return typeof status === 'string' ? status.trim().toUpperCase() : ''
}

function isRetriableStatus(status?: number): boolean {
  if (!status) return false
  if (status === 408 || status === 409 || status === 425 || status === 429) return true
  return status >= 500 && status <= 599
}

function isRetriableTransportError(error: any): boolean {
  const status = error?.response?.status as number | undefined
  if (isRetriableStatus(status)) return true

  const code = String(error?.code || '').toUpperCase()
  return (
    code.includes('ECONNRESET') ||
    code.includes('ECONNABORTED') ||
    code.includes('ETIMEDOUT') ||
    code.includes('EAI_AGAIN') ||
    code.includes('ENOTFOUND') ||
    code.includes('UND_ERR_SOCKET')
  )
}

function readErrorText(data: any): string {
  if (!data) return ''
  if (typeof data === 'string') return data
  if (typeof data?.message === 'string') return data.message
  if (typeof data?.error === 'string') return data.error
  if (typeof data?.detail === 'string') return data.detail
  if (typeof data?.details === 'string') return data.details
  if (typeof data?.status_message === 'string') return data.status_message
  if (typeof data?.status_details === 'string') return data.status_details
  return ''
}

function normalizeHttpError(prefix: string, error: any): Error {
  const status = error?.response?.status as number | undefined
  const responseData = error?.response?.data
  const detail = readErrorText(responseData) || String(error?.message || prefix)
  return new Error(status ? `${prefix} (${status}): ${detail}` : `${prefix}: ${detail}`)
}

async function withGetRetry<T>(
  taskName: string,
  fn: () => Promise<T>,
  maxAttempts: number
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error
      const canRetry = attempt < maxAttempts && isRetriableTransportError(error)
      if (!canRetry) {
        throw normalizeHttpError(`RunComfy ${taskName} failed`, error)
      }
      const waitMs = 1000 * attempt + Math.floor(Math.random() * 300)
      console.warn(`[runcomfy] ${taskName} attempt ${attempt}/${maxAttempts} failed, retrying in ${waitMs}ms`)
      await sleep(waitMs)
    }
  }
  throw normalizeHttpError(`RunComfy ${taskName} failed`, lastError)
}

function buildRequestUrls(args: {
  deploymentId: string
  requestId: string
  statusUrl?: string | null
  resultUrl?: string | null
}) {
  const { deploymentId, requestId, statusUrl, resultUrl } = args
  const base = `https://api.runcomfy.net/prod/v1/deployments/${deploymentId}/requests/${requestId}`
  return {
    statusUrl: statusUrl || `${base}/status`,
    resultUrl: resultUrl || `${base}/result`,
  }
}

function readRequestId(data: any): string | null {
  const value = data?.request_id || data?.id || data?.run_id || data?.requestId
  if (typeof value === 'string' && value.trim().length > 0) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function readFirstImageUrlFromOutputs(outputs: any): string | null {
  if (!outputs || typeof outputs !== 'object') return null

  for (const nodeValue of Object.values(outputs)) {
    const url =
      (nodeValue as any)?.images?.[0]?.url ||
      (nodeValue as any)?.images?.[0]?.image_url ||
      (nodeValue as any)?.url ||
      null
    if (typeof url === 'string' && url.trim().length > 0) {
      return url.trim()
    }
  }

  return null
}

function resolveResultImageUrl(resultData: any, resultNodeId?: string): string {
  const directUrl =
    resultData?.output_url ||
    resultData?.image_url ||
    resultData?.url ||
    resultData?.result?.url ||
    null
  if (typeof directUrl === 'string' && directUrl.trim().length > 0) {
    return directUrl.trim()
  }

  const outputs = resultData?.outputs || resultData?.result?.outputs || null
  if (resultNodeId && outputs?.[resultNodeId]) {
    const node = outputs[resultNodeId]
    const keyedUrl = node?.images?.[0]?.url || node?.images?.[0]?.image_url || node?.url || null
    if (typeof keyedUrl === 'string' && keyedUrl.trim().length > 0) {
      return keyedUrl.trim()
    }
  }

  const firstUrl = readFirstImageUrlFromOutputs(outputs)
  if (firstUrl) return firstUrl

  throw new Error('RunComfy result missing output image URL')
}

async function fetchBinary(url: string): Promise<Buffer> {
  const response = await axios.get(url, { responseType: 'arraybuffer' })
  return Buffer.from(response.data)
}

async function emitProviderEvent(
  callback: ProviderWorkflowCall['onProviderEvent'],
  state: ProviderRunState
): Promise<void> {
  if (!callback) return
  await callback(state)
}

async function pollRunStatus(args: {
  apiToken: string
  stageKey: WorkflowStageKey
  deploymentId: string
  requestId: string
  statusUrl: string
  resultUrl: string
  throwIfCancelled?: ProviderWorkflowCall['throwIfCancelled']
  pollTimeoutMs?: number
  pollIntervalMs?: number
  statusRetryMax?: number
  onProviderEvent?: ProviderWorkflowCall['onProviderEvent']
}): Promise<any> {
  const {
    apiToken,
    stageKey,
    deploymentId,
    requestId,
    statusUrl,
    resultUrl,
    throwIfCancelled,
    pollTimeoutMs,
    pollIntervalMs,
    statusRetryMax,
    onProviderEvent,
  } = args
  const timeoutMs =
    typeof pollTimeoutMs === 'number' && Number.isFinite(pollTimeoutMs) && pollTimeoutMs > 0
      ? pollTimeoutMs
      : DEFAULT_POLL_TIMEOUT_MS
  const intervalMs =
    typeof pollIntervalMs === 'number' && Number.isFinite(pollIntervalMs) && pollIntervalMs > 0
      ? pollIntervalMs
      : DEFAULT_POLL_INTERVAL_MS
  const retryMax =
    typeof statusRetryMax === 'number' && Number.isFinite(statusRetryMax) && statusRetryMax > 0
      ? statusRetryMax
      : DEFAULT_STATUS_RETRY_MAX

  const startedAt = Date.now()
  let lastStatus = 'UNKNOWN'

  while (Date.now() - startedAt < timeoutMs) {
    await throwIfCancelled?.()
    const response = await withGetRetry(
      'status',
      () =>
        axios.get(statusUrl, {
          headers: { Authorization: `Bearer ${apiToken}` },
          timeout: 30000,
        }),
      retryMax
    )

    const data = response.data
    const normalizedStatus = normalizeStatus(data?.status)
    if (normalizedStatus && normalizedStatus !== lastStatus) {
      lastStatus = normalizedStatus
      console.log(
        `[runcomfy] status=${normalizedStatus} request_id=${requestId} elapsed_ms=${Date.now() - startedAt}`
      )
      await emitProviderEvent(onProviderEvent, {
        provider: 'runcomfy',
        stage: stageKey,
        deployment_id: deploymentId,
        request_id: requestId,
        status_url: statusUrl,
        result_url: resultUrl,
        status: normalizedStatus,
        started_at: new Date(startedAt).toISOString(),
      })
    }

    if (normalizedStatus === 'COMPLETED' || normalizedStatus === 'SUCCESS') {
      return data
    }

    if (normalizedStatus === 'FAILED' || normalizedStatus === 'CANCELLED' || normalizedStatus === 'ERROR') {
      const errorMessage = readErrorText(data) || 'RunComfy request failed'
      await emitProviderEvent(onProviderEvent, {
        provider: 'runcomfy',
        stage: stageKey,
        deployment_id: deploymentId,
        request_id: requestId,
        status_url: statusUrl,
        result_url: resultUrl,
        status: normalizedStatus,
        started_at: new Date(startedAt).toISOString(),
        finished_at: new Date().toISOString(),
        error: errorMessage,
      })
      throw new Error(errorMessage)
    }

    await sleep(intervalMs)
    await throwIfCancelled?.()
  }

  throw new Error(`RunComfy poll timeout after ${timeoutMs}ms (last_status=${lastStatus})`)
}

export async function runProviderWorkflow(
  input: ProviderWorkflowCall
): Promise<{ buffer: Buffer; providerRun: ProviderRunState }> {
  const mockMode = process.env.WORKER_MOCK_MODE !== 'false'
  const deploymentId = input.stage.deployment_id?.trim()
  if (!deploymentId) {
    throw new Error(`Missing deployment_id for stage ${input.stageKey}`)
  }

  if (mockMode) {
    const startedAt = new Date().toISOString()
    await input.throwIfCancelled?.()
    try {
      const buffer = input.mockResultBuffer ?? (await fetchBinary(input.renderedTemplateUrl))
      await input.throwIfCancelled?.()
      return {
        buffer,
        providerRun: {
          provider: 'runcomfy',
          stage: input.stageKey,
          deployment_id: deploymentId,
          request_id: null,
          status_url: null,
          result_url: null,
          status: 'MOCK_COMPLETED',
          started_at: startedAt,
          finished_at: new Date().toISOString(),
        },
      }
    } catch (error) {
      console.error('[mock] template fetch failed, using placeholder image:', error)
      return {
        buffer: Buffer.from(FALLBACK_MOCK_PNG_BASE64, 'base64'),
        providerRun: {
          provider: 'runcomfy',
          stage: input.stageKey,
          deployment_id: deploymentId,
          request_id: null,
          status_url: null,
          result_url: null,
          status: 'MOCK_COMPLETED',
          started_at: startedAt,
          finished_at: new Date().toISOString(),
        },
      }
    }
  }

  const apiToken = process.env.RUNCOMFY_API_TOKEN
  if (!apiToken) {
    throw new Error('Missing RUNCOMFY_API_TOKEN')
  }

  await input.throwIfCancelled?.()
  const submitUrl = `https://api.runcomfy.net/prod/v1/deployments/${deploymentId}/inference`
  const submitStartedAt = new Date().toISOString()
  const response = await axios.post(submitUrl, input.payload, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 60000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  })

  const responseData = response.data
  const requestId = readRequestId(responseData)
  if (!requestId) {
    throw new Error('RunComfy create-run response missing request id')
  }

  const urls = buildRequestUrls({
    deploymentId,
    requestId,
    statusUrl: responseData?.status_url,
    resultUrl: responseData?.result_url,
  })

  await emitProviderEvent(input.onProviderEvent, {
    provider: 'runcomfy',
    stage: input.stageKey,
    deployment_id: deploymentId,
    request_id: requestId,
    status_url: urls.statusUrl,
    result_url: urls.resultUrl,
    status: normalizeStatus(responseData?.status) || 'SUBMITTED',
    started_at: submitStartedAt,
  })

  console.log(`[runcomfy] submitted deployment=${deploymentId} request_id=${requestId}`)

  await input.throwIfCancelled?.()
  await pollRunStatus({
    apiToken,
    stageKey: input.stageKey,
    deploymentId,
    requestId,
    statusUrl: urls.statusUrl,
    resultUrl: urls.resultUrl,
    throwIfCancelled: input.throwIfCancelled,
    pollTimeoutMs: input.pollTimeoutMs,
    pollIntervalMs: input.pollIntervalMs,
    statusRetryMax: input.statusRetryMax,
    onProviderEvent: input.onProviderEvent,
  })

  const resultRetryMax =
    typeof input.resultRetryMax === 'number' && Number.isFinite(input.resultRetryMax) && input.resultRetryMax > 0
      ? input.resultRetryMax
      : DEFAULT_RESULT_RETRY_MAX
  await input.throwIfCancelled?.()
  const resultResponse = await withGetRetry(
    'result',
    () =>
      axios.get(urls.resultUrl, {
        headers: { Authorization: `Bearer ${apiToken}` },
        timeout: 30000,
      }),
    resultRetryMax
  )
  const resultData = resultResponse.data
  const imageUrl = resolveResultImageUrl(resultData, input.stage.result_node_id?.trim())
  await input.throwIfCancelled?.()
  const buffer = await fetchBinary(imageUrl)
  const finishedAt = new Date().toISOString()
  const providerRun: ProviderRunState = {
    provider: 'runcomfy',
    stage: input.stageKey,
    deployment_id: deploymentId,
    request_id: requestId,
    status_url: urls.statusUrl,
    result_url: urls.resultUrl,
    status: 'COMPLETED',
    started_at: submitStartedAt,
    finished_at: finishedAt,
  }

  await emitProviderEvent(input.onProviderEvent, providerRun)

  return {
    buffer,
    providerRun,
  }
}

export const constructApiPayload = constructProviderPayload
export const runWorkflow = runProviderWorkflow
