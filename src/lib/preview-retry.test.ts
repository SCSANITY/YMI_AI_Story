import assert from 'node:assert/strict'
import test from 'node:test'
import { resolvePreviewRetryDecision } from './preview-retry'

function providerRun(args: {
  failureCode: string
  retryable: boolean
  requestId?: string | null
}) {
  return {
    2: {
      preview_face: {
        request_id: args.requestId === undefined ? 'run-2' : args.requestId,
        failure_code: args.failureCode,
        retryable: args.retryable,
      },
    },
  }
}

test('exposes only K1 failures with a durable provider identity as retryable', () => {
  for (const failureCode of [
    'provider_not_ready',
    'provider_status_unavailable',
    'provider_poll_timeout',
    'provider_request_rejected',
    'provider_result_expired',
  ]) {
    assert.deepEqual(
      resolvePreviewRetryDecision(providerRun({ failureCode, retryable: true })),
      { failureCode: 'retryable_generation_failure', retryable: true }
    )
  }
})

test('fails closed for unknown submit outcomes even beside a retryable record', () => {
  assert.deepEqual(
    resolvePreviewRetryDecision({
      1: {
        preview_face: {
          request_id: 'safe-run',
          failure_code: 'provider_poll_timeout',
          retryable: true,
        },
      },
      2: {
        preview_face: {
          request_id: null,
          failure_code: 'provider_submit_unknown',
          retryable: false,
        },
      },
    }),
    { failureCode: 'generation_failed', retryable: false }
  )
})

test('does not infer retryability from a flag without a safe code and request id', () => {
  assert.equal(
    resolvePreviewRetryDecision(providerRun({
      failureCode: 'provider_poll_timeout',
      retryable: true,
      requestId: null,
    })).retryable,
    false
  )
  assert.equal(
    resolvePreviewRetryDecision(providerRun({
      failureCode: 'provider_terminal_failed',
      retryable: true,
    })).retryable,
    false
  )
  assert.equal(resolvePreviewRetryDecision(null).retryable, false)
})
