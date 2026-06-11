import axios from 'axios'
import sharp from 'sharp'
import {
  type ProviderPayloadBuildResult,
  type ProviderRunState,
  type ProviderStageConfig,
  type ProviderWorkflowCall,
  type PageWorkflowOverride,
  type WorkflowStageKey,
} from '../processor'
import type { WorkflowProviderAdapter } from './runcomfyAdapter'

const FALLBACK_MOCK_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+4XkAAAAASUVORK5CYII='

const DEFAULT_TEMPLATE_IMAGE_NAME = 'template_image.png'
const DEFAULT_FACE_IMAGE_NAME = 'face_image.png'
const DEFAULT_TEMPLATE_NODE_ID = '81'
const DEFAULT_FACE_NODE_ID = '244'
const DEFAULT_SEED_NODE_ID = '256'
const DEFAULT_SEED_INPUT_KEY = 'noise_seed'
const DEFAULT_SEED = 1088888155445243
const DEFAULT_RESULT_FILENAME_PREFIX = 'FaceSwap'
const PRODUCTION_IGNORED_OUTPUT_NODE_IDS = ['268']

const DEFAULT_RUNPOD_API_BASE_URL = 'https://api.runpod.ai/v2'
const DEFAULT_POLL_INTERVAL_MS = Number.parseInt(process.env.RUNPOD_POLL_INTERVAL_MS || '2500', 10)
const DEFAULT_POLL_TIMEOUT_MS = Number.parseInt(process.env.RUNPOD_POLL_TIMEOUT_MS || '600000', 10)
const DEFAULT_IMAGE_MAX_BYTES = Number.parseInt(process.env.RUNPOD_IMAGE_MAX_BYTES || '2000000', 10)
const DEFAULT_REQUEST_MAX_BYTES = Number.parseInt(process.env.RUNPOD_REQUEST_MAX_BYTES || '9500000', 10)

type RunPodPayload = {
  workflow: Record<string, unknown>
  imageNames: {
    template: string
    face: string
  }
}

type EncodedImage = {
  mime: 'image/png' | 'image/jpeg'
  buffer: Buffer
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value))
}

function readImageName(value: unknown, fallback: string): string {
  const raw = String(value || '').trim()
  return raw || fallback
}

function getWorkflowNode(workflow: Record<string, unknown>, nodeId: string): { inputs: Record<string, unknown> } {
  const node = workflow[nodeId] as { inputs?: Record<string, unknown> } | undefined
  if (!node || typeof node !== 'object') {
    throw new Error(`RunPod workflow JSON missing node ${nodeId}`)
  }
  if (!node.inputs || typeof node.inputs !== 'object') {
    node.inputs = {}
  }
  return node as { inputs: Record<string, unknown> }
}

function removeProductionIgnoredOutputNodes(workflow: Record<string, unknown>) {
  for (const nodeId of PRODUCTION_IGNORED_OUTPUT_NODE_IDS) {
    delete workflow[nodeId]
  }
}

function setNodeInput(args: {
  workflow: Record<string, unknown>
  stage: ProviderStageConfig
  bindingKey: 'template_image' | 'user_face_image'
  fallbackNodeId: string
  fallbackInputKey: string
  value: unknown
}) {
  const { workflow, stage, bindingKey, fallbackNodeId, fallbackInputKey, value } = args
  const binding = stage.dynamic_inputs?.[bindingKey]
  const nodeId = String(binding?.node_id || fallbackNodeId).trim()
  const inputKey = String(binding?.input_key || fallbackInputKey).trim()
  if (!nodeId) throw new Error(`RunPod ${bindingKey} node_id is missing`)
  if (!inputKey) throw new Error(`RunPod ${bindingKey} input_key is missing`)
  getWorkflowNode(workflow, nodeId).inputs[inputKey] = value
}

function applyStaticInputs(workflow: Record<string, unknown>, staticInputs?: Record<string, Record<string, unknown>>) {
  if (!staticInputs) return
  for (const [nodeId, inputs] of Object.entries(staticInputs)) {
    if (!nodeId || !inputs || typeof inputs !== 'object') continue
    Object.assign(getWorkflowNode(workflow, nodeId).inputs, inputs)
  }
}

function applyPromptOverride(args: {
  workflow: Record<string, unknown>
  stage: ProviderStageConfig
  pageWorkflowOverride?: PageWorkflowOverride | null
}) {
  const prompt = args.pageWorkflowOverride?.prompt
  if (typeof prompt !== 'string') return
  const nodeId = String(args.stage.prompt_input?.node_id || '').trim()
  const inputKey = String(args.stage.prompt_input?.input_key || 'text').trim()
  if (!nodeId) {
    throw new Error('RunPod page prompt override requires stage.prompt_input.node_id')
  }
  if (!inputKey) {
    throw new Error('RunPod page prompt override requires stage.prompt_input.input_key')
  }
  getWorkflowNode(args.workflow, nodeId).inputs[inputKey] = prompt
}

function applyRunPodDynamicInputs(args: {
  workflow: Record<string, unknown>
  stageKey: WorkflowStageKey
  stage: ProviderStageConfig
  templateImageName: string
  faceImageName: string
  pageWorkflowOverride?: PageWorkflowOverride | null
}) {
  const { workflow, stage, templateImageName, faceImageName, pageWorkflowOverride } = args
  applyStaticInputs(workflow, stage.static_inputs)
  applyStaticInputs(workflow, pageWorkflowOverride?.static_inputs)
  applyPromptOverride({ workflow, stage, pageWorkflowOverride })

  setNodeInput({
    workflow,
    stage,
    bindingKey: 'template_image',
    fallbackNodeId: DEFAULT_TEMPLATE_NODE_ID,
    fallbackInputKey: 'image',
    value: templateImageName,
  })
  setNodeInput({
    workflow,
    stage,
    bindingKey: 'user_face_image',
    fallbackNodeId: DEFAULT_FACE_NODE_ID,
    fallbackInputKey: 'image',
    value: faceImageName,
  })

  const seedNodeId = String(stage.seed_node_id || DEFAULT_SEED_NODE_ID).trim()
  const seedInputKey = String(stage.seed_input_key || DEFAULT_SEED_INPUT_KEY).trim()
  const pageSeed = pageWorkflowOverride?.seed
  const seed =
    typeof pageSeed === 'number' && Number.isFinite(pageSeed)
      ? pageSeed
      : typeof stage.seed === 'number' && Number.isFinite(stage.seed)
        ? stage.seed
        : DEFAULT_SEED
  getWorkflowNode(workflow, seedNodeId).inputs[seedInputKey] = seed

  const resultNodeId = String(stage.result_node_id || '').trim()
  if (resultNodeId) {
    const resultNode = getWorkflowNode(workflow, resultNodeId)
    if (String(resultNode.inputs.filename_prefix || '').trim() === '') {
      resultNode.inputs.filename_prefix = DEFAULT_RESULT_FILENAME_PREFIX
    }
  }
}

function buildEndpointBase(endpointId: string): string {
  const base = (process.env.RUNPOD_API_BASE_URL || DEFAULT_RUNPOD_API_BASE_URL).replace(/\/+$/, '')
  return base.endsWith(`/${endpointId}`) ? base : `${base}/${endpointId}`
}

function readRunId(data: any): string | null {
  const value = data?.id || data?.job_id || data?.run_id
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function normalizeStatus(status: unknown): string {
  return typeof status === 'string' ? status.trim().toUpperCase() : ''
}

function readErrorText(data: any): string {
  if (!data) return ''
  if (typeof data === 'string') return data
  if (typeof data.error === 'string') return data.error
  if (typeof data.message === 'string') return data.message
  if (typeof data.status_message === 'string') return data.status_message
  return ''
}

function stripDataUriPrefix(value: string): string {
  return value.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
}

function readOutputImageBase64(data: any): string {
  const output = data?.output ?? data?.images ?? data

  const tryReadRaw = (value: any): string | null => {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
    if (!value || typeof value !== 'object') {
      return null
    }
    for (const key of ['data', 'image', 'base64', 'image_base64'] as const) {
      const candidate = value[key]
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim()
      }
    }
    return null
  }

  const rawFromArray = (items: any[]): string | null => {
    for (const item of items) {
      const direct = tryReadRaw(item)
      if (direct) return direct
      if (item && typeof item === 'object') {
        for (const nestedKey of ['images', 'output', 'result'] as const) {
          const nested = item[nestedKey]
          if (Array.isArray(nested)) {
            const nestedRaw = rawFromArray(nested)
            if (nestedRaw) return nestedRaw
          } else {
            const nestedDirect = tryReadRaw(nested)
            if (nestedDirect) return nestedDirect
          }
        }
      }
    }
    return null
  }

  let raw: string | null = null
  if (Array.isArray(output)) {
    raw = rawFromArray(output)
  } else if (output && typeof output === 'object') {
    const directArray = output.images
    if (Array.isArray(directArray)) {
      raw = rawFromArray(directArray)
    } else {
      raw = tryReadRaw(output)
      if (!raw) {
        for (const nestedKey of ['result', 'output'] as const) {
          const nested = output[nestedKey]
          if (Array.isArray(nested)) {
            raw = rawFromArray(nested)
          } else {
            raw = tryReadRaw(nested)
          }
          if (raw) break
        }
      }
    }
  } else {
    raw = tryReadRaw(output)
  }

  if (!raw) {
    const outputKeys =
      output && typeof output === 'object' ? Object.keys(output).slice(0, 12).join(',') : typeof output
    throw new Error(`RunPod result missing output.images (output_keys=${outputKeys || 'none'})`)
  }
  return stripDataUriPrefix(raw)
}

async function fetchBinary(url: string): Promise<Buffer> {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 60000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  })
  return Buffer.from(response.data)
}

async function encodeImageForRunPod(input: Buffer, maxBytes: number): Promise<EncodedImage> {
  const png = await sharp(input).rotate().png({ compressionLevel: 9 }).toBuffer()
  if (png.length <= maxBytes) {
    return { mime: 'image/png', buffer: png }
  }

  const metadata = await sharp(input).metadata()
  let width = Math.min(metadata.width || 1920, 1920)
  let quality = 92

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const jpeg = await sharp(input)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer()
    if (jpeg.length <= maxBytes) {
      return { mime: 'image/jpeg', buffer: jpeg }
    }
    width = Math.max(960, Math.floor(width * 0.88))
    quality = Math.max(72, quality - 5)
  }

  throw new Error(`RunPod input image exceeds ${maxBytes} bytes after compression`)
}

function toDataUri(image: EncodedImage): string {
  return `data:${image.mime};base64,${image.buffer.toString('base64')}`
}

async function emitProviderEvent(
  callback: ProviderWorkflowCall['onProviderEvent'],
  state: ProviderRunState
): Promise<void> {
  if (!callback) return
  await callback(state)
}

async function cancelRunPodJob(args: { apiKey: string; endpointBase: string; runId: string }) {
  try {
    await axios.post(
      `${args.endpointBase}/cancel/${encodeURIComponent(args.runId)}`,
      {},
      {
        headers: { Authorization: `Bearer ${args.apiKey}`, 'Content-Type': 'application/json' },
        timeout: 30000,
      }
    )
  } catch (error: any) {
    console.warn(`[runpod] cancel failed for job ${args.runId}:`, error?.message || error)
  }
}

async function pollRunPodStatus(args: {
  apiKey: string
  endpointId: string
  endpointBase: string
  runId: string
  stageKey: WorkflowStageKey
  throwIfCancelled?: ProviderWorkflowCall['throwIfCancelled']
  pollTimeoutMs?: number
  pollIntervalMs?: number
  onProviderEvent?: ProviderWorkflowCall['onProviderEvent']
}): Promise<any> {
  const timeoutMs =
    typeof args.pollTimeoutMs === 'number' && Number.isFinite(args.pollTimeoutMs) && args.pollTimeoutMs > 0
      ? args.pollTimeoutMs
      : DEFAULT_POLL_TIMEOUT_MS
  const intervalMs =
    typeof args.pollIntervalMs === 'number' && Number.isFinite(args.pollIntervalMs) && args.pollIntervalMs > 0
      ? args.pollIntervalMs
      : DEFAULT_POLL_INTERVAL_MS

  const statusUrl = `${args.endpointBase}/status/${encodeURIComponent(args.runId)}`
  const startedAt = Date.now()
  let lastStatus = 'UNKNOWN'

  const throwIfCancelledAndCancelRunPod = async () => {
    try {
      await args.throwIfCancelled?.()
    } catch (error) {
      await cancelRunPodJob({ apiKey: args.apiKey, endpointBase: args.endpointBase, runId: args.runId })
      throw error
    }
  }

  while (Date.now() - startedAt < timeoutMs) {
    await throwIfCancelledAndCancelRunPod()

    const response = await axios.get(statusUrl, {
      headers: { Authorization: `Bearer ${args.apiKey}` },
      timeout: 30000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    })
    const data = response.data
    const status = normalizeStatus(data?.status)

    if (status && status !== lastStatus) {
      lastStatus = status
      console.log(`[runpod] status=${status} job_id=${args.runId} elapsed_ms=${Date.now() - startedAt}`)
      await emitProviderEvent(args.onProviderEvent, {
        provider: 'runpod',
        stage: args.stageKey,
        deployment_id: args.endpointId,
        request_id: args.runId,
        status_url: statusUrl,
        result_url: null,
        status,
        started_at: new Date(startedAt).toISOString(),
      })
    }

    if (status === 'COMPLETED') {
      return data
    }

    if (status === 'FAILED' || status === 'CANCELLED' || status === 'ERROR') {
      const errorMessage = readErrorText(data) || `RunPod job failed with status ${status || 'UNKNOWN'}`
      await emitProviderEvent(args.onProviderEvent, {
        provider: 'runpod',
        stage: args.stageKey,
        deployment_id: args.endpointId,
        request_id: args.runId,
        status_url: statusUrl,
        result_url: null,
        status: status || 'FAILED',
        started_at: new Date(startedAt).toISOString(),
        finished_at: new Date().toISOString(),
        error: errorMessage,
      })
      throw new Error(errorMessage)
    }

    await sleep(intervalMs)
  }

  throw new Error(`RunPod poll timeout after ${timeoutMs}ms (last_status=${lastStatus})`)
}

export const runPodAdapter: WorkflowProviderAdapter = {
  provider: 'runpod',
  buildPayload(args: {
    faceUrl: string
    renderedTemplateUrl: string
    stageKey: WorkflowStageKey
    stage: ProviderStageConfig
    workflowJson?: Record<string, unknown> | null
    pageWorkflowOverride?: PageWorkflowOverride | null
  }): ProviderPayloadBuildResult {
    if (!args.stage.deployment_id?.trim()) {
      throw new Error(`Missing RunPod endpoint id for stage ${args.stageKey}`)
    }
    if (!args.workflowJson || typeof args.workflowJson !== 'object') {
      throw new Error(`Missing RunPod workflow JSON for stage ${args.stageKey}`)
    }

    const workflow = deepCloneJson(args.workflowJson)
    removeProductionIgnoredOutputNodes(workflow)
    const templateImageName = readImageName(
      args.stage.runpod_image_names?.template_image,
      DEFAULT_TEMPLATE_IMAGE_NAME
    )
    const faceImageName = readImageName(args.stage.runpod_image_names?.user_face_image, DEFAULT_FACE_IMAGE_NAME)

    applyRunPodDynamicInputs({
      workflow,
      stageKey: args.stageKey,
      stage: args.stage,
      templateImageName,
      faceImageName,
      pageWorkflowOverride: args.pageWorkflowOverride,
    })

    return {
      payload: {
        workflow,
        imageNames: {
          template: templateImageName,
          face: faceImageName,
        },
      } satisfies RunPodPayload,
    }
  },
  async execute(input: ProviderWorkflowCall): Promise<{ buffer: Buffer; providerRun: ProviderRunState }> {
    const endpointId = input.stage.deployment_id?.trim()
    if (!endpointId) {
      throw new Error(`Missing RunPod endpoint id for stage ${input.stageKey}`)
    }

    const mockMode = process.env.WORKER_MOCK_MODE !== 'false'
    if (mockMode) {
      const startedAt = new Date().toISOString()
      await input.throwIfCancelled?.()
      const buffer = input.mockResultBuffer ?? Buffer.from(FALLBACK_MOCK_PNG_BASE64, 'base64')
      return {
        buffer,
        providerRun: {
          provider: 'runpod',
          stage: input.stageKey,
          deployment_id: endpointId,
          request_id: null,
          status_url: null,
          result_url: null,
          status: 'MOCK_COMPLETED',
          started_at: startedAt,
          finished_at: new Date().toISOString(),
        },
      }
    }

    const apiKey = process.env.RUNPOD_API_KEY
    if (!apiKey) {
      throw new Error('Missing RUNPOD_API_KEY')
    }

    const runPodPayload = input.payload as Partial<RunPodPayload>
    if (!runPodPayload.workflow || !runPodPayload.imageNames) {
      throw new Error('RunPod payload missing workflow or image names')
    }

    await input.throwIfCancelled?.()
    const imageMaxBytes = DEFAULT_IMAGE_MAX_BYTES
    const [templateInput, faceInput] = await Promise.all([
      fetchBinary(input.renderedTemplateUrl).then((buffer) => encodeImageForRunPod(buffer, imageMaxBytes)),
      fetchBinary(input.faceUrl).then((buffer) => encodeImageForRunPod(buffer, imageMaxBytes)),
    ])

    const body = {
      input: {
        workflow: runPodPayload.workflow,
        images: [
          {
            name: runPodPayload.imageNames.template,
            image: toDataUri(templateInput),
          },
          {
            name: runPodPayload.imageNames.face,
            image: toDataUri(faceInput),
          },
        ],
      },
    }
    const requestBytes = Buffer.byteLength(JSON.stringify(body), 'utf-8')
    if (requestBytes > DEFAULT_REQUEST_MAX_BYTES) {
      throw new Error(`RunPod request exceeds ${DEFAULT_REQUEST_MAX_BYTES} bytes (${requestBytes})`)
    }

    const endpointBase = buildEndpointBase(endpointId)
    const submitUrl = `${endpointBase}/run`
    const submitStartedAt = new Date().toISOString()

    await input.throwIfCancelled?.()
    const response = await axios.post(submitUrl, body, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    })

    const runId = readRunId(response.data)
    if (!runId) {
      throw new Error('RunPod /run response missing job id')
    }

    const statusUrl = `${endpointBase}/status/${encodeURIComponent(runId)}`
    await emitProviderEvent(input.onProviderEvent, {
      provider: 'runpod',
      stage: input.stageKey,
      deployment_id: endpointId,
      request_id: runId,
      status_url: statusUrl,
      result_url: null,
      status: normalizeStatus(response.data?.status) || 'SUBMITTED',
      started_at: submitStartedAt,
    })
    console.log(`[runpod] submitted endpoint=${endpointId} job_id=${runId} request_bytes=${requestBytes}`)

    const completed = await pollRunPodStatus({
      apiKey,
      endpointId,
      endpointBase,
      runId,
      stageKey: input.stageKey,
      throwIfCancelled: input.throwIfCancelled,
      pollTimeoutMs: input.pollTimeoutMs,
      pollIntervalMs: input.pollIntervalMs,
      onProviderEvent: input.onProviderEvent,
    })

    await input.throwIfCancelled?.()
    const buffer = Buffer.from(readOutputImageBase64(completed), 'base64')
    const finishedAt = new Date().toISOString()
    const providerRun: ProviderRunState = {
      provider: 'runpod',
      stage: input.stageKey,
      deployment_id: endpointId,
      request_id: runId,
      status_url: statusUrl,
      result_url: null,
      status: 'COMPLETED',
      started_at: submitStartedAt,
      finished_at: finishedAt,
    }

    await emitProviderEvent(input.onProviderEvent, providerRun)

    return { buffer, providerRun }
  },
}
