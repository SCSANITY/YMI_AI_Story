import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import http from 'http'
import { PDFDocument } from 'pdf-lib'
import axios from 'axios'
import { resolveWorkerExecutionMode } from './executionMode'
import { listenOnExclusivePort, resolveWorkerPollingPolicy } from './workerRuntime'
import {
  SinglePageJobAssetError,
  type BookPageManifestEntry,
  buildSinglePageFinalContractOutputPages,
  createJobScopedConfigSnapshot,
  hasSinglePageTemplateMarker,
  isSinglePageTemplateConfig,
  selectSinglePageJobManifest,
  shouldCreateManualFinalHandoff,
  toBookPageOutputMetadata,
  validateSinglePageJobAssets,
  validateSinglePageTemplateContract,
} from './bookPageContract'
import {
  buildFinalReviewCompletionState,
  shouldProtectApprovedFinalRevision,
} from './finalReviewRecovery'
import {
  encodePreviewDisplayWebp,
  shouldEncodePreviewDisplayWebp,
  type PreviewDisplayStats,
} from './previewOutput'
import {
  InputSnapshot,
  PageWorkflowOverride,
  TemplateConfig,
  TemplatePage,
} from './processor'
import {
  normalizeWorkflowProvider,
  resolveProviderAdapter,
  type ProviderRunState,
  type ProviderStageConfig,
  type WorkflowStageKey,
  type WorkflowProviderName,
} from './providerAdapter'
import {
  assertExactPageCoverage,
  assertFinalCompletionCoverage,
  assertMockFinalPageLimitDisabled,
  buildFinalPageNumberByIndex,
  hasFinalPageOverride,
  normalizeOverridePageIndices,
  selectPageIndices,
  shouldBypassFaceProvider,
  shouldRenderSubtitleForPage,
} from './pagePolicy'
import {
  SubtitleFontAsset,
  SubtitleRenderState,
  SubtitleRenderTimings,
  SubtitleTemplatePage,
  createLoadedSubtitleTemplate,
  getChildName,
  getSubtitleRenderConfig,
  isSubtitleRenderEnabled,
  renderSubtitlePage,
} from './subtitleRenderer'

dotenv.config()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Missing required environment variables for worker')
}

const APP_TEMPLATES_BUCKET = 'app-templates'
const RAW_BUCKET = 'raw-private'
const CALLBACK_URL = process.env.WORKER_CALLBACK_URL || ''
const CALLBACK_SECRET = process.env.INTERNAL_API_SECRET || ''
const CONFIG_FILE = 'config.json'
const PREVIEW_MAX_WIDTH = Number.parseInt(process.env.PREVIEW_MAX_WIDTH || '1200', 10)
const PREVIEW_WEBP_QUALITY = Number.parseInt(process.env.PREVIEW_WEBP_QUALITY || '82', 10)
const EXECUTION_MODE_RESOLUTION = resolveWorkerExecutionMode(process.env.WORKER_EXECUTION_MODE)
const WORKER_EXECUTION_MODE = EXECUTION_MODE_RESOLUTION.mode
const IS_MOCK_MODE = WORKER_EXECUTION_MODE === 'mock'
const MOCK_FINAL_PAGE_LIMIT = Number.parseInt(process.env.MOCK_FINAL_PAGE_LIMIT || '0', 10)
const MOCK_FINAL_PDF_MAX_WIDTH = Number.parseInt(process.env.MOCK_FINAL_PDF_MAX_WIDTH || '1400', 10)
const WORKFLOW_INPUT_MAX_BYTES = Number.parseInt(
  process.env.WORKFLOW_INPUT_MAX_BYTES || String(8 * 1024 * 1024),
  10
)
const WORKFLOW_GATEWAY_MAX_BYTES = Number.parseInt(
  process.env.WORKFLOW_GATEWAY_MAX_BYTES || String(20 * 1024 * 1024),
  10
)
const WORKFLOW_GATEWAY_MARGIN_BYTES = Number.parseInt(
  process.env.WORKFLOW_GATEWAY_MARGIN_BYTES || String(512 * 1024),
  10
)
const WORKFLOW_GATEWAY_TARGET_BYTES = Math.max(
  1 * 1024 * 1024,
  WORKFLOW_GATEWAY_MAX_BYTES - WORKFLOW_GATEWAY_MARGIN_BYTES
)
const WORKFLOW_INPUT_MAX_WIDTH = Number.parseInt(process.env.WORKFLOW_INPUT_MAX_WIDTH || '2048', 10)
const WORKFLOW_INPUT_FIT_MAX_ATTEMPTS = Number.parseInt(process.env.WORKFLOW_INPUT_FIT_MAX_ATTEMPTS || '6', 10)
const WORKFLOW_INPUT_FIT_WIDTH_SCALE = Number.parseFloat(process.env.WORKFLOW_INPUT_FIT_WIDTH_SCALE || '0.92')
const WORKFLOW_INPUT_FIT_QUALITY_STEP = Number.parseInt(process.env.WORKFLOW_INPUT_FIT_QUALITY_STEP || '3', 10)
const WORKFLOW_INPUT_FIT_MIN_WIDTH = Number.parseInt(process.env.WORKFLOW_INPUT_FIT_MIN_WIDTH || '1400', 10)
const WORKFLOW_INPUT_FIT_MIN_QUALITY = Number.parseInt(process.env.WORKFLOW_INPUT_FIT_MIN_QUALITY || '82', 10)
const WORKFLOW_INPUT_FIT_INITIAL_QUALITY = Number.parseInt(
  process.env.WORKFLOW_INPUT_FIT_INITIAL_QUALITY || '96',
  10
)
const RUNCOMFY_INPUT_SIGN_TTL_PREVIEW_SEC = Number.parseInt(
  process.env.RUNCOMFY_INPUT_SIGN_TTL_PREVIEW_SEC || '21600',
  10
)
const RUNCOMFY_INPUT_SIGN_TTL_FINAL_SEC = Number.parseInt(
  process.env.RUNCOMFY_INPUT_SIGN_TTL_FINAL_SEC || '86400',
  10
)
const WORKFLOW_FORCE_RUNTIME_TARGET_UPLOAD = process.env.WORKFLOW_FORCE_RUNTIME_TARGET_UPLOAD === 'true'
const FINAL_DISABLE_INPUT_OPTIMIZATION = process.env.FINAL_DISABLE_INPUT_OPTIMIZATION !== 'false'
const TEMPLATE_FILE_CACHE_TTL_MS = Number.parseInt(
  process.env.TEMPLATE_FILE_CACHE_TTL_MS || String(10 * 60 * 1000),
  10
)
const PAGE_WORKFLOW_MAX_ATTEMPTS = Number.parseInt(process.env.PAGE_WORKFLOW_MAX_ATTEMPTS || '3', 10)
const PROGRESS_UPDATE_MIN_INTERVAL_MS = Number.parseInt(
  process.env.PROGRESS_UPDATE_MIN_INTERVAL_MS || '4000',
  10
)
const STORAGE_MAX_OBJECT_BYTES = Number.parseInt(
  process.env.STORAGE_MAX_OBJECT_BYTES || String(50 * 1024 * 1024),
  10
)
const STORAGE_UPLOAD_MARGIN_BYTES = Number.parseInt(
  process.env.STORAGE_UPLOAD_MARGIN_BYTES || String(1 * 1024 * 1024),
  10
)
const FINAL_PDF_MAX_UPLOAD_BYTES = Math.max(
  1 * 1024 * 1024,
  STORAGE_MAX_OBJECT_BYTES - STORAGE_UPLOAD_MARGIN_BYTES
)
const FINAL_PDF_RETRY_MAX_WIDTH = Number.parseInt(process.env.FINAL_PDF_RETRY_MAX_WIDTH || '2600', 10)
const FINAL_PDF_RETRY_JPEG_QUALITY = Number.parseInt(process.env.FINAL_PDF_RETRY_JPEG_QUALITY || '92', 10)
const FINAL_PDF_FIT_MAX_ATTEMPTS = Number.parseInt(process.env.FINAL_PDF_FIT_MAX_ATTEMPTS || '6', 10)
const FINAL_PDF_FIT_WIDTH_SCALE = Number.parseFloat(process.env.FINAL_PDF_FIT_WIDTH_SCALE || '0.92')
const FINAL_PDF_FIT_QUALITY_STEP = Number.parseInt(process.env.FINAL_PDF_FIT_QUALITY_STEP || '4', 10)
const FINAL_PDF_FIT_MIN_WIDTH = Number.parseInt(process.env.FINAL_PDF_FIT_MIN_WIDTH || '1400', 10)
const FINAL_PDF_FIT_MIN_QUALITY = Number.parseInt(process.env.FINAL_PDF_FIT_MIN_QUALITY || '70', 10)
const RUNCOMFY_POLL_INTERVAL_PREVIEW_MS = Number.parseInt(
  process.env.RUNCOMFY_POLL_INTERVAL_PREVIEW_MS || '5000',
  10
)
const RUNCOMFY_POLL_INTERVAL_FINAL_MS = Number.parseInt(
  process.env.RUNCOMFY_POLL_INTERVAL_FINAL_MS || '12000',
  10
)
const RUNCOMFY_POLL_TIMEOUT_PREVIEW_MS = Number.parseInt(
  process.env.RUNCOMFY_POLL_TIMEOUT_PREVIEW_MS || process.env.RUNCOMFY_POLL_TIMEOUT_MS || '210000',
  10
)
const RUNCOMFY_POLL_TIMEOUT_FINAL_MS = Number.parseInt(
  process.env.RUNCOMFY_POLL_TIMEOUT_FINAL_MS || process.env.RUNCOMFY_POLL_TIMEOUT_MS || '7200000',
  10
)
const RUNPOD_POLL_INTERVAL_MS = Number.parseInt(process.env.RUNPOD_POLL_INTERVAL_MS || '2500', 10)
const RUNPOD_POLL_TIMEOUT_PREVIEW_MS = Number.parseInt(
  process.env.RUNPOD_POLL_TIMEOUT_PREVIEW_MS || '600000',
  10
)
const RUNPOD_POLL_TIMEOUT_FINAL_MS = Number.parseInt(
  process.env.RUNPOD_POLL_TIMEOUT_FINAL_MS || '600000',
  10
)
const WORKER_POLLING_POLICY = resolveWorkerPollingPolicy(process.env)
const WORKER_POLL_ENABLED = WORKER_POLLING_POLICY.enabled
const WORKER_CLAIM_IDLE_INITIAL_MS = WORKER_POLLING_POLICY.initialIdleMs
const WORKER_CLAIM_IDLE_MAX_MS = WORKER_POLLING_POLICY.maxIdleMs
const WORKER_CLAIM_IDLE_BACKOFF_MULTIPLIER = WORKER_POLLING_POLICY.backoffMultiplier
const WORKER_HEALTH_PORT = Number.parseInt(process.env.WORKER_HEALTH_PORT || '8787', 10)
const WORKER_HEALTH_HOST = process.env.WORKER_HEALTH_HOST || '127.0.0.1'
const HEALTHCHECKS_URL = (process.env.HEALTHCHECKS_URL || '').trim()
const HEALTHCHECK_INTERVAL_MS = Number.parseInt(process.env.HEALTHCHECK_INTERVAL_MS || '120000', 10)
const HEALTHCHECK_SUPABASE_STALE_MS = Number.parseInt(process.env.HEALTHCHECK_SUPABASE_STALE_MS || '300000', 10)
const HEALTHCHECK_MAX_JOB_RUNTIME_MS = Number.parseInt(process.env.HEALTHCHECK_MAX_JOB_RUNTIME_MS || '1800000', 10)
const PREVIEW_POLL_TIMEOUT_HARD_CAP_MS = Number.parseInt(
  process.env.PREVIEW_POLL_TIMEOUT_HARD_CAP_MS || '240000',
  10
)
const PREVIEW_PAGE_CONCURRENCY = Number.parseInt(process.env.PREVIEW_PAGE_CONCURRENCY || '1', 10)
const PREVIEW_PAGE_MAX_ATTEMPTS = Number.parseInt(process.env.PREVIEW_PAGE_MAX_ATTEMPTS || '1', 10)
const FINAL_PAGE_MAX_ATTEMPTS = Number.parseInt(process.env.FINAL_PAGE_MAX_ATTEMPTS || String(PAGE_WORKFLOW_MAX_ATTEMPTS), 10)
const RUNCOMFY_STATUS_RETRY_MAX_PREVIEW = Number.parseInt(
  process.env.RUNCOMFY_STATUS_RETRY_MAX_PREVIEW || '2',
  10
)
const RUNCOMFY_STATUS_RETRY_MAX_FINAL = Number.parseInt(
  process.env.RUNCOMFY_STATUS_RETRY_MAX_FINAL || '2',
  10
)
const RUNCOMFY_RESULT_RETRY_MAX_PREVIEW = Number.parseInt(
  process.env.RUNCOMFY_RESULT_RETRY_MAX_PREVIEW || '2',
  10
)
const RUNCOMFY_RESULT_RETRY_MAX_FINAL = Number.parseInt(
  process.env.RUNCOMFY_RESULT_RETRY_MAX_FINAL || '2',
  10
)
const WORKER_DEBUG_PROMPTS = process.env.WORKER_DEBUG_PROMPTS === 'true'
const PREVIEW_DISPLAY_COVER_NAME = (process.env.PREVIEW_DISPLAY_COVER_NAME || 'Display.png').trim() || 'Display.png'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const templateFileCache = new Map<string, { files: Set<string>; ts: number }>()
const workerStartedAt = Date.now()

type ProcessingJobState = {
  job_id: string
  job_type: JobType
  startedAt: string
}

const currentlyProcessing = new Map<string, ProcessingJobState>()
let lastClaimPollAt: string | null = null
let lastSupabaseOkAt: string | null = null
let lastJobProcessedAt: string | null = null
let lastError: { message: string; at: string } | null = null
let shutdownRequested = false

type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancel_requested' | 'cancelled'
type JobType = 'preview' | 'final'

type JobRow = {
  job_id: string
  status: JobStatus
  job_type: JobType
  story_language?: 'English' | 'Traditional Chinese' | 'Spanish' | string | null
  selected_book_type?: 'Cloud Explorer' | 'Classic' | 'Immersive' | 'Signature Voice' | string | null
  template_id: string
  cart_item_id: string | null
  creation_id?: string | null
  owner_type?: 'anon' | 'customer'
  anon_session_id?: string | null
  customer_id?: string | null
  input_snapshot: InputSnapshot | null
  output_assets?: Record<string, unknown> | null
  provider_runs?: Record<string, unknown> | null
  render_runs?: Record<string, unknown> | null
  created_at?: string
}

type OutputPage = {
  page_index: number
  output_order?: number
  preview_order?: number
  role?: BookPageManifestEntry['role']
  spread_index?: number
  side?: BookPageManifestEntry['side']
  page_number?: number | null
  storage_path: string | null
  storage_path_full?: string
  preview_display?: PreviewDisplayStats
}

type PreparedPageInput = {
  pageIndex: number
  page: TemplatePage
  templateImageName: string
  templateStoragePath: string
  subtitleEnabled: boolean
  templateUrl?: string
  workflowJson?: Record<string, unknown> | null
  workflowJsonPath?: string | null
  provider: WorkflowProviderName
  stageKey: WorkflowStageKey
  stage: ProviderStageConfig
  pageWorkflowOverride?: PageWorkflowOverride | null
  workflowOverrideSummary?: WorkflowOverrideSummary | null
}

type WorkflowOverrideSummary = {
  seed: number | null
  prompt_override: boolean
  static_input_node_ids: string[]
}

type SubtitleOutputPage = {
  page_index: number
  template_image: string
  storage_path: string
}

type LoadedSubtitleContext = ReturnType<typeof createLoadedSubtitleTemplate>

type RuntimeManifestPage = {
  page_index: number
  output_order?: number
  role?: BookPageManifestEntry['role']
  spread_index?: number
  side?: BookPageManifestEntry['side']
  page_number?: number | null
  provider: WorkflowProviderName
  stage: WorkflowStageKey
  deployment_id: string | null
  workflow_json_path?: string | null
  template_image: string
  subtitle_render_enabled: boolean
  subtitle_template_path: string | null
  subtitle_output_path?: string | null
  workflow_override?: WorkflowOverrideSummary | null
  preview_display?: PreviewDisplayStats | null
  timings?: SubtitleRenderTimings | null
}

type RuntimeManifest = {
  generated_at: string
  updated_at?: string
  job_id: string
  job_type: JobType
  template_id: string
  execution_mode: 'provider' | 'mock'
  schema_version?: number
  asset_layout?: string
  subtitle_render:
    | {
        enabled: true
        template_path: string | null
        fonts_path: string | null
        placeholder_keys: string[]
      }
    | {
        enabled: false
      }
  pages: RuntimeManifestPage[]
}

type FinalReviewJob = {
  final_job_id: string
  order_id: string
  total_pages: number
}

class JobCancelledError extends Error {
  constructor(jobId: string) {
    super(`Preview cancelled by user (job ${jobId})`)
    this.name = 'JobCancelledError'
  }
}

type NormalizedImage = {
  buffer: Buffer
  ext: 'png' | 'jpg' | 'webp'
  contentType: 'image/png' | 'image/jpeg' | 'image/webp'
}

type StoredImageFormat = {
  ext: 'png' | 'jpg' | 'webp'
  contentType: 'image/png' | 'image/jpeg' | 'image/webp'
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function nowIso() {
  return new Date().toISOString()
}

function rememberError(error: unknown) {
  lastError = {
    message: error instanceof Error ? error.message : String(error || 'Unknown worker error'),
    at: nowIso(),
  }
}

function markJobStarted(job: JobRow) {
  currentlyProcessing.set(job.job_id, {
    job_id: job.job_id,
    job_type: job.job_type,
    startedAt: nowIso(),
  })
}

function markJobFinished(jobId: string) {
  currentlyProcessing.delete(jobId)
  lastJobProcessedAt = nowIso()
}

function minutesSince(iso: string | null) {
  if (!iso) return null
  const timestamp = Date.parse(iso)
  if (!Number.isFinite(timestamp)) return null
  return Math.max(0, Math.round((Date.now() - timestamp) / 60000))
}

function getLongestProcessingMs() {
  let maxMs = 0
  for (const job of currentlyProcessing.values()) {
    const startedAt = Date.parse(job.startedAt)
    if (!Number.isFinite(startedAt)) continue
    maxMs = Math.max(maxMs, Date.now() - startedAt)
  }
  return maxMs
}

function getHealthSnapshot() {
  const now = Date.now()
  const claimPollMs = lastClaimPollAt ? now - Date.parse(lastClaimPollAt) : null
  const supabaseOkMs = lastSupabaseOkAt ? now - Date.parse(lastSupabaseOkAt) : null
  const hasActiveJob = currentlyProcessing.size > 0
  const longestProcessingMs = getLongestProcessingMs()
  const activeJobStale = hasActiveJob && longestProcessingMs > HEALTHCHECK_MAX_JOB_RUNTIME_MS
  const claimPollStale =
    !hasActiveJob && (!claimPollMs || !Number.isFinite(claimPollMs) || claimPollMs > HEALTHCHECK_SUPABASE_STALE_MS)
  const supabaseStale =
    !hasActiveJob && (!supabaseOkMs || !Number.isFinite(supabaseOkMs) || supabaseOkMs > HEALTHCHECK_SUPABASE_STALE_MS)

  let status: 'paused' | 'starting' | 'ok' | 'degraded' = 'ok'
  if (!WORKER_POLL_ENABLED) {
    status = 'paused'
  } else if (!lastClaimPollAt && !hasActiveJob) {
    status = 'starting'
  } else if (activeJobStale || claimPollStale || supabaseStale) {
    status = 'degraded'
  }

  return {
    status,
    executionMode: WORKER_EXECUTION_MODE,
    pollEnabled: WORKER_POLL_ENABLED,
    uptimeSec: Math.round((now - workerStartedAt) / 1000),
    lastClaimPollAt,
    lastSupabaseOkAt,
    lastJobProcessedAt,
    minutesSinceLastJob: minutesSince(lastJobProcessedAt),
    currentlyProcessing: Array.from(currentlyProcessing.values()),
    lastError,
  }
}

async function startHealthServer(): Promise<http.Server | null> {
  if (!Number.isFinite(WORKER_HEALTH_PORT) || WORKER_HEALTH_PORT <= 0) {
    if (WORKER_POLL_ENABLED) {
      throw new Error('WORKER_HEALTH_PORT must be valid when WORKER_POLL_ENABLED=true')
    }
    console.warn('[health] disabled because WORKER_HEALTH_PORT is invalid')
    return null
  }

  const server = http.createServer((request, response) => {
    if (request.url?.split('?')[0] !== '/health') {
      response.writeHead(404, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: 'Not found' }))
      return
    }

    const snapshot = getHealthSnapshot()
    const statusCode = snapshot.status === 'degraded' ? 503 : 200
    response.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    })
    response.end(JSON.stringify(snapshot))
  })

  try {
    await listenOnExclusivePort(server, WORKER_HEALTH_PORT, WORKER_HEALTH_HOST)
  } catch (error) {
    rememberError(error)
    throw error
  }

  server.on('error', (error) => {
    rememberError(error)
    console.error('[health] runtime server error:', error)
  })

  console.log(`[health] listening on http://${WORKER_HEALTH_HOST}:${WORKER_HEALTH_PORT}/health`)
  return server
}

function startHealthchecksPing(): NodeJS.Timeout | null {
  if (!WORKER_POLL_ENABLED) {
    console.log('[healthchecks] disabled while worker polling is paused')
    return null
  }
  if (!HEALTHCHECKS_URL) {
    console.log('[healthchecks] disabled; HEALTHCHECKS_URL is empty')
    return null
  }

  let pingInFlight = false
  const ping = async () => {
    if (pingInFlight) return
    const snapshot = getHealthSnapshot()
    if (snapshot.status !== 'ok') {
      console.warn('[healthchecks] skipped ping because health is', snapshot.status)
      return
    }

    pingInFlight = true
    try {
      const response = await fetch(HEALTHCHECKS_URL, { method: 'GET' })
      if (!response.ok) {
        throw new Error(`Healthchecks ping failed with ${response.status}`)
      }
    } catch (error) {
      rememberError(error)
      console.error('[healthchecks] ping failed:', error)
    } finally {
      pingInFlight = false
    }
  }

  const timer = setInterval(() => {
    void ping()
  }, Math.max(30000, HEALTHCHECK_INTERVAL_MS))
  void ping()
  return timer
}

const closeHealthServer = (server: http.Server | null) =>
  new Promise<void>((resolve, reject) => {
    if (!server?.listening) {
      resolve()
      return
    }
    server.close((error) => (error ? reject(error) : resolve()))
  })

function installShutdownHandlers() {
  const requestShutdown = (signal: string) => {
    shutdownRequested = true
    console.log(`[worker] received ${signal}; stopping new job claims after current work`)
  }

  process.once('SIGINT', () => requestShutdown('SIGINT'))
  process.once('SIGTERM', () => requestShutdown('SIGTERM'))
}

const joinPath = (...parts: string[]) =>
  parts
    .filter(Boolean)
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .join('/')

const padPageIndex = (index: number) => String(index).padStart(2, '0')
const padFinalPageNumber = (pageNumber: number) => String(pageNumber).padStart(2, '0')
const padTwo = (value: number) => String(value).padStart(2, '0')

async function listTemplateFiles(basePath: string): Promise<Set<string>> {
  const cacheHit = templateFileCache.get(basePath)
  if (cacheHit && Date.now() - cacheHit.ts < TEMPLATE_FILE_CACHE_TTL_MS) {
    return cacheHit.files
  }

  const folder = basePath.split('/')[0] ?? ''
  if (!folder) return new Set<string>()

  const collected = new Set<string>()
  const limit = 100

  const walkFolder = async (relativeFolder: string, prefix = '') => {
    let offset = 0

    while (true) {
      const { data, error } = await supabase.storage
        .from(APP_TEMPLATES_BUCKET)
        .list(relativeFolder, { limit, offset, sortBy: { column: 'name', order: 'asc' } })

      if (error || !data?.length) break

      for (const item of data) {
        if (!item.name) continue
        const relativePath = prefix ? `${prefix}/${item.name}` : item.name
        const isFolder = item.id === null && !item.metadata
        if (isFolder) {
          await walkFolder(joinPath(relativeFolder, item.name), relativePath)
          continue
        }
        collected.add(relativePath)
      }

      if (data.length < limit) break
      offset += data.length
    }
  }

  await walkFolder(folder)

  templateFileCache.set(basePath, { files: collected, ts: Date.now() })
  return collected
}

async function listStorageFolder(bucket: string, folder: string): Promise<string[]> {
  const normalizedFolder = folder.replace(/^\/+|\/+$/g, '')
  if (!normalizedFolder) return []

  const collected: string[] = []
  let offset = 0
  const limit = 100

  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(normalizedFolder, { limit, offset, sortBy: { column: 'name', order: 'asc' } })

    if (error || !data?.length) break

    for (const item of data) {
      if (item.name) collected.push(item.name)
    }

    if (data.length < limit) break
    offset += data.length
  }

  return collected
}

function mapProductType(textOverrides?: Record<string, unknown>): 'ebook' | 'audio' | 'physical' {
  const raw = textOverrides?.book_type ?? textOverrides?.bookType
  if (raw === 'digital' || raw === 'ebook') return 'ebook'
  if (raw === 'premium' || raw === 'audio') return 'audio'
  return 'physical'
}

function getJobDatePath(createdAt?: string): string {
  const date = createdAt ? new Date(createdAt) : new Date()
  const year = date.getUTCFullYear()
  const month = padTwo(date.getUTCMonth() + 1)
  const day = padTwo(date.getUTCDate())
  return `${year}/${month}/${day}`
}

function normalizeBasePath(basePath: string | undefined, templateId: string): string {
  const fallback = templateId || ''
  if (!basePath) return fallback
  const cleaned = basePath.replace(/^app-templates\//, '').replace(/^\/+|\/+$/g, '')
  return cleaned || fallback
}

async function loadSubtitleContext(args: {
  config: TemplateConfig
  basePath: string
  inputSnapshot: InputSnapshot
}): Promise<LoadedSubtitleContext | null> {
  const subtitleConfig = getSubtitleRenderConfig(args.config)
  if (!subtitleConfig?.enabled) return null

  const selectedTemplate = selectSubtitleTemplatePath(subtitleConfig, args.inputSnapshot)
  const templateRelativePath = selectedTemplate.templatePath
  if (!templateRelativePath) {
    throw new Error('subtitle_render.enabled=true but template_path is missing')
  }

  const templateStoragePath = joinPath(args.basePath, templateRelativePath)
  const rawTemplateBuffer = await downloadBuffer(APP_TEMPLATES_BUCKET, templateStoragePath)
  const rawTemplate = rawTemplateBuffer.toString('utf-8')

  const fontsRelativePath = subtitleConfig.fonts_path?.trim()
  let fontAssets: SubtitleFontAsset[] = []
  if (fontsRelativePath) {
    const fontsFolder = joinPath(args.basePath, fontsRelativePath)
    const fontFiles = await listStorageFolder(APP_TEMPLATES_BUCKET, fontsFolder)
    const fontAssetFiles = fontFiles.filter((fileName) => /\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/.test(fileName))

    fontAssets = await Promise.all(
      fontAssetFiles.map(async (fileName) => ({
        fileName,
        buffer: await downloadBuffer(APP_TEMPLATES_BUCKET, joinPath(fontsFolder, fileName)),
      }))
    )
  }

  return createLoadedSubtitleTemplate({
    config: {
      ...subtitleConfig,
      template_path: templateRelativePath,
    },
    templateStoragePath,
    templateRaw: rawTemplate,
    fontAssets,
  })
}

function getChildAge(inputSnapshot: InputSnapshot | null | undefined): number | null {
  const textOverrides = inputSnapshot?.text_overrides ?? {}
  const raw = textOverrides.child_age ?? textOverrides.childAge ?? textOverrides.age
  if (raw === undefined || raw === null || raw === '') return null
  const age = Number.parseInt(String(raw), 10)
  return Number.isFinite(age) ? age : null
}

function selectSubtitleTemplatePath(
  subtitleConfig: NonNullable<ReturnType<typeof getSubtitleRenderConfig>>,
  inputSnapshot: InputSnapshot
): { templatePath: string; variantId: string | null } {
  const fallbackTemplatePath = subtitleConfig.template_path?.trim() || ''
  const childAge = getChildAge(inputSnapshot)
  if (childAge === null || !Array.isArray(subtitleConfig.template_variants)) {
    return { templatePath: fallbackTemplatePath, variantId: null }
  }

  for (const variant of subtitleConfig.template_variants) {
    const templatePath = variant?.template_path?.trim()
    if (!templatePath) continue
    const minAge = Number(variant.when?.child_age_min ?? Number.NEGATIVE_INFINITY)
    const maxAge = Number(variant.when?.child_age_max ?? Number.POSITIVE_INFINITY)
    if (childAge >= minAge && childAge <= maxAge) {
      return {
        templatePath,
        variantId: variant.id ? String(variant.id) : null,
      }
    }
  }

  return { templatePath: fallbackTemplatePath, variantId: null }
}

function stripJsonComments(input: string): string {
  input = input.replace(/^\uFEFF/, '')
  let output = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    const next = input[i + 1]

    if (!inString && char === '/' && next === '/') {
      while (i < input.length && input[i] !== '\n') i += 1
      output += '\n'
      continue
    }

    if (!inString && char === '/' && next === '*') {
      i += 2
      while (i < input.length && !(input[i] === '*' && input[i + 1] === '/')) i += 1
      i += 1
      continue
    }

    if (char === '"' && !escaped) {
      inString = !inString
    }

    escaped = char === '\\' && !escaped
    output += char
  }
  return output
}

function removeTrailingCommas(input: string): string {
  return input.replace(/,\s*([}\]])/g, '$1')
}

async function loadJobTemplateConfigSnapshot(configUrl: string): Promise<Readonly<TemplateConfig>> {
  const response = await axios.get(configUrl, { responseType: 'text' })
  const raw = response.data
  let config: any = raw

  if (typeof raw === 'string') {
    try {
      config = JSON.parse(raw)
    } catch {
      const cleaned = removeTrailingCommas(stripJsonComments(raw))
      config = JSON.parse(cleaned)
    }
  }

  if (!config || !Array.isArray(config.pages)) {
    throw new Error('Invalid config.json')
  }
  return createJobScopedConfigSnapshot(config as TemplateConfig)
}

async function uploadBuffer(bucket: string, path: string, buffer: Buffer, contentType: string) {
  const { error } = await supabase.storage.from(bucket).upload(path, buffer, {
    contentType,
    upsert: true,
  })
  if (error) {
    throw error
  }
}

async function downloadBuffer(bucket: string, path: string): Promise<Buffer> {
  const normalizedPath = path.replace(/^raw-private\//, '').replace(/^\/+/, '')
  const { data, error } = await supabase.storage.from(bucket).download(normalizedPath)
  if (error || !data) {
    throw error ?? new Error(`Failed to download ${normalizedPath}`)
  }
  const arrayBuffer = await data.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

async function downloadJson<T = Record<string, unknown>>(bucket: string, path: string): Promise<T> {
  const buffer = await downloadBuffer(bucket, path)
  try {
    const raw = buffer.toString('utf-8').replace(/^\uFEFF/, '')
    return JSON.parse(raw) as T
  } catch (error) {
    throw new Error(`Failed to parse JSON at ${path}: ${(error as any)?.message || error}`)
  }
}

function isPng(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8
}

function isWebp(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  )
}

function resolveStoredImageFormat(buffer: Buffer): StoredImageFormat {
  if (isPng(buffer)) return { ext: 'png', contentType: 'image/png' }
  if (isJpeg(buffer)) return { ext: 'jpg', contentType: 'image/jpeg' }
  if (isWebp(buffer)) return { ext: 'webp', contentType: 'image/webp' }
  throw new Error('Unsupported subtitle passthrough image format')
}

async function normalizeWorkflowBuffer(buffer: Buffer): Promise<NormalizedImage> {
  if (isPng(buffer)) {
    return { buffer, ext: 'png', contentType: 'image/png' }
  }
  if (isJpeg(buffer)) {
    return { buffer, ext: 'jpg', contentType: 'image/jpeg' }
  }
  if (isWebp(buffer)) {
    return { buffer, ext: 'webp', contentType: 'image/webp' }
  }

  try {
    const sharpModule = await import('sharp')
    const sharp = sharpModule.default ?? sharpModule
    const converted = await sharp(buffer).png().toBuffer()
    return { buffer: converted, ext: 'png', contentType: 'image/png' }
  } catch {
    throw new Error('Unsupported workflow image format and conversion failed')
  }
}

async function maybeResizePreviewBuffer(
  jobType: JobType,
  buffer: Buffer,
  ext: 'png' | 'jpg' | 'webp'
): Promise<Buffer> {
  if (jobType !== 'preview') return buffer
  if (!Number.isFinite(PREVIEW_MAX_WIDTH) || PREVIEW_MAX_WIDTH <= 0) return buffer

  try {
    const sharpModule = await import('sharp')
    const sharp = sharpModule.default ?? sharpModule
    const pipeline = sharp(buffer).resize({ width: PREVIEW_MAX_WIDTH, withoutEnlargement: true })
    const resized = ext === 'png'
      ? await pipeline.png().toBuffer()
      : ext === 'webp'
        ? await pipeline.webp({ quality: PREVIEW_WEBP_QUALITY, effort: 2 }).toBuffer()
        : await pipeline.jpeg({ quality: 90 }).toBuffer()
    return resized
  } catch {
    console.log('[preview] resize skipped (sharp not available)')
    return buffer
  }
}

async function maybeResizeFinalPdfBuffer(buffer: Buffer, ext: 'png' | 'jpg' | 'webp'): Promise<Buffer> {
  if (!IS_MOCK_MODE) return buffer
  if (!Number.isFinite(MOCK_FINAL_PDF_MAX_WIDTH) || MOCK_FINAL_PDF_MAX_WIDTH <= 0) return buffer
  try {
    const sharpModule = await import('sharp')
    const sharp = sharpModule.default ?? sharpModule
    const pipeline = sharp(buffer).resize({ width: MOCK_FINAL_PDF_MAX_WIDTH, withoutEnlargement: true })
    return ext === 'png'
      ? await pipeline.png().toBuffer()
      : ext === 'webp'
        ? await pipeline.webp({ quality: 88, effort: 2 }).toBuffer()
        : await pipeline.jpeg({ quality: 88 }).toBuffer()
  } catch {
    return buffer
  }
}

async function fitWorkflowInputWithinLimit(args: {
  buffer: Buffer
  kind: 'template' | 'intermediate'
  targetBytes: number
}): Promise<NormalizedImage> {
  const { buffer, kind, targetBytes } = args
  if (buffer.length <= targetBytes) {
    return normalizeWorkflowBuffer(buffer)
  }

  const sharpModule = await import('sharp')
  const sharp = sharpModule.default ?? sharpModule
  const normalized = await normalizeWorkflowBuffer(buffer)
  const baseBuffer = buffer
  const metadata = await sharp(baseBuffer).metadata()
  const originalWidth = Math.max(1, Number(metadata.width ?? WORKFLOW_INPUT_MAX_WIDTH))
  const startWidth = originalWidth
  const maxAttempts = clampInt(WORKFLOW_INPUT_FIT_MAX_ATTEMPTS, 1, 12)
  const widthScale = Number.isFinite(WORKFLOW_INPUT_FIT_WIDTH_SCALE) && WORKFLOW_INPUT_FIT_WIDTH_SCALE > 0
    ? WORKFLOW_INPUT_FIT_WIDTH_SCALE
    : 0.92
  const minWidth = clampInt(WORKFLOW_INPUT_FIT_MIN_WIDTH, 512, Math.max(512, startWidth))
  const initialQuality = clampInt(WORKFLOW_INPUT_FIT_INITIAL_QUALITY, WORKFLOW_INPUT_FIT_MIN_QUALITY, 98)
  const qualityStep = clampInt(WORKFLOW_INPUT_FIT_QUALITY_STEP, 1, 20)
  let best: NormalizedImage = { buffer: normalized.buffer, ext: 'jpg', contentType: 'image/jpeg' }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const width = clampInt(
      startWidth * Math.pow(widthScale, attempt - 1),
      minWidth,
      startWidth
    )

    const quality = clampInt(
      initialQuality - (attempt - 1) * qualityStep,
      WORKFLOW_INPUT_FIT_MIN_QUALITY,
      98
    )
    const candidate = await sharp(baseBuffer)
      .resize({ width, withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer()
    best = { buffer: candidate, ext: 'jpg', contentType: 'image/jpeg' }
    if (candidate.length <= targetBytes) {
      return best
    }
  }

  return best
}

function isObjectTooLargeError(error: unknown): boolean {
  const message = String((error as any)?.message || '').toLowerCase()
  return (
    message.includes('maximum allowed size') ||
    message.includes('exceeded the maximum allowed size') ||
    message.includes('entity too large') ||
    message.includes('payload too large')
  )
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)))
}

async function shrinkPdfPagesForRetry(
  pages: { page_index: number; buffer: Buffer }[],
  width: number,
  jpegQuality: number
): Promise<{ page_index: number; buffer: Buffer }[]> {
  try {
    const sharpModule = await import('sharp')
    const sharp = sharpModule.default ?? sharpModule
    const result: { page_index: number; buffer: Buffer }[] = []
    for (const page of pages) {
      const resized = await sharp(page.buffer)
        .resize({ width, withoutEnlargement: true })
        .jpeg({ quality: jpegQuality })
        .toBuffer()
      result.push({ page_index: page.page_index, buffer: resized })
    }
    return result
  } catch {
    return pages
  }
}

async function fitFinalPdfWithinLimit(args: {
  pages: { page_index: number; buffer: Buffer }[]
  initialPdf: Buffer
  jobId: string
}): Promise<{ buffer: Buffer; compressed: boolean }> {
  const { pages, initialPdf, jobId } = args
  if (initialPdf.length <= FINAL_PDF_MAX_UPLOAD_BYTES) {
    return { buffer: initialPdf, compressed: false }
  }

  let bestPdf = initialPdf
  let initialWidth = clampInt(FINAL_PDF_RETRY_MAX_WIDTH, FINAL_PDF_FIT_MIN_WIDTH, 6000)
  let initialQuality = clampInt(FINAL_PDF_RETRY_JPEG_QUALITY, FINAL_PDF_FIT_MIN_QUALITY, 95)
  const widthScale =
    Number.isFinite(FINAL_PDF_FIT_WIDTH_SCALE) &&
    FINAL_PDF_FIT_WIDTH_SCALE > 0 &&
    FINAL_PDF_FIT_WIDTH_SCALE < 1
      ? FINAL_PDF_FIT_WIDTH_SCALE
      : 0.85
  const qualityStep = clampInt(FINAL_PDF_FIT_QUALITY_STEP, 1, 25)
  const maxAttempts = clampInt(FINAL_PDF_FIT_MAX_ATTEMPTS, 1, 20)

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const width = clampInt(initialWidth * Math.pow(widthScale, attempt - 1), FINAL_PDF_FIT_MIN_WIDTH, 6000)
    const quality = clampInt(
      initialQuality - (attempt - 1) * qualityStep,
      FINAL_PDF_FIT_MIN_QUALITY,
      95
    )
    const retryPages = await shrinkPdfPagesForRetry(pages, width, quality)
    const retryPdf = await buildPdf(retryPages)
    bestPdf = retryPdf
    console.log(
      `[job:${jobId}] fit-attempt ${attempt}/${maxAttempts} width=${width} quality=${quality} bytes=${retryPdf.length}`
    )
    if (retryPdf.length <= FINAL_PDF_MAX_UPLOAD_BYTES) {
      return { buffer: retryPdf, compressed: true }
    }
  }

  return { buffer: bestPdf, compressed: true }
}

async function prepareWorkflowImageUrl(args: {
  sourceUrl?: string
  sourceBuffer?: Buffer
  sourceContentType?: string
  jobId: string
  jobDatePath: string
  pageIndex: number
  kind: 'template' | 'intermediate'
  forceRuntimeUpload?: boolean
  allowOptimization?: boolean
  signTtlSec: number
}): Promise<string> {
  const {
    sourceUrl,
    sourceBuffer,
    jobId,
    jobDatePath,
    pageIndex,
    kind,
    forceRuntimeUpload = false,
    allowOptimization = true,
    signTtlSec,
  } = args

  const hasSourceUrl = typeof sourceUrl === 'string' && sourceUrl.length > 0
  const hasSourceBuffer = Buffer.isBuffer(sourceBuffer)
  if (hasSourceUrl === hasSourceBuffer) {
    throw new Error('prepareWorkflowImageUrl requires exactly one of sourceUrl or sourceBuffer')
  }

  const inputByteTarget = allowOptimization ? WORKFLOW_INPUT_MAX_BYTES : WORKFLOW_GATEWAY_TARGET_BYTES

  if (!Number.isFinite(inputByteTarget) || inputByteTarget <= 0) {
    if (hasSourceUrl) return sourceUrl
  }

  let original: Buffer

  if (hasSourceUrl && !forceRuntimeUpload) {
    try {
      const head = await axios.head(sourceUrl, { timeout: 15000, validateStatus: () => true })
      const contentLength = Number.parseInt(String(head.headers['content-length'] || '0'), 10)
      if (head.status >= 200 && head.status < 300 && contentLength > 0 && contentLength <= inputByteTarget) {
        return sourceUrl
      }
    } catch {
      // Fallback to GET size check below
    }
  }

  if (hasSourceUrl) {
    const fetched = await axios.get(sourceUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    })
    original = Buffer.from(fetched.data)
    if (!forceRuntimeUpload && original.length <= inputByteTarget) {
      return sourceUrl
    }
  } else {
    original = sourceBuffer!
  }

  const normalizedOriginal = await normalizeWorkflowBuffer(original)
  const ext = normalizedOriginal.ext
  const contentType = normalizedOriginal.contentType
  let uploadPayload = original
  let optimizationMode: 'optimized' | 'fitted' | 'stabilized' = 'stabilized'

  if (allowOptimization) {
    const sharpModule = await import('sharp')
    const sharp = sharpModule.default ?? sharpModule
    uploadPayload = await sharp(original)
      .resize({ width: WORKFLOW_INPUT_MAX_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer()
    optimizationMode = uploadPayload.length < original.length ? 'optimized' : 'stabilized'
  } else if (!isJpeg(original) && !isPng(original)) {
    uploadPayload = normalizedOriginal.buffer
  } else {
    uploadPayload = original
  }

  if (uploadPayload.length > inputByteTarget) {
    const fitted = await fitWorkflowInputWithinLimit({
      buffer: uploadPayload,
      kind,
      targetBytes: inputByteTarget,
    })
    uploadPayload = fitted.buffer
    optimizationMode = uploadPayload.length < original.length ? 'fitted' : optimizationMode
  }

  const finalExt =
    optimizationMode === 'optimized' || optimizationMode === 'fitted' ? 'jpg' : ext
  const finalContentType =
    optimizationMode === 'optimized' || optimizationMode === 'fitted' ? 'image/jpeg' : contentType

  const runtimePath = `jobs/${jobDatePath}/${jobId}/runtime/${kind}_${padPageIndex(pageIndex)}.${finalExt}`
  await uploadBuffer(RAW_BUCKET, runtimePath, uploadPayload, finalContentType)

  const { data, error } = await supabase.storage
    .from(RAW_BUCKET)
    .createSignedUrl(runtimePath, signTtlSec)
  if (error || !data?.signedUrl) {
    throw new Error(`Failed to sign optimized ${kind} image`)
  }

  console.log(
    optimizationMode === 'optimized'
      ? `[job:${jobId}] optimized ${kind} image for workflow: ${Math.round(original.length / 1024 / 1024)}MB -> ${Math.round(
          uploadPayload.length / 1024 / 1024
        )}MB`
      : optimizationMode === 'fitted'
      ? `[job:${jobId}] fitted ${kind} image under workflow gateway limit: ${Math.round(original.length / 1024 / 1024)}MB -> ${Math.round(
          uploadPayload.length / 1024 / 1024
        )}MB`
      : `[job:${jobId}] stabilized ${kind} image for workflow: ${Math.round(original.length / 1024 / 1024)}MB -> ${Math.round(
          uploadPayload.length / 1024 / 1024
        )}MB`
  )

  return data.signedUrl
}

async function embedPageImage(pdf: PDFDocument, buffer: Buffer) {
  if (isPng(buffer)) return pdf.embedPng(buffer)
  if (isJpeg(buffer)) return pdf.embedJpg(buffer)
  if (isWebp(buffer)) {
    const sharpModule = await import('sharp')
    const sharp = sharpModule.default ?? sharpModule
    return pdf.embedPng(await sharp(buffer).png().toBuffer())
  }
  const normalized = await normalizeWorkflowBuffer(buffer)
  return normalized.ext === 'png'
    ? pdf.embedPng(normalized.buffer)
    : pdf.embedJpg(normalized.buffer)
}

async function buildPdf(pages: { page_index: number; buffer: Buffer }[]): Promise<Buffer> {
  const pdf = await PDFDocument.create()

  for (const page of pages) {
    const image = await embedPageImage(pdf, page.buffer)
    const { width, height } = image.scale(1)
    const pdfPage = pdf.addPage([width, height])
    pdfPage.drawImage(image, { x: 0, y: 0, width, height })
  }

  const bytes = await pdf.save()
  return Buffer.from(bytes)
}

async function requeueJob(jobId: string, reason: string) {
  console.log('[job] requeue', jobId, reason)
  await supabase
    .from('jobs')
    .update({ status: 'queued', progress: 0, updated_at: new Date().toISOString() })
    .eq('job_id', jobId)
}

function getPageByIndex(pages: TemplatePage[]): Map<number, TemplatePage> {
  const map = new Map<number, TemplatePage>()
  for (const page of pages) {
    map.set(page.index, page)
  }
  return map
}

function resolveWorkflowProvider(config: TemplateConfig): WorkflowProviderName {
  return normalizeWorkflowProvider(config.workflow?.provider)
}

function resolveStageForPage(args: {
  jobType: JobType
  page: TemplatePage
  config: TemplateConfig
}): { provider: WorkflowProviderName; stageKey: WorkflowStageKey; stage: ProviderStageConfig } {
  const { jobType, page, config } = args
  const provider = resolveWorkflowProvider(config)
  const stageKey: WorkflowStageKey = jobType === 'preview' ? 'preview_face' : 'final_face'
  const stage = config.workflow?.stages?.[stageKey]
  if (IS_MOCK_MODE) {
    return { provider, stageKey, stage: stage || {} }
  }
  if (page.enable_face_swap === false) {
    return { provider, stageKey, stage: stage || {} }
  }
  if (!stage?.enabled) {
    throw new Error(`Missing enabled stage config for ${stageKey}`)
  }

  return { provider, stageKey, stage }
}

function resolvePageWorkflowOverride(page: TemplatePage, stageKey: WorkflowStageKey): PageWorkflowOverride | null {
  const override = page.workflow_overrides?.[stageKey]
  if (!override || typeof override !== 'object') return null

  const result: PageWorkflowOverride = {}
  if (typeof override.prompt === 'string') {
    result.prompt = override.prompt
  }
  if (typeof override.seed === 'number' && Number.isFinite(override.seed)) {
    result.seed = override.seed
  }
  if (override.static_inputs && typeof override.static_inputs === 'object') {
    result.static_inputs = override.static_inputs
  }

  return result.prompt !== undefined || result.seed !== undefined || result.static_inputs
    ? result
    : null
}

function summarizeWorkflowOverride(override: PageWorkflowOverride | null | undefined): WorkflowOverrideSummary | null {
  if (!override) return null
  return {
    seed: typeof override.seed === 'number' && Number.isFinite(override.seed) ? override.seed : null,
    prompt_override: typeof override.prompt === 'string',
    static_input_node_ids: override.static_inputs ? Object.keys(override.static_inputs) : [],
  }
}

function resolveTemplateImageForPage(args: {
  jobType: JobType
  page: TemplatePage
  config: TemplateConfig
  templateFileSet: Set<string>
  subtitleEnabled: boolean
  isSinglePageContract: boolean
}): { templateImageName: string } {
  const { jobType, page, config, templateFileSet, subtitleEnabled, isSinglePageContract } = args
  const fallbackName = String(page.template_image || page.Target_image || '').trim()
  const fallback = { templateImageName: fallbackName }

  if (subtitleEnabled && !isSinglePageContract) {
    const subtitleConfig = getSubtitleRenderConfig(config)
    const runtimeImageMap =
      jobType === 'preview'
        ? subtitleConfig?.page_runtime_images?.preview
        : subtitleConfig?.page_runtime_images?.final
    const runtimeImageName = runtimeImageMap?.[String(page.index)]?.trim()
    if (runtimeImageName) {
      return { templateImageName: runtimeImageName }
    }
    return fallback
  }

  if (subtitleEnabled) return fallback

  if (jobType !== 'preview' || page.index !== 0) return fallback
  if (!templateFileSet.has(PREVIEW_DISPLAY_COVER_NAME)) return fallback

  return {
    templateImageName: PREVIEW_DISPLAY_COVER_NAME,
  }
}

function resolveTemplateStoragePath(args: {
  basePath: string
  jobType: JobType
  templateImageName: string
}): string {
  const normalizedTemplateImageName = args.templateImageName.trim().replace(/^\/+|\/+$/g, '')
  if (!normalizedTemplateImageName) {
    return joinPath(args.basePath, normalizedTemplateImageName)
  }

  if (args.jobType === 'final' && !normalizedTemplateImageName.includes('/')) {
    return joinPath(args.basePath, 'final', normalizedTemplateImageName)
  }

  return joinPath(args.basePath, normalizedTemplateImageName)
}

function templateFileSetKey(args: { basePath: string; templateStoragePath: string }): string {
  const normalizedBasePath = args.basePath.trim().replace(/^\/+|\/+$/g, '')
  const normalizedStoragePath = args.templateStoragePath.trim().replace(/^\/+|\/+$/g, '')
  if (!normalizedBasePath) return normalizedStoragePath
  return normalizedStoragePath.replace(new RegExp(`^${normalizedBasePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?`), '')
}

async function preparePageInputs(args: {
  job: JobRow
  config: TemplateConfig
  pageIndexList: number[]
  pageMap: Map<number, TemplatePage>
  basePath: string
  templateFileSet: Set<string>
  jobDatePath: string
  subtitleEnabled: boolean
  isSinglePageContract: boolean
}): Promise<PreparedPageInput[]> {
  const {
    job,
    config,
    pageIndexList,
    pageMap,
    basePath,
    templateFileSet,
    jobDatePath,
    subtitleEnabled,
    isSinglePageContract,
  } = args
  const prepared: PreparedPageInput[] = []
  const workflowJsonCache = new Map<string, Record<string, unknown>>()
  const allowInputOptimization = job.job_type !== 'final' || !FINAL_DISABLE_INPUT_OPTIMIZATION
  const inputSignTtlSec =
    job.job_type === 'final' ? RUNCOMFY_INPUT_SIGN_TTL_FINAL_SEC : RUNCOMFY_INPUT_SIGN_TTL_PREVIEW_SEC
  for (const pageIndex of pageIndexList) {
    const page = pageMap.get(pageIndex)
    if (!page) {
      throw new Error(`Missing page config for index ${pageIndex}`)
    }

    const pageSubtitleEnabled = shouldRenderSubtitleForPage({
      jobType: job.job_type,
      page,
      subtitleEnabled,
      isMockMode: IS_MOCK_MODE,
      isSinglePageContract,
    })
    const assets = resolveTemplateImageForPage({
      jobType: job.job_type,
      page,
      config,
      templateFileSet,
      subtitleEnabled: pageSubtitleEnabled,
      isSinglePageContract,
    })

    const templatePath = resolveTemplateStoragePath({
      basePath,
      jobType: job.job_type,
      templateImageName: assets.templateImageName,
    })
    const templateFileKey = templateFileSetKey({ basePath, templateStoragePath: templatePath })
    if (
      !assets.templateImageName ||
      (!templateFileSet.has(assets.templateImageName) && !templateFileSet.has(templateFileKey))
    ) {
      throw new Error(`Template image asset missing: ${templateFileKey || assets.templateImageName || `page ${page.index}`}`)
    }

    let templateUrl: string | undefined
    if (!pageSubtitleEnabled) {
      const rawTemplateUrl = supabase.storage.from(APP_TEMPLATES_BUCKET).getPublicUrl(templatePath).data?.publicUrl
      if (!rawTemplateUrl) {
        throw new Error(`Missing public URL for ${templatePath}`)
      }

      templateUrl = IS_MOCK_MODE
        ? rawTemplateUrl
        : await prepareWorkflowImageUrl({
            sourceUrl: rawTemplateUrl,
            jobId: job.job_id,
            jobDatePath,
            pageIndex: page.index,
            kind: 'template',
            forceRuntimeUpload: WORKFLOW_FORCE_RUNTIME_TARGET_UPLOAD,
            allowOptimization: allowInputOptimization,
            signTtlSec: inputSignTtlSec,
          })
    }
    const stageConfig = resolveStageForPage({
      jobType: job.job_type,
      page,
      config,
    })
    const pageWorkflowOverride = resolvePageWorkflowOverride(page, stageConfig.stageKey)
    const workflowOverrideSummary = summarizeWorkflowOverride(pageWorkflowOverride)
    let workflowJson: Record<string, unknown> | null = null
    let workflowJsonPath: string | null = null

    if (!IS_MOCK_MODE && page.enable_face_swap !== false && stageConfig.provider === 'runpod') {
      const relativeWorkflowPath = stageConfig.stage.workflow_json_path?.trim()
      if (!relativeWorkflowPath) {
        throw new Error(`RunPod stage ${stageConfig.stageKey} is missing workflow_json_path`)
      }
      workflowJsonPath = joinPath(basePath, relativeWorkflowPath)
      const cachedWorkflow = workflowJsonCache.get(workflowJsonPath)
      if (cachedWorkflow) {
        workflowJson = cachedWorkflow
      } else {
        workflowJson = await downloadJson<Record<string, unknown>>(APP_TEMPLATES_BUCKET, workflowJsonPath)
        workflowJsonCache.set(workflowJsonPath, workflowJson)
      }
    }

    prepared.push({
      pageIndex,
      page,
      templateImageName: assets.templateImageName,
      templateStoragePath: templatePath,
      subtitleEnabled: pageSubtitleEnabled,
      templateUrl,
      workflowJson,
      workflowJsonPath,
      provider: stageConfig.provider,
      stageKey: stageConfig.stageKey,
      stage: stageConfig.stage,
      pageWorkflowOverride,
      workflowOverrideSummary,
    })
  }

  return prepared
}

function isRetriablePageError(error: unknown): boolean {
  const message = String((error as any)?.message || '').toLowerCase()
  return (
    message.includes('cannot identify image file') ||
    message.includes('unsupported workflow image format') ||
    message.includes('runcomfy status failed') ||
    message.includes('runcomfy poll timeout') ||
    message.includes('runpod') ||
    message.includes('result missing output image url') ||
    message.includes('timeout') ||
    message.includes('temporarily unavailable')
  )
}

function truncateForLog(value: unknown, maxLen: number = 220): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value)
  if (!raw) return ''
  return raw.length > maxLen ? `${raw.slice(0, maxLen)}...` : raw
}

function resolveJobStoryLanguage(job: JobRow): string {
  const fromColumn = String(job.story_language ?? '').trim()
  if (fromColumn) return fromColumn
  const fromSnapshot = String(job.input_snapshot?.text_overrides?.language ?? '').trim()
  if (fromSnapshot) return fromSnapshot
  return 'English'
}

function normalizeProviderRuns(job: JobRow): Record<string, Record<string, ProviderRunState>> {
  const raw = job.provider_runs
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return JSON.parse(JSON.stringify(raw))
}

function normalizeRenderRuns(job: JobRow): Record<string, SubtitleRenderState> {
  const raw = job.render_runs
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return JSON.parse(JSON.stringify(raw))
}

async function processJob(job: JobRow): Promise<void> {
  const resolvedStoryLanguage = resolveJobStoryLanguage(job)
  const input = {
    ...(job.input_snapshot ?? {}),
    text_overrides: {
      ...((job.input_snapshot?.text_overrides as Record<string, unknown> | undefined) ?? {}),
      language: resolvedStoryLanguage,
    },
  }

  if (job.job_type !== 'preview' && job.job_type !== 'final') {
    throw new Error(`Unsupported job_type: ${job.job_type}`)
  }

  if (!input.face_source_path) {
    await requeueJob(job.job_id, 'Missing face_source_path')
    await sleep(1000)
    return
  }

  if (!job.creation_id && job.job_type === 'preview') {
    await requeueJob(job.job_id, 'Missing creation_id')
    await sleep(1000)
    return
  }

  if (!input.config_url) {
    await requeueJob(job.job_id, 'Missing config_url')
    await sleep(1000)
    return
  }

  // One uncached immutable read binds this process invocation to a single config.
  const config = await loadJobTemplateConfigSnapshot(String(input.config_url))
  const basePath = normalizeBasePath(config.base_path, job.template_id)
  const workflowProvider = resolveWorkflowProvider(config)
  const hasSinglePageMarker = hasSinglePageTemplateMarker(config)
  const isSinglePageContract = isSinglePageTemplateConfig(config)
  const subtitleEnabled = isSubtitleRenderEnabled(config)
  if (hasSinglePageMarker && !subtitleEnabled) {
    throw new Error('Single-page V2 config requires subtitle_render.enabled=true')
  }
  const subtitleEnabledForJob =
    subtitleEnabled && (hasSinglePageMarker || !(IS_MOCK_MODE && job.job_type === 'final'))
  const subtitleConfig = getSubtitleRenderConfig(config)
  const subtitleContext = subtitleEnabledForJob
    ? await loadSubtitleContext({ config, basePath, inputSnapshot: input })
    : null
  const templateFileSet = await listTemplateFiles(basePath)
  const singlePageContract = hasSinglePageMarker
    ? validateSinglePageTemplateContract({
        config,
        subtitleTemplate: subtitleContext?.document,
      })
    : null
  assertMockFinalPageLimitDisabled({
    jobType: job.job_type,
    isMockMode: IS_MOCK_MODE,
    mockFinalPageLimit: MOCK_FINAL_PAGE_LIMIT,
  })
  const selectedSinglePageManifest = singlePageContract
    ? selectSinglePageJobManifest({
        contract: singlePageContract,
        jobType: job.job_type,
        finalPageOverrideIndices: normalizeOverridePageIndices(input),
      })
    : null
  const pageIndexList = selectedSinglePageManifest
    ? selectedSinglePageManifest.map((entry) => entry.page_index)
    : selectPageIndices({
        jobType: job.job_type,
        config,
        input,
        isMockMode: IS_MOCK_MODE,
        mockFinalPageLimit: MOCK_FINAL_PAGE_LIMIT,
      })
  const singlePageManifestByIndex = new Map<number, BookPageManifestEntry>(
    singlePageContract
      ? [...singlePageContract.preview, ...singlePageContract.final].map((entry) => [entry.page_index, entry])
      : []
  )
  const pageMap = getPageByIndex(config.pages)
  const jobDatePath = getJobDatePath(job.created_at)
  const outputRoot = `jobs/${jobDatePath}/${job.job_id}/output`
  const isFinalPageRerun = job.job_type === 'final' && hasFinalPageOverride(input)
  if (singlePageContract) {
    const finalContractPages = buildSinglePageFinalContractOutputPages({
      manifest: singlePageContract.final,
      existingPages: job.output_assets?.pages,
    })
    const contractMarkedOutputAssets = {
      ...(job.output_assets ?? {}),
      schema_version: singlePageContract.schema_version,
      asset_layout: singlePageContract.asset_layout,
      ...(job.job_type === 'final' ? { pages: finalContractPages } : {}),
    }
    const { error: contractMarkerError } = await supabase
      .from('jobs')
      .update({
        output_assets: contractMarkedOutputAssets,
        updated_at: new Date().toISOString(),
      })
      .eq('job_id', job.job_id)
    if (contractMarkerError) {
      throw new Error(`Failed to persist V2 output contract marker: ${contractMarkerError.message}`)
    }
    job.output_assets = contractMarkedOutputAssets
  }
  const finalReviewJob: FinalReviewJob | null =
    job.job_type === 'final'
      ? await supabase
          .from('final_jobs')
          .select('final_job_id, order_id, total_pages')
          .eq('job_id', job.job_id)
          .maybeSingle()
          .then(({ data, error }) => {
            if (error) {
              throw new Error(`Failed to load final review job: ${error.message}`)
            }
            if (!data?.final_job_id) {
              throw new Error('Missing final review job record. Run sql_final_jobs.sql and recreate the final job.')
            }
            return data as FinalReviewJob
          })
      : null
  const configuredFinalPageIndices = singlePageContract
    ? singlePageContract.final.map((entry) => entry.page_index)
    : selectPageIndices({
        jobType: 'final',
        config,
        input: {},
        isMockMode: false,
        mockFinalPageLimit: 0,
      })
  const finalPageNumberByIndex =
    job.job_type === 'final'
      ? buildFinalPageNumberByIndex(configuredFinalPageIndices)
      : new Map<number, number>()
  if (!pageIndexList.length) {
    throw new Error(`No pages to process for template ${job.template_id}`)
  }

  if (finalReviewJob && !isFinalPageRerun) {
    if (finalReviewJob.total_pages !== pageIndexList.length) {
      throw new Error(
        `Final page total mismatch (configured=${pageIndexList.length}; final_job=${finalReviewJob.total_pages})`
      )
    }
    const { data: finalReviewPages, error: finalReviewPagesError } = await supabase
      .from('final_job_pages')
      .select('page_index')
      .eq('final_job_id', finalReviewJob.final_job_id)
    if (finalReviewPagesError) {
      throw new Error(`Failed to load final review page coverage: ${finalReviewPagesError.message}`)
    }
    assertExactPageCoverage(
      pageIndexList,
      (finalReviewPages || []).map((page) => Number(page.page_index))
    )
  }

  if (selectedSinglePageManifest) {
    try {
      validateSinglePageJobAssets({
        manifest: selectedSinglePageManifest,
        availableStorageFiles: templateFileSet,
      })
    } catch (error) {
      const canHandoffToManualFulfillment = shouldCreateManualFinalHandoff({
        jobType: job.job_type,
        isFinalPageRerun,
        error,
      }) && Boolean(finalReviewJob)
      if (!canHandoffToManualFulfillment || !finalReviewJob || !(error instanceof SinglePageJobAssetError)) {
        throw error
      }

      const missingPaths = error.missingAssets.map((asset) => asset.storage_path)
      const preview = missingPaths.slice(0, 5).join(', ')
      const remainder = missingPaths.length > 5 ? `, +${missingPaths.length - 5} more` : ''
      const summary = `Manual fulfillment required: ${missingPaths.length} Final source asset(s) missing (${preview}${remainder})`
      const pageSummary =
        'Automatic Final generation paused because required story assets are missing. Upload a manual replacement or retry after fixing the story package.'
      const now = new Date().toISOString()

      const [jobUpdate, finalJobUpdate, pageUpdate] = await Promise.all([
        supabase
          .from('jobs')
          .update({
            status: 'failed',
            error_message: summary,
            updated_at: now,
          })
          .eq('job_id', job.job_id),
        supabase
          .from('final_jobs')
          .update({
            status: 'needs_fix',
            review_status: 'needs_fix',
            error_message: summary,
            updated_at: now,
          })
          .eq('final_job_id', finalReviewJob.final_job_id),
        supabase
          .from('final_job_pages')
          .update({
            status: 'needs_fix',
            error_message: pageSummary,
            updated_at: now,
          })
          .eq('final_job_id', finalReviewJob.final_job_id)
          .is('approved_output_path', null),
      ])
      const transitionError = jobUpdate.error || finalJobUpdate.error || pageUpdate.error
      if (transitionError) {
        throw new Error(`Failed to create manual Final handoff: ${transitionError.message}`)
      }

      for (const missingAsset of error.missingAssets) {
        const { error: pageDiagnosticError } = await supabase
          .from('final_job_pages')
          .update({
            error_message: `Missing Final source asset: ${missingAsset.storage_path}`,
            updated_at: now,
          })
          .eq('final_job_id', finalReviewJob.final_job_id)
          .eq('page_index', missingAsset.page_index)
          .is('approved_output_path', null)
        if (pageDiagnosticError) {
          throw new Error(`Failed to persist Final page diagnostic: ${pageDiagnosticError.message}`)
        }
      }

      console.warn(`[job:${job.job_id}] ${summary}`)
      return
    }
  }

  const rawFacePath = String(input.face_source_path)
  const facePath = rawFacePath.replace(/^raw-private\//, '')
  const faceTtlSec =
    job.job_type === 'final' ? RUNCOMFY_INPUT_SIGN_TTL_FINAL_SEC : RUNCOMFY_INPUT_SIGN_TTL_PREVIEW_SEC
  const allowInputOptimization = job.job_type !== 'final' || !FINAL_DISABLE_INPUT_OPTIMIZATION
  const inputSignTtlSec =
    job.job_type === 'final' ? RUNCOMFY_INPUT_SIGN_TTL_FINAL_SEC : RUNCOMFY_INPUT_SIGN_TTL_PREVIEW_SEC
  const pagePollIntervalMs =
    workflowProvider === 'runpod'
      ? RUNPOD_POLL_INTERVAL_MS
      : job.job_type === 'final'
        ? RUNCOMFY_POLL_INTERVAL_FINAL_MS
        : RUNCOMFY_POLL_INTERVAL_PREVIEW_MS
  const pagePollTimeoutMs =
    workflowProvider === 'runpod'
      ? job.job_type === 'final'
        ? RUNPOD_POLL_TIMEOUT_FINAL_MS
        : RUNPOD_POLL_TIMEOUT_PREVIEW_MS
      : job.job_type === 'final'
        ? RUNCOMFY_POLL_TIMEOUT_FINAL_MS
        : Math.min(RUNCOMFY_POLL_TIMEOUT_PREVIEW_MS, PREVIEW_POLL_TIMEOUT_HARD_CAP_MS)
  const pageMaxAttempts = job.job_type === 'final' ? FINAL_PAGE_MAX_ATTEMPTS : PREVIEW_PAGE_MAX_ATTEMPTS
  const statusRetryMax =
    job.job_type === 'final' ? RUNCOMFY_STATUS_RETRY_MAX_FINAL : RUNCOMFY_STATUS_RETRY_MAX_PREVIEW
  const resultRetryMax =
    job.job_type === 'final' ? RUNCOMFY_RESULT_RETRY_MAX_FINAL : RUNCOMFY_RESULT_RETRY_MAX_PREVIEW
  const jobStartedAt = Date.now()
  let lastProgressUpdateAt = 0
  let cachedFaceSignedUrl: string | null = null
  let cachedFaceSignedUntil = 0
  const providerRuns = normalizeProviderRuns(job)
  const renderRuns = normalizeRenderRuns(job)
  const childName = getChildName(input)
  let runtimeManifestPath: string | null = null
  let runtimeManifest: RuntimeManifest | null = null
  let runtimeManifestPageMap = new Map<number, RuntimeManifestPage>()
  let lastCancelCheckAt = 0
  let cachedCancelStatus: JobStatus | '' = ''

  const throwIfCancelled = async () => {
    if (job.job_type !== 'preview') return
    const now = Date.now()
    if (cachedCancelStatus === 'cancel_requested' || cachedCancelStatus === 'cancelled') {
      throw new JobCancelledError(job.job_id)
    }
    if (now - lastCancelCheckAt < 500) {
      return
    }
    const { data, error } = await supabase
      .from('jobs')
      .select('status')
      .eq('job_id', job.job_id)
      .maybeSingle()

    if (error) {
      console.warn(`[job:${job.job_id}] cancel check failed:`, error.message)
      return
    }

    const status = String(data?.status || '').trim() as JobStatus | ''
    cachedCancelStatus = status
    lastCancelCheckAt = now
    if (status === 'cancel_requested' || status === 'cancelled') {
      throw new JobCancelledError(job.job_id)
    }
  }

  const getFaceSignedUrl = async (forceRefresh: boolean): Promise<string> => {
    const now = Date.now()
    if (!forceRefresh && cachedFaceSignedUrl && now < cachedFaceSignedUntil - 60_000) {
      return cachedFaceSignedUrl
    }
    const { data: signedFace, error: signedFaceError } = await supabase.storage
      .from(RAW_BUCKET)
      .createSignedUrl(facePath, faceTtlSec)
    if (signedFaceError || !signedFace?.signedUrl) {
      throw new Error('Failed to sign face asset')
    }
    cachedFaceSignedUrl = signedFace.signedUrl
    cachedFaceSignedUntil = now + faceTtlSec * 1000
    return cachedFaceSignedUrl
  }

  const persistProviderRuns = async () => {
    await supabase
      .from('jobs')
      .update({ provider_runs: providerRuns, updated_at: new Date().toISOString() })
      .eq('job_id', job.job_id)
  }

  const persistRenderRuns = async () => {
    await supabase
      .from('jobs')
      .update({ render_runs: renderRuns, updated_at: new Date().toISOString() })
      .eq('job_id', job.job_id)
  }

  const updateRuntimeManifestPage = (pageIndex: number, patch: Partial<RuntimeManifestPage>) => {
    const entry = runtimeManifestPageMap.get(pageIndex)
    if (!entry) return
    Object.assign(entry, patch)
    if (runtimeManifest) {
      runtimeManifest.updated_at = new Date().toISOString()
    }
  }

  const persistRuntimeManifest = async () => {
    if (!runtimeManifestPath || !runtimeManifest) return
    try {
      await uploadBuffer(
        RAW_BUCKET,
        runtimeManifestPath,
        Buffer.from(JSON.stringify(runtimeManifest, null, 2), 'utf-8'),
        'application/json'
      )
    } catch (error) {
      console.warn(`[job:${job.job_id}] failed to upload runtime manifest:`, (error as any)?.message || error)
    }
  }

  const setProviderRunState = async (pageIndex: number, state: ProviderRunState) => {
    const pageKey = String(pageIndex)
    providerRuns[pageKey] ??= {}
    providerRuns[pageKey][state.stage] = {
      ...(providerRuns[pageKey][state.stage] ?? {}),
      ...state,
    }
    await persistProviderRuns()
  }

  const setRenderRunState = async (
    pageIndex: number,
    state: Partial<SubtitleRenderState> & Pick<SubtitleRenderState, 'page_index'>
  ) => {
    renderRuns[String(pageIndex)] = {
      ...(renderRuns[String(pageIndex)] ?? {}),
      ...state,
    }
    await persistRenderRuns()
  }

  const finalizeCancelledPreviewJob = async () => {
    await supabase
      .from('jobs')
      .update({
        status: 'cancelled',
        error_message: 'Preview cancelled by user',
        provider_runs: providerRuns,
        render_runs: renderRuns,
        output_assets: null,
        updated_at: new Date().toISOString(),
      })
      .eq('job_id', job.job_id)
  }

  try {
    await throwIfCancelled()

  if (finalReviewJob) {
    await supabase
      .from('final_jobs')
      .update({
        status: 'processing',
        updated_at: new Date().toISOString(),
      })
      .eq('final_job_id', finalReviewJob.final_job_id)
  }

  const outputPages: OutputPage[] = []
  const subtitlePages: SubtitleOutputPage[] = []
  const outputBuffers: { page_index: number; buffer: Buffer }[] = []
  let completedPages = 0
  const existingOutputAssets = (job.output_assets || {}) as {
    pages?: OutputPage[]
    runtime_manifest_path?: string | null
    subtitle_pages?: SubtitleOutputPage[]
    [key: string]: unknown
  }
  const existingPagesByIndex = new Map<number, OutputPage>()
  for (const page of Array.isArray(existingOutputAssets.pages) ? existingOutputAssets.pages : []) {
    existingPagesByIndex.set(page.page_index, page)
  }
  const buildOutputAssets = (): Record<string, unknown> => {
    const mergedPages = isFinalPageRerun
      ? Array.from(
          new Map(
            [...existingPagesByIndex.entries(), ...outputPages.map((page) => [page.page_index, page] as const)]
          ).values()
        ).sort((a, b) => a.page_index - b.page_index)
      : outputPages
    const mergedSubtitlePages = isFinalPageRerun
      ? Array.from(
          new Map(
            [
              ...(
                Array.isArray(existingOutputAssets.subtitle_pages)
                  ? existingOutputAssets.subtitle_pages
                  : []
              ).map((page) => [page.page_index, page] as const),
              ...subtitlePages.map((page) => [page.page_index, page] as const),
            ]
          ).values()
        ).sort((a, b) => a.page_index - b.page_index)
      : subtitlePages

    return {
      ...existingOutputAssets,
      execution_mode: WORKER_EXECUTION_MODE,
      ...(singlePageContract
        ? {
            schema_version: singlePageContract.schema_version,
            asset_layout: singlePageContract.asset_layout,
          }
        : {}),
      bucket: RAW_BUCKET,
      pages: mergedPages,
      runtime_manifest_path: runtimeManifestPath || existingOutputAssets.runtime_manifest_path || null,
      subtitle_pages:
        mergedSubtitlePages.length > 0 ? mergedSubtitlePages : existingOutputAssets.subtitle_pages || [],
    }
  }
  const persistPreviewPartialOutput = async () => {
    if (job.job_type !== 'preview' || outputPages.length === 0) return
    await supabase
      .from('jobs')
      .update({
        output_assets: buildOutputAssets(),
        provider_runs: providerRuns,
        render_runs: renderRuns,
        updated_at: new Date().toISOString(),
      })
      .eq('job_id', job.job_id)
  }
  const preparedPages = await preparePageInputs({
    job,
    config,
    pageIndexList,
    pageMap,
    basePath,
    templateFileSet,
    jobDatePath,
    subtitleEnabled: subtitleEnabledForJob,
    isSinglePageContract,
  })
  const preparedPageMap = new Map(preparedPages.map((item) => [item.pageIndex, item]))
  const previewOrderMap = new Map(pageIndexList.map((pageIndex, order) => [pageIndex, order]))
  runtimeManifestPath = `jobs/${jobDatePath}/${job.job_id}/runtime/manifest.json`
  runtimeManifest = {
    generated_at: new Date().toISOString(),
    job_id: job.job_id,
    job_type: job.job_type,
    template_id: job.template_id,
    execution_mode: WORKER_EXECUTION_MODE,
    ...(singlePageContract
      ? {
          schema_version: singlePageContract.schema_version,
          asset_layout: singlePageContract.asset_layout,
        }
      : {}),
    subtitle_render: subtitleEnabledForJob
      ? {
          enabled: true,
          template_path: subtitleContext?.storagePath || null,
          fonts_path: subtitleConfig?.fonts_path?.trim() || null,
          placeholder_keys: subtitleConfig?.placeholder_keys ?? ['name'],
        }
      : {
          enabled: false,
        },
    pages: preparedPages.map((item) => {
      const presentation = singlePageManifestByIndex.get(item.pageIndex)
      return {
        page_index: item.pageIndex,
        ...(presentation
          ? toBookPageOutputMetadata(presentation)
          : {}),
        provider: item.provider,
        stage: item.stageKey,
        deployment_id: item.stage.deployment_id || null,
        workflow_json_path: item.workflowJsonPath || null,
        template_image: item.templateImageName,
        subtitle_render_enabled: item.subtitleEnabled,
        subtitle_template_path: item.subtitleEnabled ? subtitleContext?.storagePath || null : null,
        workflow_override: item.workflowOverrideSummary,
      }
    }),
  }
  runtimeManifestPageMap = new Map(runtimeManifest.pages.map((entry) => [entry.page_index, entry]))
  await persistRuntimeManifest()

  const markPageCompleted = async (pageIndex: number, pageStartedAt: number) => {
    completedPages += 1
    const progress = Math.min(95, Math.round((completedPages / pageIndexList.length) * 90))
    const now = Date.now()
    if (
      now - lastProgressUpdateAt >= PROGRESS_UPDATE_MIN_INTERVAL_MS ||
      completedPages === pageIndexList.length ||
      progress >= 95
    ) {
      await supabase
        .from('jobs')
        .update({ progress, updated_at: new Date().toISOString() })
        .eq('job_id', job.job_id)
      lastProgressUpdateAt = now
    }

    const pageDurationMs = Date.now() - pageStartedAt
    console.log(
      `[job:${job.job_id}] page ${pageIndex} done in ${pageDurationMs}ms (${completedPages}/${pageIndexList.length})`
    )
  }

  const updateFinalReviewPage = async (
    pageIndex: number,
    payload: Record<string, unknown>
  ) => {
    if (!finalReviewJob) return
    let updateQuery = supabase
      .from('final_job_pages')
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
      })
      .eq('final_job_id', finalReviewJob.final_job_id)
      .eq('page_index', pageIndex)
    if (shouldProtectApprovedFinalRevision(isFinalPageRerun)) {
      updateQuery = updateQuery.is('approved_output_path', null)
    }
    await updateQuery
  }

  const processSinglePage = async (pageIndex: number) => {
    await throwIfCancelled()

    const prepared = preparedPageMap.get(pageIndex)
    if (!prepared) {
      throw new Error(`Missing prepared page input for index ${pageIndex}`)
    }
    const { page } = prepared
    const pageStartedAt = Date.now()
    console.log(`[job:${job.job_id}] page ${pageIndex} started`)
    console.log(
      `[job:${job.job_id}] page=${page.index} template=${prepared.templateImageName} stage=${prepared.stageKey}`
    )
    await updateFinalReviewPage(page.index, {
      status: 'processing',
      error_message: null,
    })

    let buffer: Buffer | null = null
    let lastPageError: unknown = null
    let renderedTemplateUrl = prepared.templateUrl ?? null
    let renderedTemplateBuffer: Buffer | null = null
    const pageTimings: SubtitleRenderTimings = {}

    if (prepared.subtitleEnabled) {
      const renderStartedAt = new Date().toISOString()
      await setRenderRunState(page.index, {
        page_index: page.index,
        status: 'RENDERING',
        started_at: renderStartedAt,
        template_image: prepared.templateImageName,
        subtitle_template_path: subtitleContext?.storagePath || null,
        rendered_storage_path: null,
        error: null,
      })

      try {
        if (!subtitleContext) {
          throw new Error('subtitle_render.enabled=true but subtitle context is missing')
        }

        const subtitlePage: SubtitleTemplatePage | undefined = subtitleContext.pageMap.get(prepared.templateImageName)
        if (!subtitlePage) {
          throw new Error(`Missing subtitle template entry for image ${prepared.templateImageName}`)
        }

        const templateDownloadStartedAt = Date.now()
        const baseImageBuffer = await downloadBuffer(APP_TEMPLATES_BUCKET, prepared.templateStoragePath)
        pageTimings.template_download_ms = Date.now() - templateDownloadStartedAt

        const subtitleRenderStartedAt = Date.now()
        const renderedSubtitleBuffer = await renderSubtitlePage({
          baseImage: baseImageBuffer,
          subtitlePage,
          childName,
          fontAssets: subtitleContext.fontAssets,
        })
        pageTimings.render_ms = Date.now() - subtitleRenderStartedAt
        renderedTemplateBuffer = renderedSubtitleBuffer

        const hasRenderedText = Array.isArray(subtitlePage.texts) && subtitlePage.texts.length > 0
        const subtitleOutputFormat = hasRenderedText
          ? ({ ext: 'png', contentType: 'image/png' } as const)
          : resolveStoredImageFormat(renderedSubtitleBuffer)

        const subtitleStoragePath = `jobs/${jobDatePath}/${job.job_id}/runtime/subtitles/page_${padPageIndex(
          page.index
        )}.${subtitleOutputFormat.ext}`
        const subtitleUploadStartedAt = Date.now()
        await uploadBuffer(
          RAW_BUCKET,
          subtitleStoragePath,
          renderedSubtitleBuffer,
          subtitleOutputFormat.contentType
        )
        pageTimings.subtitle_upload_ms = Date.now() - subtitleUploadStartedAt

        subtitlePages.push({
          page_index: page.index,
          template_image: prepared.templateImageName,
          storage_path: subtitleStoragePath,
        })
        updateRuntimeManifestPage(page.index, {
          subtitle_output_path: subtitleStoragePath,
        })

        if (IS_MOCK_MODE) {
          renderedTemplateUrl = prepared.templateUrl ?? `mock://subtitle/${job.job_id}/${page.index}`
        } else if (page.enable_face_swap !== false) {
          const workflowPrepareStartedAt = Date.now()
          renderedTemplateUrl = await prepareWorkflowImageUrl({
            sourceBuffer: renderedSubtitleBuffer,
            sourceContentType: subtitleOutputFormat.contentType,
            jobId: job.job_id,
            jobDatePath,
            pageIndex: page.index,
            kind: 'intermediate',
            forceRuntimeUpload: WORKFLOW_FORCE_RUNTIME_TARGET_UPLOAD,
            allowOptimization: allowInputOptimization,
            signTtlSec: inputSignTtlSec,
          })
          pageTimings.workflow_prepare_ms = Date.now() - workflowPrepareStartedAt
        }

        await setRenderRunState(page.index, {
          page_index: page.index,
          status: 'COMPLETED',
          started_at: renderStartedAt,
          finished_at: new Date().toISOString(),
          template_image: prepared.templateImageName,
          subtitle_template_path: subtitleContext.storagePath,
          rendered_storage_path: subtitleStoragePath,
          error: null,
          timings: { ...pageTimings },
        })
        updateRuntimeManifestPage(page.index, {
          timings: { ...pageTimings },
        })
      } catch (error) {
        if (error instanceof JobCancelledError) {
          throw error
        }
        await setRenderRunState(page.index, {
          page_index: page.index,
          status: 'FAILED',
          started_at: renderStartedAt,
          finished_at: new Date().toISOString(),
          template_image: prepared.templateImageName,
          subtitle_template_path: subtitleContext?.storagePath || null,
          rendered_storage_path: null,
          error: (error as any)?.message || 'Unknown subtitle render error',
          timings: { ...pageTimings },
        })
        updateRuntimeManifestPage(page.index, {
          timings: { ...pageTimings },
        })
        await updateFinalReviewPage(page.index, {
          status: 'failed',
          error_message: (error as any)?.message || 'Unknown subtitle render error',
        })
        throw new Error(`Subtitle render failed on page ${page.index}: ${(error as any)?.message || error}`)
      }
    }

    await throwIfCancelled()

    const bypassFaceProvider = shouldBypassFaceProvider({ page, isMockMode: IS_MOCK_MODE })
    if (bypassFaceProvider) {
      buffer = renderedTemplateBuffer ?? (await downloadBuffer(APP_TEMPLATES_BUCKET, prepared.templateStoragePath))
      console.log(`[job:${job.job_id}] page=${page.index} face provider bypassed by config`)
    } else {
      if (!renderedTemplateUrl) {
        throw new Error(`Missing rendered template URL for page ${page.index}`)
      }

      for (let attempt = 1; attempt <= pageMaxAttempts; attempt += 1) {
        try {
        const faceUrl = IS_MOCK_MODE ? `mock://face/${job.job_id}/${page.index}` : await getFaceSignedUrl(false)
        const providerAdapter = resolveProviderAdapter(prepared.provider)
        const payload = IS_MOCK_MODE
          ? {}
          : providerAdapter.buildPayload({
              faceUrl,
              renderedTemplateUrl,
              stageKey: prepared.stageKey,
              stage: prepared.stage,
              workflowJson: prepared.workflowJson,
              pageWorkflowOverride: prepared.pageWorkflowOverride,
            }).payload
        console.log(
          `[job:${job.job_id}] page=${page.index} deployment=${prepared.stage.deployment_id || 'missing'}`
        )

        if (WORKER_DEBUG_PROMPTS) {
          console.log(`[job:${job.job_id}] page=${page.index} enable_face_swap=${page.enable_face_swap !== false}`)
          console.log(
            `[job:${job.job_id}] page=${page.index} payload.overrides=${truncateForLog(
              (payload as any)?.overrides
            )}`
          )
        }

        const providerStartedAt = Date.now()
        const workflowResult = await providerAdapter.execute({
          stageKey: prepared.stageKey,
          stage: prepared.stage,
          payload,
          faceUrl,
          renderedTemplateUrl,
          pageWorkflowOverride: prepared.pageWorkflowOverride,
          mockResultBuffer: renderedTemplateBuffer,
          throwIfCancelled,
          pollTimeoutMs: pagePollTimeoutMs,
          pollIntervalMs: pagePollIntervalMs,
          statusRetryMax,
          resultRetryMax,
          onProviderEvent: async (state) => setProviderRunState(page.index, state),
        }).finally(() => {
          pageTimings.provider_handoff_ms = Date.now() - providerStartedAt
        })
        buffer = workflowResult.buffer
        break
        } catch (error) {
          if (error instanceof JobCancelledError) {
            throw error
          }
          lastPageError = error
          const canRetry = attempt < pageMaxAttempts && isRetriablePageError(error)
          if (!canRetry) {
            break
          }
          const waitMs = attempt * 1200 + Math.floor(Math.random() * 400)
          console.warn(
            `[job:${job.job_id}] page ${page.index} attempt ${attempt}/${pageMaxAttempts} failed; retrying in ${waitMs}ms:`,
            (error as any)?.message || error
          )
          await sleep(waitMs)
        }
      }
    }

    if (!buffer) {
      const detail = (lastPageError as any)?.message ? `: ${(lastPageError as any).message}` : ''
        if (lastPageError) {
          await setProviderRunState(page.index, {
          provider: prepared.provider,
          stage: prepared.stageKey,
          deployment_id: prepared.stage.deployment_id?.trim() || '',
          request_id: null,
          status_url: null,
          result_url: null,
          status: 'FAILED',
          finished_at: new Date().toISOString(),
          error: (lastPageError as any)?.message || `Unknown ${prepared.provider} error`,
        })
      }
      if (prepared.subtitleEnabled) {
        await setRenderRunState(page.index, {
          page_index: page.index,
          timings: { ...pageTimings },
        })
        updateRuntimeManifestPage(page.index, {
          timings: { ...pageTimings },
        })
      }
      await updateFinalReviewPage(page.index, {
        status: 'failed',
        error_message: (lastPageError as any)?.message || `Unknown ${prepared.provider} error`,
      })
      throw new Error(`Workflow failed on page ${page.index}${detail}`)
    }

    await throwIfCancelled()

    const normalized = await normalizeWorkflowBuffer(buffer)
    const originalBuffer = normalized.buffer
    const ext = normalized.ext
    const contentType = normalized.contentType
    let displayBuffer = originalBuffer
    let displayExt: 'png' | 'jpg' | 'webp' = ext
    let displayContentType: 'image/png' | 'image/jpeg' | 'image/webp' = contentType
    let previewDisplayStats: PreviewDisplayStats | undefined
    if (job.job_type === 'preview') {
      if (
        shouldEncodePreviewDisplayWebp({
          jobType: job.job_type,
          isSinglePageContract: Boolean(singlePageContract),
        })
      ) {
        const previewDisplay = await encodePreviewDisplayWebp({
          sourceBuffer: originalBuffer,
          maxWidth: PREVIEW_MAX_WIDTH,
          quality: PREVIEW_WEBP_QUALITY,
        })
        displayBuffer = previewDisplay.buffer
        displayExt = previewDisplay.ext
        displayContentType = previewDisplay.contentType
        previewDisplayStats = previewDisplay.stats
        updateRuntimeManifestPage(page.index, { preview_display: previewDisplay.stats })
        console.log(
          `[job:${job.job_id}] page=${page.index} preview webp source=${previewDisplay.stats.source_bytes}B ` +
            `uploaded=${previewDisplay.stats.uploaded_bytes}B encode=${previewDisplay.stats.encode_ms}ms`
        )
      } else {
        displayBuffer = await maybeResizePreviewBuffer(job.job_type, originalBuffer, ext)
      }
    }
    const finalPageNumber =
      finalReviewJob && job.job_type === 'final'
        ? finalPageNumberByIndex.get(page.index) ?? page.index + 1
        : null
    const outputBase =
      finalReviewJob && job.job_type === 'final'
        ? `orders/${finalReviewJob.order_id}/final/pages/ai/page_${padFinalPageNumber(finalPageNumber ?? 1)}`
        : `${outputRoot}/page_${padPageIndex(page.index)}`
    const outputPath = `${outputBase}.${displayExt}`
    const fullPath = `${outputBase}_full.${ext}`

    const outputUploadStartedAt = Date.now()
    if (job.job_type === 'preview') {
      await Promise.all([
        uploadBuffer(RAW_BUCKET, outputPath, displayBuffer, displayContentType),
        uploadBuffer(RAW_BUCKET, fullPath, originalBuffer, contentType),
      ])
    } else {
      await uploadBuffer(RAW_BUCKET, outputPath, originalBuffer, contentType)
    }
    pageTimings.output_upload_ms = Date.now() - outputUploadStartedAt

    await throwIfCancelled()

    const presentation = singlePageManifestByIndex.get(page.index)
    outputPages.push({
      page_index: page.index,
      ...(presentation
        ? toBookPageOutputMetadata(presentation)
        : {}),
      preview_order: job.job_type === 'preview' ? previewOrderMap.get(page.index) ?? 0 : undefined,
      storage_path: outputPath,
      storage_path_full: job.job_type === 'preview' ? fullPath : undefined,
      preview_display: previewDisplayStats,
    })
    await updateFinalReviewPage(page.index, {
      status: 'pending_review',
      ai_output_path: outputPath,
      error_message: null,
    })
    const finalPdfBuffer = await maybeResizeFinalPdfBuffer(originalBuffer, ext)
    outputBuffers.push({
      page_index: page.index,
      buffer: job.job_type === 'final' ? finalPdfBuffer : displayBuffer,
    })
    pageTimings.total_page_ms = Date.now() - pageStartedAt
    if (prepared.subtitleEnabled) {
      await setRenderRunState(page.index, {
        page_index: page.index,
        timings: { ...pageTimings },
      })
      updateRuntimeManifestPage(page.index, {
        timings: { ...pageTimings },
      })
    }
    await persistPreviewPartialOutput()
    await markPageCompleted(page.index, pageStartedAt)
  }

  const previewParallelism = Math.max(1, Math.min(PREVIEW_PAGE_CONCURRENCY, pageIndexList.length))
  const shouldRunPreviewParallel = job.job_type === 'preview' && workflowProvider !== 'runpod' && previewParallelism > 1

  if (shouldRunPreviewParallel) {
    console.log(
      `[job:${job.job_id}] preview parallel enabled: concurrency=${previewParallelism}, pages=${pageIndexList.length}`
    )
    let cursor = 0
    const workers = Array.from({ length: previewParallelism }, async () => {
      while (true) {
        const next = cursor
        cursor += 1
        if (next >= pageIndexList.length) break
        await processSinglePage(pageIndexList[next])
      }
    })
    await Promise.all(workers)
  } else {
    for (const pageIndex of pageIndexList) {
      await processSinglePage(pageIndex)
    }
  }

  await throwIfCancelled()

  const outputAssets = buildOutputAssets()
  if (finalReviewJob) {
    const { data: completedReviewPages, error: completedReviewPagesError } = await supabase
      .from('final_job_pages')
      .select('page_index, ai_output_path, approved_output_path')
      .eq('final_job_id', finalReviewJob.final_job_id)
      .in('page_index', pageIndexList)
    if (completedReviewPagesError) {
      throw new Error(`Failed to verify final review outputs: ${completedReviewPagesError.message}`)
    }
    assertFinalCompletionCoverage({
      expectedPageIndices: pageIndexList,
      generatedPageIndices: outputPages.map((page) => page.page_index),
      populatedReviewPageIndices: (completedReviewPages || [])
        .filter((page) => String(page.ai_output_path || page.approved_output_path || '').trim())
        .map((page) => Number(page.page_index)),
    })

    const { count: approvedCount } = await supabase
      .from('final_job_pages')
      .select('final_job_page_id', { count: 'exact', head: true })
      .eq('final_job_id', finalReviewJob.final_job_id)
      .in('status', ['approved', 'replaced'])
      .not('approved_output_path', 'is', null)

    const completionState = buildFinalReviewCompletionState({
      approvedPages: approvedCount ?? 0,
      totalPages: finalReviewJob.total_pages || pageIndexList.length,
    })

    await supabase
      .from('final_jobs')
      .update({
        status: 'review_pending',
        review_status: completionState.reviewStatus,
        total_pages: finalReviewJob.total_pages || pageIndexList.length,
        approved_pages: completionState.approvedPages,
        ...(completionState.clearManualWarning ? { error_message: null } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('final_job_id', finalReviewJob.final_job_id)
  }

  let pdfPath: string | null = null
  if (job.job_type === 'final' && !finalReviewJob) {
    await supabase
      .from('jobs')
      .update({ progress: 95, updated_at: new Date().toISOString() })
      .eq('job_id', job.job_id)

    let pdfBuffer = await buildPdf(outputBuffers)
    console.log(`[job:${job.job_id}] final pdf bytes=${pdfBuffer.length}`)

    if (pdfBuffer.length > FINAL_PDF_MAX_UPLOAD_BYTES) {
      console.warn(
        `[job:${job.job_id}] final pdf is larger than upload limit; target<=${FINAL_PDF_MAX_UPLOAD_BYTES} bytes`
      )
      const fitted = await fitFinalPdfWithinLimit({
        pages: outputBuffers,
        initialPdf: pdfBuffer,
        jobId: job.job_id,
      })
      pdfBuffer = fitted.buffer
      if (fitted.compressed) {
        outputAssets.pdf_compressed_retry = true
      }
      console.log(`[job:${job.job_id}] fitted final pdf bytes=${pdfBuffer.length}`)
    }

    if (pdfBuffer.length > FINAL_PDF_MAX_UPLOAD_BYTES) {
      throw new Error(
        `Final PDF exceeds storage limit after compression attempts (${pdfBuffer.length} > ${FINAL_PDF_MAX_UPLOAD_BYTES})`
      )
    }

    await supabase
      .from('jobs')
      .update({ progress: 97, updated_at: new Date().toISOString() })
      .eq('job_id', job.job_id)

    pdfPath = `${outputRoot}/final_book.pdf`
    try {
      await uploadBuffer(RAW_BUCKET, pdfPath, pdfBuffer, 'application/pdf')
    } catch (error) {
      if (!isObjectTooLargeError(error)) {
        throw error
      }
      console.warn(`[job:${job.job_id}] upload reported object too large; doing emergency fit retry`)
      const emergency = await fitFinalPdfWithinLimit({
        pages: outputBuffers,
        initialPdf: pdfBuffer,
        jobId: job.job_id,
      })
      if (emergency.buffer.length > FINAL_PDF_MAX_UPLOAD_BYTES) {
        throw new Error(
          `Final PDF still exceeds storage limit after emergency retry (${emergency.buffer.length} > ${FINAL_PDF_MAX_UPLOAD_BYTES})`
        )
      }
      await uploadBuffer(RAW_BUCKET, pdfPath, emergency.buffer, 'application/pdf')
      outputAssets.pdf_compressed_retry = true
    }
    outputAssets.pdf_path = pdfPath

    await supabase
      .from('jobs')
      .update({ progress: 99, updated_at: new Date().toISOString() })
      .eq('job_id', job.job_id)
  }

  await throwIfCancelled()

  await supabase
    .from('jobs')
    .update({
      status: 'done',
      progress: 100,
      provider_runs: providerRuns,
      render_runs: renderRuns,
      output_assets: outputAssets,
      updated_at: new Date().toISOString(),
    })
    .eq('job_id', job.job_id)

  console.log(
    `[job:${job.job_id}] completed type=${job.job_type} pages=${pageIndexList.length} total_ms=${Date.now() - jobStartedAt}`
  )

  if (job.job_type === 'final' && job.cart_item_id) {
    await supabase
      .from('cart_items')
      .update({
        final_job_id: job.job_id,
        updated_at: new Date().toISOString(),
      })
      .eq('cart_item_id', job.cart_item_id)
  }

  if (job.job_type === 'final' && pdfPath && CALLBACK_URL && CALLBACK_SECRET) {
    try {
      const callbackResponse = await fetch(CALLBACK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': CALLBACK_SECRET,
        },
        body: JSON.stringify({ jobId: job.job_id }),
      })
      if (!callbackResponse.ok) {
        const text = await callbackResponse.text()
        console.error('[worker-callback] failed response:', callbackResponse.status, text)
      }
    } catch (error) {
      console.error('[worker-callback] failed:', error)
    }
  }
  } catch (error) {
    if (error instanceof JobCancelledError) {
      console.log(`[job:${job.job_id}] preview cancelled by user`)
      await finalizeCancelledPreviewJob()
      return
    }
    if (finalReviewJob) {
      await supabase
        .from('final_jobs')
        .update({
          status: 'failed',
          error_message: (error as any)?.message || 'Unknown final job error',
          updated_at: new Date().toISOString(),
        })
        .eq('final_job_id', finalReviewJob.final_job_id)
    }
    throw error
  } finally {
    await persistRuntimeManifest()
  }
}

async function main() {
  installShutdownHandlers()
  let healthServer: http.Server | null = null
  let healthchecksTimer: NodeJS.Timeout | null = null

  try {
    healthServer = await startHealthServer()
    healthchecksTimer = startHealthchecksPing()

    console.log('Worker started')
    console.log(`[worker] mode=${WORKER_EXECUTION_MODE}`)
    console.log(`[worker] poll_enabled=${WORKER_POLL_ENABLED}`)
    if (EXECUTION_MODE_RESOLUTION.source === 'default') {
      console.log('[worker] WORKER_EXECUTION_MODE is unset; defaulting safely to provider')
    } else if (EXECUTION_MODE_RESOLUTION.source === 'invalid') {
      console.warn('[worker] WORKER_EXECUTION_MODE is invalid; defaulting safely to provider')
    }
    console.log(
      `[worker] poll_interval_ms preview=${RUNCOMFY_POLL_INTERVAL_PREVIEW_MS} final=${RUNCOMFY_POLL_INTERVAL_FINAL_MS}`
    )
    console.log(`[worker] runpod_poll_interval_ms=${RUNPOD_POLL_INTERVAL_MS}`)
    console.log(
      `[worker] poll_timeout_ms preview=${RUNCOMFY_POLL_TIMEOUT_PREVIEW_MS} final=${RUNCOMFY_POLL_TIMEOUT_FINAL_MS}`
    )
    console.log(
      `[worker] runpod_poll_timeout_ms preview=${RUNPOD_POLL_TIMEOUT_PREVIEW_MS} final=${RUNPOD_POLL_TIMEOUT_FINAL_MS}`
    )
    console.log(
      `[worker] claim_idle_ms initial=${WORKER_CLAIM_IDLE_INITIAL_MS} max=${WORKER_CLAIM_IDLE_MAX_MS} backoff=${WORKER_CLAIM_IDLE_BACKOFF_MULTIPLIER}`
    )
    console.log(
      `[worker] preview_poll_timeout_hard_cap_ms=${PREVIEW_POLL_TIMEOUT_HARD_CAP_MS}`
    )
    console.log(
      `[worker] page_attempts preview=${PREVIEW_PAGE_MAX_ATTEMPTS} final=${FINAL_PAGE_MAX_ATTEMPTS}`
    )
    console.log(
      `[worker] status_retry_max preview=${RUNCOMFY_STATUS_RETRY_MAX_PREVIEW} final=${RUNCOMFY_STATUS_RETRY_MAX_FINAL}`
    )
    console.log(
      `[worker] result_retry_max preview=${RUNCOMFY_RESULT_RETRY_MAX_PREVIEW} final=${RUNCOMFY_RESULT_RETRY_MAX_FINAL}`
    )
    console.log(
      `[worker] input_sign_ttl_sec preview=${RUNCOMFY_INPUT_SIGN_TTL_PREVIEW_SEC} final=${RUNCOMFY_INPUT_SIGN_TTL_FINAL_SEC}`
    )
    console.log(
      `[worker] storage_max_object_bytes=${STORAGE_MAX_OBJECT_BYTES} upload_target_bytes=${FINAL_PDF_MAX_UPLOAD_BYTES}`
    )
    console.log(
      `[worker] final_pdf_retry width=${FINAL_PDF_RETRY_MAX_WIDTH} jpeg_quality=${FINAL_PDF_RETRY_JPEG_QUALITY}`
    )
    if (!IS_MOCK_MODE) {
      const hasRunComfyApiKey = Boolean(process.env.RUNCOMFY_API_TOKEN)
      const hasRunPodApiKey = Boolean(process.env.RUNPOD_API_KEY)
      console.log(`[worker] runcomfy_api_token=${hasRunComfyApiKey ? 'configured' : 'missing'}`)
      console.log(`[worker] runpod_api_key=${hasRunPodApiKey ? 'configured' : 'missing'}`)
    }

    if (!WORKER_POLL_ENABLED) {
      console.log('[worker] polling paused; set WORKER_POLL_ENABLED=true and restart to claim jobs')
      while (!shutdownRequested) {
        await sleep(1000)
      }
      return
    }

    let idleMs = WORKER_CLAIM_IDLE_INITIAL_MS
    const maxIdleMs = WORKER_CLAIM_IDLE_MAX_MS
    const idleBackoff = WORKER_CLAIM_IDLE_BACKOFF_MULTIPLIER

    while (!shutdownRequested) {
      lastClaimPollAt = nowIso()
      const { data, error } = await supabase.rpc('claim_next_job')

      if (error) {
        rememberError(error)
        console.error('Job claim error:', error.message)
        await sleep(idleMs)
        idleMs = Math.min(Math.round(idleMs * idleBackoff), maxIdleMs)
        continue
      }

      lastSupabaseOkAt = nowIso()
      const job = Array.isArray(data) ? data[0] : data

      if (!job) {
        await sleep(idleMs)
        idleMs = Math.min(Math.round(idleMs * idleBackoff), maxIdleMs)
        continue
      }

      idleMs = WORKER_CLAIM_IDLE_INITIAL_MS

      markJobStarted(job as JobRow)
      try {
        await processJob(job as JobRow)
      } catch (error: any) {
        rememberError(error)
        console.error('Job failed:', error)
        await supabase
          .from('jobs')
          .update({
            status: 'failed',
            error_message: error?.message ?? 'Unknown worker error',
            updated_at: new Date().toISOString(),
          })
          .eq('job_id', job.job_id)
      } finally {
        markJobFinished(job.job_id)
      }
    }
  } finally {
    if (healthchecksTimer) clearInterval(healthchecksTimer)
    await closeHealthServer(healthServer)
    console.log('[worker] shutdown requested; main loop stopped')
  }
}

main().catch((error) => {
  console.error('Worker crashed:', error)
  process.exit(1)
})
