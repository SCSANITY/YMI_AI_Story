import assert from 'node:assert/strict'
import test from 'node:test'

import { JOB_QUEUE_ADMISSION_LIMITS, parseJobQueueAdmissionError } from './jobQueueAdmission'

test('maps database queue admission failures without exposing database detail', () => {
  assert.deepEqual(
    parseJobQueueAdmissionError({
      code: 'P0001',
      message: 'job_queue_overloaded:preview_owner_active',
      details: 'internal detail',
    }),
    {
      code: 'queue_overloaded',
      reason: 'preview_owner_active',
      message: 'Several previews are already being created for this account. Please wait for one to finish.',
    }
  )
  assert.equal(parseJobQueueAdmissionError(new Error('unrelated failure')), null)
})

test('mirrors the immutable WC-001 database admission constants for operations UI', () => {
  assert.deepEqual(JOB_QUEUE_ADMISSION_LIMITS, {
    maxQueuedPreview: 80,
    maxActivePreviewPerOwner: 6,
  })
})
