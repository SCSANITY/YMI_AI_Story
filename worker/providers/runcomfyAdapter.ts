import {
  constructProviderPayload,
  runProviderWorkflow,
  type ProviderPayloadBuildResult,
  type ProviderRunState,
  type ProviderStageConfig,
  type ProviderWorkflowCall,
  type WorkflowStageKey,
} from '../processor'

export type WorkflowProviderAdapter = {
  readonly provider: string
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

export const runComfyAdapter: WorkflowProviderAdapter = {
  provider: 'runcomfy',
  buildPayload: constructProviderPayload,
  execute: runProviderWorkflow,
}
