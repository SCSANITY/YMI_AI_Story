import assert from 'node:assert/strict'
import test from 'node:test'

import { resolvePreviewCapacityState } from './preview-capacity'

test('marks an owned Preview waiting while it is still in the orchestrator queue', () => {
  assert.equal(
    resolvePreviewCapacityState({ jobType: 'preview', status: 'queued' }),
    'waiting'
  )
})

test('marks a running Preview waiting only while RunPod reports a provider queue', () => {
  assert.equal(
    resolvePreviewCapacityState({
      jobType: 'preview',
      status: 'running',
      providerRuns: {
        0: {
          face_swap: { provider: 'runpod', status: 'IN_QUEUE' },
        },
      },
    }),
    'waiting'
  )
  assert.equal(
    resolvePreviewCapacityState({
      jobType: 'preview',
      status: 'running',
      providerRuns: {
        0: {
          face_swap: { provider: 'runpod', status: 'IN_PROGRESS' },
        },
      },
    }),
    'normal'
  )
})

test('does not surface capacity messaging for Final or terminal jobs', () => {
  assert.equal(
    resolvePreviewCapacityState({ jobType: 'final', status: 'queued' }),
    'normal'
  )
  assert.equal(
    resolvePreviewCapacityState({
      jobType: 'preview',
      status: 'done',
      providerRuns: { 0: { face_swap: { status: 'IN_QUEUE' } } },
    }),
    'normal'
  )
})
