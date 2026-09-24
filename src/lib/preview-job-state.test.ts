import assert from 'node:assert/strict'
import test from 'node:test'
import { parsePreviewJobState, resolvePreviewJobPhase } from './preview-job-state'

const coverAssets = {
  schema_version: 3,
  asset_layout: 'single-page',
  pages: [{
    page_index: 0,
    output_order: 0,
    role: 'preview_cover',
    spread_index: 0,
    side: null,
    page_number: null,
    asset_size: 'small',
    url: 'https://signed.example/cover.webp',
  }],
}

test('failed Preview phases preserve a durable cover without claiming completion', () => {
  assert.equal(resolvePreviewJobPhase({ status: 'failed', hasCover: true, displayComplete: false }), 'partial_failed')
  assert.equal(resolvePreviewJobPhase({ status: 'failed', hasCover: false, displayComplete: false }), 'failed')
  assert.equal(resolvePreviewJobPhase({ status: 'done', hasCover: true, displayComplete: true }), 'complete')
  assert.equal(resolvePreviewJobPhase({ status: 'running', hasCover: true, displayComplete: false }), 'partial')
})

test('client parser accepts only the redacted progressive Preview contract', () => {
  const state = parsePreviewJobState({
    job_id: '10000000-0000-4000-8000-000000000001',
    status: 'failed',
    phase: 'partial_failed',
    progress: 30,
    capacity_state: 'normal',
    failure_code: 'generation_failed',
    assets: coverAssets,
    provider_runs: { must: 'be ignored' },
    error_message: 'must be ignored',
  })

  assert.equal(state.phase, 'partial_failed')
  assert.equal(state.assets?.pages[0].role, 'preview_cover')
  assert.equal(state.failureCode, 'generation_failed')
  assert.equal('provider_runs' in state, false)
  assert.equal('error_message' in state, false)
  assert.throws(() => parsePreviewJobState({ status: 'failed', phase: 'unknown' }), /status|phase/)
})
