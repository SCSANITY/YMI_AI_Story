import { resolveJobRuntimeSnapshot, type ImageEditRuntimeSnapshot } from './imageEditRuntime'
import { randomUUID } from 'node:crypto'
import type { TemplatePage, ProviderStageConfig, PageWorkflowOverride, WorkflowStageKey, InputSnapshot, SubtitleRenderConfig } from './processor'
import type { PrivateImageEditConfigSnapshot } from './privateConfig'
import { PreviewImageInputError, type PreviewWholeJobPreflight } from './previewImageInput'
import { executeOpenAIImageEdit, validateOpenAIImageEditConfig, validateOpenAIInputImage,
  validateOpenAIOutput, type OpenAITransport } from './providers/openaiAdapter'
import { OpenAIExecutionError, appendOpenAIDispatchIntent, assertOpenAIFrozenRequestMatches,
  canonicalJson, createOpenAIConfigDigest, currentOpenAIAttempt, executeOpenAIWithinPageAttemptLoop,
  imageMetadataMatches, isOpenAIExecutionError, readOpenAIIntermediate, sha256Hex,
  storeOpenAIIntermediate, updateOpenAIAttempt, type OpenAIAttemptRecord,
  type OpenAIFrozenRequest, type OpenAIStageRunState } from './openaiRuntime'
import { renderSubtitlePage, type SubtitleTemplatePage, type SubtitleFontAsset } from './subtitleRenderer'

// Production and isolated local runs share this exact request/checkpoint path.
// Queue ownership, credentials and durable adapters belong to the caller.
export type PreviewExecutionPorts = {
  apiKey: string
  runtimeSnapshot?: ImageEditRuntimeSnapshot
  transport?: OpenAITransport
  loadState: () => OpenAIStageRunState
  persistState: (state: OpenAIStageRunState) => Promise<void>
  readImage: (bucket: string, path: string) => Promise<Buffer>
  createIntermediate: (path: string, buffer: Buffer) => Promise<void>
  assertActive: () => Promise<void>
  assertLease: () => void | Promise<void>
}

export async function executePreparedOpenAIPreviewPage(args: PreviewExecutionPorts & {
  job: { job_id: string; creation_id?: string | null; job_type: 'preview' | 'final' }
  prepared: { page: TemplatePage; templateStoragePath: string; stageKey: WorkflowStageKey;
    stage: ProviderStageConfig; pageWorkflowOverride?: PageWorkflowOverride | null }
  privateImageEditSnapshot: PrivateImageEditConfigSnapshot | null
  privateWholeJobPreflight: PreviewWholeJobPreflight | null
  sourceBucket: string
  identityBucket: string
  facePath: string
  intermediateDirectory: string
  pageMaxAttempts: number
}): Promise<Buffer> {
  const { job, prepared, privateImageEditSnapshot, privateWholeJobPreflight, facePath, pageMaxAttempts } = args
  const APP_TEMPLATES_BUCKET = args.sourceBucket
  const RAW_BUCKET = args.identityBucket
  const page = prepared.page
  let buffer: Buffer | null = null
  const privatePreflightPage = privateWholeJobPreflight?.pages.get(page.index) ?? null
  if (privateImageEditSnapshot && privatePreflightPage?.resolution.kind !== 'provider') {
    throw new PreviewImageInputError('preview_image_preparation_failed')
  }
  const configured = validateOpenAIImageEditConfig(
    privatePreflightPage?.resolution.kind === 'provider'
      ? privatePreflightPage.resolution.config
      : prepared.stage.openai_image_edit
  )
  const effectiveConfig = validateOpenAIImageEditConfig({
    ...configured,
    prompt: prepared.pageWorkflowOverride?.prompt ?? configured.prompt,
  })
  if (privateImageEditSnapshot) {
    if (!args.runtimeSnapshot) throw new OpenAIExecutionError('openai_preflight_failed', 'not_sent', 'Job runtime snapshot is missing')
    const snapshot = resolveJobRuntimeSnapshot({ jobType: job.job_type, stored: args.runtimeSnapshot })
    const { prompt: _prompt, prompt_version: _version, ...parameters } = effectiveConfig
    if (canonicalJson(snapshot.parameters) !== canonicalJson(parameters)) {
      throw new OpenAIExecutionError('openai_preflight_failed', 'not_sent', 'Request differs from Job runtime snapshot')
    }
  }
  if (
    prepared.pageWorkflowOverride?.seed !== undefined ||
    (prepared.pageWorkflowOverride?.static_inputs &&
      Object.keys(prepared.pageWorkflowOverride.static_inputs).length > 0)
  ) {
    throw new OpenAIExecutionError(
      'openai_preflight_failed',
      'not_sent',
      'OpenAI P1 supports only a page-level prompt override'
    )
  }
  const apiKey = args.apiKey.trim()
  if (!apiKey) {
    throw new OpenAIExecutionError(
      'openai_preflight_failed',
      'not_sent',
      'OpenAI API key is missing'
    )
  }

  const templateBuffer = privatePreflightPage?.provider_source
    ?? await args.readImage(APP_TEMPLATES_BUCKET, prepared.templateStoragePath)
  const identityBuffer = privateWholeJobPreflight?.identity?.prepared
    ?? await args.readImage(RAW_BUCKET, facePath)
  const sourceIdentity = await validateOpenAIInputImage(templateBuffer)
  const faceIdentity = await validateOpenAIInputImage(identityBuffer)
  const effectiveProviderConfig = {
    provider: 'openai' as const,
    ...effectiveConfig,
    ordered_input_roles: ['source_illustration', 'identity_reference'] as const,
  }
  const configDigest = createOpenAIConfigDigest(privateImageEditSnapshot
    ? {
        private_config_raw_sha256: privateImageEditSnapshot.raw_sha256,
        ...(args.runtimeSnapshot ? { runtime_snapshot_digest: args.runtimeSnapshot.snapshot_digest } : {}),
        resolved_provider_config: effectiveProviderConfig,
      }
    : effectiveProviderConfig)
  const privateSourceEvidence = privatePreflightPage?.source
    ? {
        original_media_type: privatePreflightPage.source.original_media_type,
        prepared_media_type: privatePreflightPage.source.prepared_media_type,
        original_sha256: privatePreflightPage.source.original_sha256,
        prepared_sha256: privatePreflightPage.source.prepared_sha256,
        original_width: privatePreflightPage.source.original_width,
        original_height: privatePreflightPage.source.original_height,
        prepared_width: privatePreflightPage.source.prepared_width,
        prepared_height: privatePreflightPage.source.prepared_height,
        transformation_version: privatePreflightPage.source.transformation_version,
      }
    : sourceIdentity
  const privateIdentityEvidence = privateWholeJobPreflight?.identity
    ? {
        original_media_type: privateWholeJobPreflight.identity.original_media_type,
        prepared_media_type: privateWholeJobPreflight.identity.prepared_media_type,
        original_sha256: privateWholeJobPreflight.identity.original_sha256,
        prepared_sha256: privateWholeJobPreflight.identity.prepared_sha256,
        original_width: privateWholeJobPreflight.identity.original_width,
        original_height: privateWholeJobPreflight.identity.original_height,
        prepared_width: privateWholeJobPreflight.identity.prepared_width,
        prepared_height: privateWholeJobPreflight.identity.prepared_height,
        transformation_version: privateWholeJobPreflight.identity.transformation_version,
      }
    : faceIdentity
  const frozenBase = {
    job_id: job.job_id,
    creation_id: job.creation_id ?? null,
    job_type: job.job_type,
    page_index: page.index,
    page_role: page.presentation?.role ?? null,
    source_illustration_identity: `${APP_TEMPLATES_BUCKET}/${prepared.templateStoragePath}`,
    identity_reference_identity: `${RAW_BUCKET}/${facePath}`,
    input_fingerprint: sha256Hex(canonicalJson({
      source: {
        storage_identity: `${APP_TEMPLATES_BUCKET}/${prepared.templateStoragePath}`,
        ...privateSourceEvidence,
      },
      identity: {
        storage_identity: `${RAW_BUCKET}/${facePath}`,
        ...privateIdentityEvidence,
      },
      page_index: page.index,
      stage: prepared.stageKey,
    })),
    provider: 'openai' as const,
    model: effectiveConfig.model,
    prompt_version: effectiveConfig.prompt_version,
    prompt_sha256: sha256Hex(effectiveConfig.prompt),
    ordered_input_roles: ['source_illustration', 'identity_reference'] as const,
    size: effectiveConfig.size,
    quality: effectiveConfig.quality,
    output_format: effectiveConfig.output_format,
    background: effectiveConfig.background,
    request_timeout_ms: effectiveConfig.request_timeout_ms,
    config_digest: configDigest,
  } satisfies OpenAIFrozenRequest

  const loadStoredIntermediate = (attempt: OpenAIAttemptRecord) => readOpenAIIntermediate({
    download: () => args.readImage(RAW_BUCKET, attempt.intermediate_path),
    validate: (stored) => validateOpenAIOutput(stored, attempt.frozen.size),
  })

  const throwStoredIntermediateReadFailure = (
    kind: 'mismatch' | 'unavailable'
  ): never => {
    if (kind === 'unavailable') {
      throw new OpenAIExecutionError(
        'openai_intermediate_unavailable',
        'result_received',
        'OpenAI durable intermediate is temporarily unavailable; resume without provider resubmission'
      )
    }
    throw new OpenAIExecutionError(
      'openai_intermediate_mismatch',
      'result_received',
      'OpenAI durable intermediate does not match its checkpoint'
    )
  }

  const resumeState = args.loadState()
  const resumeAttempt = currentOpenAIAttempt(resumeState)
  if (resumeAttempt?.request_budget_consumed) {
    assertOpenAIFrozenRequestMatches(resumeAttempt.frozen, frozenBase)
    if (resumeAttempt.output && ['result_received', 'intermediate_stored', 'composed'].includes(resumeAttempt.status)) {
      const stored = await loadStoredIntermediate(resumeAttempt)
      if (stored.kind === 'unavailable') {
        throwStoredIntermediateReadFailure('unavailable')
      }
      if (stored.kind === 'found' && imageMetadataMatches(stored.metadata, resumeAttempt.output)) {
        buffer = stored.buffer
        if (resumeAttempt.status === 'result_received') {
          const adoptedState = updateOpenAIAttempt(resumeState, resumeAttempt.attempt_id, {
            status: 'intermediate_stored',
            dispatch_disposition: 'result_received',
          })
          await args.persistState(adoptedState)
        }
      } else {
        const parkedState = updateOpenAIAttempt(resumeState, resumeAttempt.attempt_id, {
          status: 'outcome_unknown',
          error_code: 'openai_intermediate_mismatch',
        })
        await args.persistState(parkedState)
        throw new OpenAIExecutionError(
          'openai_intermediate_mismatch',
          'outcome_unknown',
          'OpenAI durable intermediate is absent or does not match its checkpoint'
        )
      }
    } else {
      if (resumeAttempt.status === 'dispatch_intent') {
        await args.persistState(updateOpenAIAttempt(resumeState, resumeAttempt.attempt_id, {
          status: 'outcome_unknown',
          error_code: 'openai_outcome_unknown',
        }))
      }
      throw new OpenAIExecutionError(
        'openai_request_budget_consumed',
        resumeAttempt.dispatch_disposition,
        'OpenAI request budget was already consumed for this Job page'
      )
    }
  } else {
    buffer = await executeOpenAIWithinPageAttemptLoop({
      pageMaxAttempts,
      loadState: () => args.loadState(),
      createAndPersistIntent: async (state) => {
        const attemptId = randomUUID()
        const intermediatePath = `${args.intermediateDirectory}/${attemptId}/page_${String(page.index).padStart(2, '0')}.png`
        const appended = appendOpenAIDispatchIntent({
          state,
          frozen: frozenBase,
          intermediatePath,
          attemptId,
        })
        await args.persistState(appended.state)
        return appended.attempt
      },
      dispatch: async (attempt) => {
        let result: Awaited<ReturnType<typeof executeOpenAIImageEdit>>
        try {
          await args.assertActive()
          result = await executeOpenAIImageEdit({
            attempt,
            config: effectiveConfig,
            sourceIllustration: templateBuffer,
            identityReference: identityBuffer,
            apiKey,
            privateConfigRawSha256: privateImageEditSnapshot?.raw_sha256,
            runtimeSnapshotDigest: args.runtimeSnapshot?.snapshot_digest,
            transport: args.transport,
          })
        } catch (error) {
          if (isOpenAIExecutionError(error)) {
            const latest = args.loadState()
            const status = error.disposition === 'conclusively_rejected'
              ? 'rejected'
              : error.disposition === 'outcome_unknown'
                ? 'outcome_unknown'
                : 'result_received'
            await args.persistState(updateOpenAIAttempt(latest, attempt.attempt_id, {
              status,
              dispatch_disposition: error.disposition,
              finished_at: new Date().toISOString(),
              provider_request_id: error.details.providerRequestId ?? null,
              provider_error_code: error.details.providerErrorCode ?? null,
              retry_after: error.details.retryAfter ?? null,
              http_status: error.details.httpStatus ?? null,
              error_code: error.code,
            }))
          }
          throw error
        }

        let latest = args.loadState()
        latest = updateOpenAIAttempt(latest, attempt.attempt_id, {
          status: 'result_received',
          dispatch_disposition: 'result_received',
          provider_request_id: result.providerRequestId,
          usage: result.usage,
          returned_settings: result.returnedSettings,
          calculated_charge_usd: result.calculatedChargeUsd,
          provider_timing_ms: result.providerTimingMs,
          output: result.metadata,
          error_code: null,
        })
        await args.persistState(latest)

        await storeOpenAIIntermediate({
          buffer: result.buffer,
          expected: result.metadata,
          assertLease: args.assertLease,
          createOnly: () => args.createIntermediate(attempt.intermediate_path, result.buffer),
          readExisting: async () => {
            const stored = await loadStoredIntermediate(attempt)
            if (stored.kind === 'found') return stored
            if (stored.kind === 'absent') return null
            return throwStoredIntermediateReadFailure(stored.kind)
          },
        })

        latest = args.loadState()
        await args.persistState(updateOpenAIAttempt(latest, attempt.attempt_id, {
          status: 'intermediate_stored',
          dispatch_disposition: 'result_received',
        }))
        return result.buffer
      },
    })
  }
  if (!buffer) throw new PreviewImageInputError('preview_image_preparation_failed')
  return buffer
}

export function composeOpenAIPreviewPage(args: {
  baseImage: Buffer; subtitlePage: SubtitleTemplatePage; childName: string; fontAssets: SubtitleFontAsset[]
}): Promise<Buffer> {
  return renderSubtitlePage({ ...args, preserveBaseDimensions: true })
}

function getChildAge(inputSnapshot: InputSnapshot | null | undefined): number | null {
  const textOverrides = inputSnapshot?.text_overrides ?? {}
  const raw = textOverrides.child_age ?? textOverrides.childAge ?? textOverrides.age
  if (raw === undefined || raw === null || raw === '') return null
  const age = Number.parseInt(String(raw), 10)
  return Number.isFinite(age) ? age : null
}

export function selectSubtitleTemplatePath(
  subtitleConfig: SubtitleRenderConfig,
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
