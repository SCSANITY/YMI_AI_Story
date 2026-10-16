import assert from 'node:assert/strict'
import test from 'node:test'
import { getPreviewCoverState } from './preview-cover-state'

const initial = { ready: false, access: 'resolving' as const, phase: 'pending' as const, locallyStarted: true, hasError: false }

test('a fresh job stays generating across identity, polling and cover decoding, until pixels are ready', () => {
  assert.equal(getPreviewCoverState(initial), 'generating')
  assert.equal(getPreviewCoverState({ ...initial, access: 'available' }), 'generating')
  assert.equal(getPreviewCoverState({ ...initial, access: 'available', phase: 'complete' }), 'generating')
  assert.equal(getPreviewCoverState({ ...initial, ready: true, phase: 'complete' }), 'ready')
})

test('returning to a running job waits, while recovering an existing result restores', () => {
  const restored = { ...initial, locallyStarted: false }
  assert.equal(getPreviewCoverState(restored), 'restoring')
  assert.equal(getPreviewCoverState({ ...restored, access: 'available' }), 'generating')
  assert.equal(getPreviewCoverState({ ...restored, access: 'available', phase: 'complete' }), 'restoring')
  assert.equal(getPreviewCoverState({ ...restored, ready: true }), 'ready')
})

test('unavailable access and real failures never fall through to recovery copy', () => {
  assert.equal(getPreviewCoverState({ ...initial, access: 'unavailable' }), 'unavailable')
  assert.equal(getPreviewCoverState({ ...initial, hasError: true, phase: 'failed' }), 'error')
  assert.equal(getPreviewCoverState({ ...initial, locallyStarted: false, hasError: true }), 'error')
})
