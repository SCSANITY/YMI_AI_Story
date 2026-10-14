import type { ImageEditRuntimeSnapshot, ImageEditQuality } from './imageEditRuntime'
import type { BookPagePresentation } from './bookPageContract'
import type { ImageEditContract, PageImageEditContract } from './imageEditContract'

export type InputSnapshot = {
  image_edit_runtime?: ImageEditRuntimeSnapshot
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
  presentation?: BookPagePresentation
  params_override?: Record<string, unknown>
  workflow_overrides?: Partial<Record<WorkflowStageKey, PageWorkflowOverride>>
  image_edit?: PageImageEditContract
}

export type WorkflowStageKey = 'preview_face' | 'final_face'

export type InputBinding = {
  node_id: string
  input_key?: string
}

export type OpenAIImageEditConfig = {
  model: string
  prompt: string
  prompt_version: string
  size: string
  quality: ImageEditQuality
  output_format: 'png'
  background: 'opaque'
  request_timeout_ms: number
}

export type ProviderStageConfig = {
  provider?: string
  enabled?: boolean
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
  openai_image_edit?: OpenAIImageEditConfig
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
  schema_version?: number
  asset_layout?: string
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
  image_edit?: ImageEditContract
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
  statusTransportMaxAttempts?: number
  statusTransportBackoffMs?: number
  notReadyRetryDelayMs?: number
  resumeProviderRun?: ProviderRunState | null
  onProviderEvent?: (state: ProviderRunState) => Promise<void> | void
}

export type ProviderPayloadBuildResult = {
  payload: Record<string, unknown>
}

export type ProviderFailureCode =
  | 'provider_not_ready'
  | 'provider_status_unavailable'
  | 'provider_submit_unknown'
  | 'provider_terminal_failed'
  | 'provider_cancelled'
  | 'provider_poll_timeout'
  | 'provider_request_rejected'
  | 'provider_invalid_response'
  | 'provider_result_expired'

export type ProviderRunState = {
  provider: 'runpod'
  stage: WorkflowStageKey
  deployment_id: string
  request_id: string | null
  status_url: string | null
  result_url: string | null
  status: string
  started_at?: string
  finished_at?: string
  error?: string | null
  failure_code?: ProviderFailureCode | null
  retryable?: boolean | null
}

export type WorkflowProviderAdapter = {
  readonly provider: 'runpod'
  buildPayload(args: {
    faceUrl: string
    renderedTemplateUrl: string
    stageKey: WorkflowStageKey
    stage: ProviderStageConfig
    workflowJson?: Record<string, unknown> | null
    pageWorkflowOverride?: ProviderWorkflowCall['pageWorkflowOverride']
  }): ProviderPayloadBuildResult
  execute(input: ProviderWorkflowCall): Promise<{ buffer: Buffer; providerRun: ProviderRunState }>
}
