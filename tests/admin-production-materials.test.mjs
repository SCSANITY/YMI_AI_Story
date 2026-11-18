import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import vm from 'node:vm'

const { outputFiles } = await build({
  entryPoints: ['app/api/admin/final-jobs/[finalJobId]/materials/route.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  external: [
    'server-only',
    'next/server',
    '@/lib/supabaseAdmin',
    '@/lib/adminAuth',
    '@/lib/order-materials-server',
  ],
})
const id = (n) => '11111111-1111-4111-8111-' + String(n).padStart(12, '0')
const owner = id(1),
  order = id(2)
const stamp = '2026-11-18T06:30:00Z'
const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 81])
function harness() {
  const rows = {
    orders: [{ order_id: order, customer_id: owner }],
    customers: [{ customer_id: owner, display_name: 'Purchaser', is_guest: false }],
    final_jobs: [],
    jobs: [],
    cart_items: [],
    user_assets: [],
    creations: [],
    order_dedication_revisions: [],
  }
  const objects = new Map(),
    dedications = []
  let admin = true,
    reads = 0
  function book(n) {
    const item = id(n),
      creation = id(n + 1),
      job = id(n + 2),
      review = id(n + 3),
      preview = id(n + 4)
    const source = 'user-assets/anon/old-location/' + n + '.jpg'
    const stem = 'jobs/2026/11/18/' + preview + '/attempt_001/output/page_00'
    const page = {
      page_index: 0,
      preview_order: 0,
      role: 'preview_cover',
      storage_path: stem + '.webp',
      storage_path_full: stem + '_full.png',
    }
    const snapshot = {
      face_source_path: 'raw-private/' + source,
      text_overrides: { child_name: 'Child ' + n, child_age: 6 },
    }
    const owned = {
      owner_type: 'customer',
      customer_id: owner,
      creation_id: creation,
      template_id: 'story',
      story_language: 'English',
    }
    rows.final_jobs.push({
      final_job_id: review,
      job_id: job,
      order_id: order,
      cart_item_id: item,
      creation_id: creation,
      template_id: 'story',
    })
    rows.cart_items.push({
      ...owned,
      cart_item_id: item,
      order_id: order,
      status: 'ordered',
      final_job_id: job,
    })
    rows.creations.push({ ...owned, preview_job_id: preview })
    rows.jobs.push(
      {
        ...owned,
        job_id: job,
        job_type: 'final',
        cart_item_id: item,
        input_snapshot: snapshot,
        created_at: stamp,
      },
      {
        ...owned,
        job_id: preview,
        job_type: 'preview',
        status: 'done',
        input_snapshot: snapshot,
        created_at: stamp,
        output_assets: { bucket: 'raw-private', pages: [page] },
      }
    )
    rows.user_assets.push({
      asset_id: id(n + 5),
      owner_type: 'customer',
      customer_id: owner,
      asset_type: 'face_image',
      storage_path: source,
    })
    rows.order_dedication_revisions.push({ cart_item_id: item, revision: 3, created_at: stamp })
    dedications.push({ cartItemId: item, creationId: creation, revision: 3, body: 'For ' + n + '\nLove' })
    objects.set(source, { mime: 'image/jpeg', bytes: Uint8Array.of(n) })
    objects.set(page.storage_path, { mime: 'image/webp', bytes: Uint8Array.of(n) })
    objects.set(page.storage_path_full, { mime: 'image/png', bytes: Uint8Array.from([...png, n]) })
    return { item, review, preview, page, source }
  }
  const a = book(10),
    b = book(30)
  const db = {
    from(table) {
      reads++
      let result = rows[table].slice()
      return {
        select() {
          return this
        },
        eq(key, value) {
          result = result.filter(
            (row) => (key.includes('->>') ? row.input_snapshot?.[key.split('->>')[1]] : row[key]) === value
          )
          return this
        },
        lte(key, v) {
          result = result.filter((row) => row[key] <= v)
          return this
        },
        limit(n) {
          return { data: result.slice(0, n) }
        },
        maybeSingle() {
          return { data: result.length === 1 ? result[0] : null }
        },
      }
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, 'raw-private')
        return {
          info: async (path) => ({
            data: objects.has(path) ? { contentType: objects.get(path).mime } : null,
          }),
          createSignedUrl: async (path) => ({
            data: objects.has(path) ? { signedUrl: 'https://private.invalid/' + path } : null,
          }),
        }
      },
    },
  }
  const routeModule = { exports: {} }
  const modules = {
    'server-only': {},
    'next/server': { NextResponse: Response },
    '@/lib/supabaseAdmin': { supabaseAdmin: db },
    '@/lib/adminAuth': { requireAdminCustomer: async () => (admin ? { customer_id: id(100) } : null) },
    '@/lib/order-materials-server': { loadTrustedOrderLineDedications: async () => dedications },
  }
  vm.runInNewContext(outputFiles[0].text, {
    module: routeModule,
    exports: routeModule.exports,
    require: (key) => {
      assert.ok(modules[key], key)
      return modules[key]
    },
    URL,
    Request,
    Response,
    Headers,
    Uint8Array,
    ReadableStream,
    fetch: async (url, init) => {
      const object = objects.get(new URL(url).pathname.slice(1))
      assert.ok(object)
      const range = Boolean(init.headers?.Range)
      return new Response(range ? object.bytes.slice(0, 8) : object.bytes, {
        status: range ? 206 : 200,
        headers: { 'content-type': object.mime, 'content-range': 'bytes 0-7/' + object.bytes.length },
      })
    },
  })
  const get = (book, query = '') =>
    routeModule.exports.GET(new Request('http://localhost/materials?' + query), {
      params: Promise.resolve({ finalJobId: book.review }),
    })
  return {
    a,
    b,
    rows,
    objects,
    get,
    deny() {
      admin = false
    },
    reads: () => reads,
  }
}

test('Each purchased line receives its own facts, source, preview bytes and dedication revision', async () => {
  const h = harness()
  for (const [i, book] of [
    [10, h.a],
    [30, h.b],
  ]) {
    const summary = await (await h.get(book)).json()
    assert.equal(summary.dedication.body, 'For ' + i + '\nLove')
    assert.equal(summary.dedication.updatedAt, stamp)
    assert.equal(summary.child, 'Child ' + i)
    assert.equal(summary.age, '6')
    assert.equal(summary.purchaser, 'Purchaser')
    assert.deepEqual(summary.pages, [{ index: 0, label: 'Cover', pngAvailable: true }])
    assert.doesNotMatch(JSON.stringify(summary), /user-assets|raw-private|attempt_001/)
    const file = await h.get(book, 'kind=png&preview=' + book.preview + '&page=0')
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), Uint8Array.from([...png, i]))
    assert.match(file.headers.get('cache-control'), /no-store/)
    assert.deepEqual(
      new Uint8Array(await (await h.get(book, 'kind=source-download')).arrayBuffer()),
      Uint8Array.of(i)
    )
  }
  assert.equal((await h.get(h.a, 'order=' + order + '&item=' + h.b.item)).status, 409)
  assert.equal((await h.get(h.a, 'kind=png&preview=' + h.b.preview + '&page=0')).status, 409)
})

test('A newer variant cannot replace the corroborated Preview or its source', async () => {
  const h = harness()
  const old = h.rows.jobs[1]
  const later = { ...old, job_id: id(71), created_at: '2026-11-19T00:00:00Z' }
  h.rows.jobs.push(later)
  assert.equal((await (await h.get(h.a)).json()).previewId, old.job_id)
  h.rows.creations[0].preview_job_id = later.job_id
  const changed = await (await h.get(h.a)).json()
  assert.equal(changed.previewId, null)
  assert.equal(changed.sourceAvailable, true)
  assert.equal(changed.dedication.revision, 3)
})

test('A different revision timestamp is never substituted for the current dedication', async () => {
  const h = harness()
  h.rows.order_dedication_revisions[0].revision = 2
  const result = await (await h.get(h.a, 'kind=dedication')).json()
  assert.equal(result.dedication.updatedAt, null)
  assert.equal(result.dedication.revision, 3)
})

test('Reused Finals, invalid selectors and changed ownership do not leak materials', async () => {
  const h = harness()
  const sibling = { ...h.rows.cart_items[0], cart_item_id: id(99) }
  h.rows.cart_items.push(sibling)
  assert.equal((await h.get(h.a)).status, 409)
  assert.equal((await h.get(h.a, 'order=' + order + '&item=' + sibling.cart_item_id)).status, 409)
  assert.equal((await h.get(h.a, 'order=' + order)).status, 400)
  h.rows.user_assets[0].customer_id = id(99)
  assert.equal((await h.get(h.a, 'kind=source&order=' + order + '&item=' + h.a.item)).status, 409)
  h.deny()
  const before = h.reads()
  assert.equal((await h.get(h.b)).status, 403)
  assert.equal(h.reads(), before)
})

test('Shared faces, ambiguous versions, or a mutable pointer alone never enable preview actions', async () => {
  const h = harness(),
    original = h.rows.jobs[1]
  h.rows.jobs.push({ ...original, job_id: id(99) })
  let result = await (await h.get(h.a)).json()
  assert.deepEqual(result.pages, [])
  assert.equal(result.sourceAvailable, true)
  assert.equal((await h.get(h.a, 'kind=png&preview=' + h.a.preview + '&page=0')).status, 409)
  h.rows.jobs.pop()
  h.rows.creations[0].preview_job_id = h.b.preview
  result = await (await h.get(h.a)).json()
  assert.deepEqual(result.pages, [])
})

test('Missing, mislabeled, wrong-page and cross-attempt originals retain the verified WebP only', async () => {
  const h = harness(),
    page = h.a.page,
    original = page.storage_path_full
  for (const path of [
    original.replace('attempt_001', 'attempt_002'),
    original.replace('page_00', 'page_01'),
    original.replace('.png', '.webp'),
  ]) {
    page.storage_path_full = path
    assert.equal((await (await h.get(h.a)).json()).pages[0].pngAvailable, false)
    assert.equal((await h.get(h.a, 'kind=png&preview=' + h.a.preview + '&page=0')).status, 409)
  }
  page.storage_path_full = original
  h.objects.get(original).bytes = new Uint8Array(9)
  assert.equal((await (await h.get(h.a)).json()).pages[0].pngAvailable, false)
  assert.equal((await h.get(h.a, 'kind=png&preview=' + h.a.preview + '&page=0')).status, 409)
  h.objects.delete(original)
  assert.equal((await (await h.get(h.a)).json()).pages[0].pngAvailable, false)
})
