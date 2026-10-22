import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

function harness({ rows, pages = [{ page_index: 0, storage_path: 'synthetic/cover.webp' }], signedUrl = 'https://example.test/cover.webp' }) {
  const calls = []
  const supabaseAdmin = {
    from(table) {
      const query = { then(resolve, reject) {
        const data = table === 'cart_items' ? rows : { output_assets: { bucket: 'raw-private', pages } }
        return Promise.resolve({ data, error: null }).then(resolve, reject)
      } }
      for (const method of ['select', 'eq', 'maybeSingle']) {
        query[method] = (...args) => { calls.push([table, method, ...args]); return query }
      }
      return query
    },
    storage: { from(bucket) { return { createSignedUrl: async (path, ttl) => {
      calls.push(['sign', bucket, path, ttl])
      return { data: signedUrl ? { signedUrl } : null }
    } } } },
  }
  const cache = new Map()
  function load(file) {
    if (cache.has(file)) return cache.get(file)
    const fixtureModule = { exports: {} }
    cache.set(file, fixtureModule.exports)
    vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../src/lib/' + file + '.ts', import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText, { module: fixtureModule, exports: fixtureModule.exports, require(name) {
      if (name === '@/lib/supabaseAdmin') return { supabaseAdmin }
      if (name === '@/lib/personalized-book-title') return load('personalized-book-title')
      if (name === '@/lib/storage-signing-policy') return { assertSignableStorageBucket: bucket => bucket }
      if (name.startsWith('@/lib/')) return {} // Other fulfillment paths are not executed.
      throw new Error('Unexpected dependency: ' + name)
    } })
    return fixtureModule.exports
  }
  return { api: load('orderFulfillment'), calls }
}

const creation = (name, job) => ({ creations: {
  template_id: 'Adventure_story', templates: { name: 'Forest Adventure' },
  customize_snapshot: { childName: name }, preview_job_id: job,
} })

test('confirmation cover title belongs to the displayed Creation even when receipt order differs', async () => {
  const h = harness({ rows: [creation('Alston', null), creation('Sonia', 'sonia-preview')] })
  const cover = await h.api.loadOrderCover('synthetic-order')
  assert.equal(cover.coverTitle, "Sonia's Forest Adventure")
  assert.equal(cover.coverImageUrl, 'https://example.test/cover.webp')
  assert.ok(h.calls.some(call => call[0] === 'jobs' && call[1] === 'eq' && call[2] === 'job_id' && call[3] === 'sonia-preview'))
  assert.deepEqual(h.calls.find(call => call[0] === 'sign'), ['sign', 'raw-private', 'synthetic/cover.webp', 31536000])
})

test('single-book cover uses the shared personalized title and logistics URL contract is retained', async () => {
  const h = harness({ rows: [creation('Alston', 'alston-preview')] })
  assert.equal((await h.api.loadOrderCover('synthetic-order')).coverTitle, "Alston's Forest Adventure")
  assert.equal(await h.api.loadOrderCoverUrl('synthetic-order'), 'https://example.test/cover.webp')
})

test('missing preview, output, or signed URL keeps the existing placeholder path', async () => {
  for (const fixture of [
    { rows: [creation('Alston', null)] },
    { rows: [creation('Alston', 'preview')], pages: [] },
    { rows: [creation('Alston', 'preview')], signedUrl: null },
  ]) {
    assert.equal(await harness(fixture).api.loadOrderCover('synthetic-order'), undefined)
  }
})
