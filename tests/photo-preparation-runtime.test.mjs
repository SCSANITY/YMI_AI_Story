import assert from 'node:assert/strict'
import test from 'node:test'
import { require as loadTs } from 'tsx/cjs/api'

const [controller, policy, decoder, storage] = ['controller', 'policy', 'decode', 'saved-photo']
  .map(name => loadTs(`../src/lib/photo-preparation/${name}.ts`, import.meta.url))
const { createPhotoPreparation } = controller
const { checkFeatureVisibility, hasSignificantSecondFace, PREPARED_MAX_BYTES } = policy
const { decodePhoto } = decoder
const file = (name, body = 'input', type = 'image/png') => new File([body], name, { type })
const crop = (body = 'cropped') => file('crop.jpg', body, 'image/jpeg')
const intent = (name, scope = 'book:owner', surface = 'form') => ({ scope, surface, source: { kind: 'file', file: file(name) } })
const flush = () => new Promise(resolve => setImmediate(resolve))
const regions = () => ['image-left-eye', 'image-right-eye', 'nose', 'mouth'].map(key => ({
  key, visibleCoverage: 0.8, samples: 40, originalSupport: 1, inputSupport: 1, evidence: 'measurement-only',
}))

test('each facial region must meet the inclusive candidate value and be measurable on the source', () => {
  assert.equal(checkFeatureVisibility(regions()), null)
  for (let i = 0; i < 4; i++) {
    const covered = regions()
    covered[i].visibleCoverage = 0.799
    assert.equal(checkFeatureVisibility(covered), 'covered-features')
  }
  const clipped = regions()
  clipped[3].evidence = 'original-region-outside-image'
  assert.equal(checkFeatureVisibility(clipped), 'incomplete-face')
  const invalid = regions()
  invalid[1].visibleCoverage = NaN
  assert.equal(checkFeatureVisibility(invalid), 'unmeasurable-face')
  assert.equal(checkFeatureVisibility(regions().slice(1)), 'unmeasurable-face')
  assert.equal(checkFeatureVisibility([...regions(), regions()[0]]), 'unmeasurable-face')
})

test('the second-face gate rejects a significant second face, not a lone small face', () => {
  const face = { score: 0.9, width: 20, height: 20 }
  assert.equal(hasSignificantSecondFace([face], 100_000), false)
  assert.equal(hasSignificantSecondFace([face, { ...face, width: 60, height: 60 }], 100_000), true)
  assert.equal(hasSignificantSecondFace([face, face], 100_000), false)
})

test('decoded HEIC follows normal preparation; failed HEIC decode never yields uploadable bytes', async () => {
  const heic = file('photo.bin', Uint8Array.from([0, 0, 0, 20, 102, 116, 121, 112, 104, 101, 105, 99, 0, 0, 0, 0, 109, 105, 102, 49]), '')
  const bitmap = { width: 64, height: 64, close() {} }
  const jpeg = crop()
  let decodeWorks = true
  const prepare = createPhotoPreparation({
    warmup() {}, dispose() {},
    async inspect(source) {
      const decoded = await decodePhoto(source, async () => {
        if (!decodeWorks) throw new Error('decoder cannot open this file')
        return bitmap
      })
      return 'reason' in decoded ? decoded : { file: jpeg }
    },
  })
  const next = { ...intent('ignored'), source: { kind: 'file', file: heic } }
  assert.equal((await prepare.select(next)).file, jpeg)
  decodeWorks = false
  assert.equal(await prepare.select(next), null)
  assert.equal(prepare.snapshot().reason, 'heic-undecodable')
  assert.equal(prepare.snapshot().status, 'failed')
  assert.deepEqual(await decodePhoto(file('fake.heic'), async () => { throw new Error() }), { reason: 'unreadable' })
})

test('rapid photo changes retain only the latest queued source and reject late phases and receipts', async () => {
  const inspected = []
  const prepare = createPhotoPreparation({
    warmup() {}, dispose() {},
    inspect(input, phase) { return new Promise(resolve => inspected.push({ input, phase, resolve })) },
  })
  const a = prepare.select(intent('a'))
  const b = prepare.select(intent('b'))
  const c = prepare.select(intent('c'))
  assert.deepEqual(inspected.map(call => call.input.name), ['a'])
  assert.deepEqual(await Promise.all([a, b]), [null, null])
  inspected[0].phase('preparing')
  assert.equal(prepare.snapshot().status, 'loading')
  inspected[0].resolve({ file: crop() })
  await flush()
  assert.deepEqual(inspected.map(call => call.input.name), ['a', 'c'])
  const jpeg = crop()
  inspected[1].resolve({ file: jpeg })
  const receipt = await c
  assert.equal(receipt.file, jpeg)
  assert.equal(prepare.isCurrent(receipt), true)
  assert.equal(prepare.isCurrent({ ...receipt, intent: { ...receipt.intent, scope: 'another-owner' } }), false)
  assert.equal(prepare.isCurrent({ ...receipt, intent: { ...receipt.intent, surface: 'variant' } }), false)
  prepare.clear()
  assert.equal(prepare.isCurrent(receipt), false)
  assert.equal(prepare.snapshot().status, 'idle')
})

test('clear aborts a saved photo read and an unmounted worker cannot publish a receipt', async () => {
  let savedSignal, finishSaved, finishWorker
  const prepare = createPhotoPreparation({
    warmup() {}, dispose() {},
    inspect() { return new Promise(resolve => { finishWorker = resolve }) },
  })
  const read = prepare.select({ ...intent('saved'), source: {
    kind: 'saved', assetId: 'saved-fixture',
    load(signal) { savedSignal = signal; return new Promise(resolve => { finishSaved = resolve }) },
  } })
  prepare.clear()
  assert.equal(savedSignal.aborted, true)
  assert.equal(await read, null)
  finishSaved(file('late'))
  await flush()
  assert.equal(finishWorker, undefined)
  const next = prepare.select(intent('new', 'book:new-owner'))
  prepare.dispose()
  finishWorker({ file: crop() })
  assert.equal(await next, null)
  assert.equal(prepare.snapshot().status, 'idle')
})

test('invalid or oversized output never becomes a receipt, even after the engine reports success', async () => {
  for (const output of [file('original.png'), crop(''), crop(new Uint8Array(PREPARED_MAX_BYTES + 1))]) {
    const prepare = createPhotoPreparation({ warmup() {}, dispose() {}, async inspect() { return { file: output } } })
    assert.equal(await prepare.select(intent('selected')), null)
    assert.equal(prepare.snapshot().reason, 'technical')
  }
})

test('saved-photo loading refreshes an expired URL once and returns the newly read bytes', async t => {
  const seen = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    seen.push([url, options.credentials, options.cache, options.referrerPolicy])
    return url === 'expired' ? new Response('', { status: 403 })
      : new Response('refreshed', { headers: { 'content-type': 'image/png' } })
  })
  const signal = new AbortController().signal
  const result = await storage.loadSavedPhoto('expired', async actual => {
    assert.equal(actual, signal)
    return 'fresh'
  }, signal)
  assert.equal(await result.text(), 'refreshed')
  assert.deepEqual(seen, [['expired', 'omit', 'no-store', 'no-referrer'], ['fresh', 'omit', 'no-store', 'no-referrer']])
})
