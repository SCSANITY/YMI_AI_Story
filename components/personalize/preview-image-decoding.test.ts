import assert from 'node:assert/strict'
import test from 'node:test'
import { decodePreviewImage, decodePreviewImageRenewal } from './useDecodedPreviewCover'

async function withImages(run: (requests: string[]) => Promise<void>) {
  const imageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Image')
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const requests: string[] = []
  class TestImage {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    decoding = ''
    url = ''
    set src(url: string) {
      this.url = url
      requests.push(url)
      if (url === 'timeout') return
      queueMicrotask(() => url === 'bad' ? this.onerror?.() : this.onload?.())
    }
    decode() { return this.url === 'undecodable' ? Promise.reject(new Error('decode')) : Promise.resolve() }
  }
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: TestImage })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { setTimeout, clearTimeout } })
  try { await run(requests) }
  finally {
    if (imageDescriptor) Object.defineProperty(globalThis, 'Image', imageDescriptor)
    else Reflect.deleteProperty(globalThis, 'Image')
    if (windowDescriptor) Object.defineProperty(globalThis, 'window', windowDescriptor)
    else Reflect.deleteProperty(globalThis, 'window')
  }
}

test('image readiness requires successful load and decode', () => withImages(async () => {
  await decodePreviewImage('good')
  await assert.rejects(decodePreviewImage('bad'), /failed to load/)
  await assert.rejects(decodePreviewImage('undecodable'), /could not be decoded/)
}))

test('whole-snapshot recovery deduplicates URLs and refuses an invalid interior', () => withImages(async (requests) => {
  await decodePreviewImageRenewal(['cover', 'left', 'right', 'cover'])
  assert.deepEqual(requests, ['cover', 'left', 'right'])
  let committed = false
  await assert.rejects(decodePreviewImageRenewal(['cover', 'bad']).then(() => { committed = true }), /failed to load/)
  assert.equal(committed, false)
}))

test('offscreen image preparation has a bounded timeout', () => withImages(async () => {
  await assert.rejects(decodePreviewImage('timeout', 5), /timed out/)
}))
