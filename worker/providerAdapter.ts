import {
  type ProviderPayloadBuildResult,
  type ProviderRunState,
  type ProviderStageConfig,
  type ProviderWorkflowCall,
  type WorkflowStageKey,
} from './processor'
import { runComfyAdapter, type WorkflowProviderAdapter } from './providers/runcomfyAdapter'
import { runPodAdapter } from './providers/runpodAdapter'

export type WorkflowProviderName = 'runcomfy' | 'runpod'

export type ProviderAdapter = WorkflowProviderAdapter

export function normalizeWorkflowProvider(provider: unknown): WorkflowProviderName {
  const raw = String(provider || '').trim().toLowerCase()
  if (raw === 'runpod') return 'runpod'
  if (raw === 'runcomfy') return 'runcomfy'
  if (!raw) return 'runpod'
  return 'runcomfy'
}

export function resolveProviderAdapter(provider: unknown): ProviderAdapter {
  const normalized = normalizeWorkflowProvider(provider)
  if (normalized === 'runpod') {
    return runPodAdapter
  }
  return runComfyAdapter
}

export type {
  ProviderPayloadBuildResult,
  ProviderRunState,
  ProviderStageConfig,
  ProviderWorkflowCall,
  WorkflowStageKey,
}
