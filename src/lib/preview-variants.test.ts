import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PREVIEW_VARIANT_SESSION_CAP,
  getDiscardedPreviewVariantStatus,
  isCountedPreviewVariant,
  isPreviewVariantInvalidated,
  resolvePreviewVariantCommitGate,
  type PreviewVariantCommitMarker,
} from './preview-variants'

const creationId = '00000000-0000-4000-8000-000000000001'
const originalJobId = '00000000-0000-4000-8000-000000000002'
const selectedJobId = '00000000-0000-4000-8000-000000000003'
const otherJobId = '00000000-0000-4000-8000-000000000004'

const committedMarker: PreviewVariantCommitMarker = {
  creation_id: creationId,
  committed_at: '2026-07-20T00:00:00.000Z',
  expected_preview_job_id: originalJobId,
}

const baseGateInput = {
  creationId,
  currentPreviewJobId: originalJobId,
  expectedPreviewJobId: originalJobId,
  selectedPreviewJobId: selectedJobId,
  currentCommitMarker: null,
  purchaseState: 'unpurchased' as const,
  hasCartAttachment: false,
}

test('commit gate allows an unlocked matching CAS request', () => {
  assert.equal(resolvePreviewVariantCommitGate(baseGateInput), 'proceed')
})

test('commit gate returns conflict when another tab committed a different selection', () => {
  assert.equal(
    resolvePreviewVariantCommitGate({
      ...baseGateInput,
      currentPreviewJobId: otherJobId,
      currentCommitMarker: committedMarker,
    }),
    'conflict'
  )
})

test('commit gate treats a repeated commit of the winning selection as idempotent', () => {
  assert.equal(
    resolvePreviewVariantCommitGate({
      ...baseGateInput,
      currentPreviewJobId: selectedJobId,
      currentCommitMarker: committedMarker,
    }),
    'idempotent'
  )
})

test('commit gate blocks a new selection after the persistent commit lock', () => {
  assert.equal(
    resolvePreviewVariantCommitGate({
      ...baseGateInput,
      currentPreviewJobId: selectedJobId,
      expectedPreviewJobId: selectedJobId,
      selectedPreviewJobId: otherJobId,
      currentCommitMarker: committedMarker,
    }),
    'locked'
  )
})

test('commit gate blocks paid and refunded creations', () => {
  assert.equal(
    resolvePreviewVariantCommitGate({ ...baseGateInput, purchaseState: 'purchased' }),
    'locked'
  )
  assert.equal(
    resolvePreviewVariantCommitGate({ ...baseGateInput, purchaseState: 'refunded' }),
    'locked'
  )
})

test('commit gate blocks every cart or order attachment', () => {
  assert.equal(
    resolvePreviewVariantCommitGate({ ...baseGateInput, hasCartAttachment: true }),
    'locked'
  )
})

test('session cap counts queued, running and done variants but frees discarded slots', () => {
  const sessionId = '00000000-0000-4000-8000-000000000005'
  const marker = {
    preview_variant: {
      kind: 'change_photo',
      session_id: sessionId,
      request_id: selectedJobId,
      base_preview_job_id: originalJobId,
      face_asset_id: '00000000-0000-4000-8000-000000000006',
      face_storage_path: 'user-assets/anon/session/face_image/photo.webp',
      created_at: '2026-07-20T00:00:00.000Z',
    },
  }
  const jobs = ['queued', 'running', 'done', 'failed', 'cancelled'].map((status) => ({
    status,
    input_snapshot: marker,
  }))

  assert.equal(PREVIEW_VARIANT_SESSION_CAP, 5)
  assert.equal(jobs.filter((job) => isCountedPreviewVariant(job, sessionId)).length, 3)
})

test('discard marker prevents a transient variant from being committed later', () => {
  assert.equal(
    isPreviewVariantInvalidated({
      preview_variant_invalidated_at: '2026-07-20T00:00:00.000Z',
    }),
    true
  )
  assert.equal(isPreviewVariantInvalidated({}), false)
})

test('session cleanup requests cancellation only for work that may still run', () => {
  assert.equal(getDiscardedPreviewVariantStatus('queued'), 'cancelled')
  assert.equal(getDiscardedPreviewVariantStatus('running'), 'cancel_requested')
  assert.equal(getDiscardedPreviewVariantStatus('done'), 'cancelled')
  assert.equal(getDiscardedPreviewVariantStatus('failed'), 'failed')
  assert.equal(getDiscardedPreviewVariantStatus('cancelled'), 'cancelled')
})
