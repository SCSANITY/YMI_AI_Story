import assert from 'node:assert/strict'
import test from 'node:test'
import { loadUi } from './helpers/preview-uiux-harness.mjs'

function makeStorageMock({ batchBehavior = 'ok', perPathFailures = new Set() } = {}) {
  const calls = { createSignedUrl: [], createSignedUrls: [] }
  const supabaseAdmin = {
    storage: {
      from(bucket) {
        return {
          async createSignedUrl(path, expiresIn) {
            calls.createSignedUrl.push({ bucket, path, expiresIn })
            if (perPathFailures.has(path)) return { data: null, error: new Error('sign failed') }
            return { data: { signedUrl: `https://signed.test/${bucket}/${path}?single` }, error: null }
          },
          async createSignedUrls(paths, expiresIn) {
            calls.createSignedUrls.push({ bucket, paths, expiresIn })
            if (batchBehavior === 'throw') throw new Error('batch unavailable')
            if (batchBehavior === 'error') return { data: null, error: new Error('batch unavailable') }
            if (batchBehavior === 'short') return { data: [], error: null }
            if (batchBehavior === 'shuffled') {
              return {
                data: paths.map((path) => ({
                  error: null,
                  path: `tampered/${path}`,
                  signedUrl: `https://signed.test/${bucket}/${path}?batch`,
                })),
                error: null,
              }
            }
            return {
              data: paths.map((path) => ({
                error: perPathFailures.has(path) ? new Error('missing object') : null,
                path,
                signedUrl: perPathFailures.has(path) ? null : `https://signed.test/${bucket}/${path}?batch`,
              })),
              error: null,
            }
          },
        }
      },
    },
  }
  return { calls, supabaseAdmin }
}

function loadSigning(supabaseAdmin) {
  return loadUi('src/lib/storage-signing.ts', {
    '@/lib/supabaseAdmin': { supabaseAdmin },
    '@/lib/storage-signing-policy': {
      assertSignableStorageBucket: (bucket) => {
        if (bucket !== 'raw-private') throw new Error('bucket not signable')
        return bucket
      },
      STORAGE_BUCKET_NOT_SIGNABLE_CODE: 'storage_bucket_not_signable',
    },
  })
}

test('S-C2: multi-path group signs with one batched storage call', async () => {
  const { calls, supabaseAdmin } = makeStorageMock()
  const { createSignedStorageUrlMap } = loadSigning(supabaseAdmin)

  const result = await createSignedStorageUrlMap([
    { key: 'a', bucket: 'raw-private', path: 'p/a.png', expiresIn: 600 },
    { key: 'b', bucket: 'raw-private', path: 'p/b.png', expiresIn: 600 },
    { key: 'c', bucket: 'raw-private', path: 'p/c.png', expiresIn: 600 },
  ])

  assert.equal(calls.createSignedUrls.length, 1)
  assert.equal(JSON.stringify(calls.createSignedUrls[0].paths), JSON.stringify(['p/a.png', 'p/b.png', 'p/c.png']))
  assert.equal(calls.createSignedUrl.length, 0)
  assert.equal(result.get('a'), 'https://signed.test/raw-private/p/a.png?batch')
  assert.equal(result.get('b'), 'https://signed.test/raw-private/p/b.png?batch')
  assert.equal(result.get('c'), 'https://signed.test/raw-private/p/c.png?batch')
})

test('S-C2: distinct expiresIn values stay in separate batched groups', async () => {
  const { calls, supabaseAdmin } = makeStorageMock()
  const { createSignedStorageUrlMap } = loadSigning(supabaseAdmin)

  const result = await createSignedStorageUrlMap([
    { key: 'cover', bucket: 'raw-private', path: 'p/cover.png', expiresIn: 600 },
    { key: 'page', bucket: 'raw-private', path: 'p/page.png', expiresIn: 3600 },
  ])

  assert.equal(calls.createSignedUrls.length, 0)
  assert.equal(calls.createSignedUrl.length, 2)
  assert.equal(result.get('cover'), 'https://signed.test/raw-private/p/cover.png?single')
  assert.equal(result.get('page'), 'https://signed.test/raw-private/p/page.png?single')
})

test('S-C2: batch-level failure falls back to per-path signing', async () => {
  for (const batchBehavior of ['throw', 'error', 'short', 'shuffled']) {
    const { calls, supabaseAdmin } = makeStorageMock({ batchBehavior })
    const { createSignedStorageUrlMap } = loadSigning(supabaseAdmin)

    const result = await createSignedStorageUrlMap([
      { key: 'a', bucket: 'raw-private', path: 'p/a.png', expiresIn: 600 },
      { key: 'b', bucket: 'raw-private', path: 'p/b.png', expiresIn: 600 },
    ])

    assert.equal(calls.createSignedUrls.length, 1, batchBehavior)
    assert.equal(calls.createSignedUrl.length, 2, batchBehavior)
    assert.equal(result.get('a'), 'https://signed.test/raw-private/p/a.png?single', batchBehavior)
    assert.equal(result.get('b'), 'https://signed.test/raw-private/p/b.png?single', batchBehavior)
  }
})

test('S-C2: per-item batch failure drops only that key without retry', async () => {
  const { calls, supabaseAdmin } = makeStorageMock({ perPathFailures: new Set(['p/b.png']) })
  const { createSignedStorageUrlMap } = loadSigning(supabaseAdmin)

  const result = await createSignedStorageUrlMap([
    { key: 'a', bucket: 'raw-private', path: 'p/a.png', expiresIn: 600 },
    { key: 'b', bucket: 'raw-private', path: 'p/b.png', expiresIn: 600 },
  ])

  assert.equal(calls.createSignedUrls.length, 1)
  assert.equal(calls.createSignedUrl.length, 0)
  assert.equal(result.get('a'), 'https://signed.test/raw-private/p/a.png?batch')
  assert.equal(result.has('b'), false)
})

test('S-C2: non-signable bucket still rejects before any storage call', async () => {
  const { calls, supabaseAdmin } = makeStorageMock()
  const { createSignedStorageUrlMap } = loadSigning(supabaseAdmin)

  await assert.rejects(() =>
    createSignedStorageUrlMap([{ key: 'x', bucket: 'public-assets', path: 'p/x.png', expiresIn: 600 }])
  )
  assert.equal(calls.createSignedUrls.length, 0)
  assert.equal(calls.createSignedUrl.length, 0)
})
