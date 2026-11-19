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
function harness(beforeRange) {
  const rows = {
    orders: [{ order_id: order, customer_id: owner, shipping_address: { firstName: ' Mei ', lastName: ' Chan ' } }],
    customers: [{ customer_id: owner, display_name: 'account_alias', is_guest: false }],
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
        select(fields) {
          if (table === 'orders') {
            assert.equal(fields, 'customer_id,first_name:shipping_address->>firstName,last_name:shipping_address->>lastName')
            result = result.map(row => ({
              ...row,
              first_name: row.shipping_address?.firstName,
              last_name: row.shipping_address?.lastName,
            }))
          }
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
    TextEncoder,
    ReadableStream,
    fetch: async (url, init) => {
      const object = objects.get(new URL(url).pathname.slice(1))
      assert.ok(object)
      const range = Boolean(init.headers?.Range)
      if (range && beforeRange) await beforeRange
      return new Response(range ? object.bytes.slice(0, 8) : object.bytes, {
        status: range ? 206 : 200,
        headers: { 'content-type': object.mime, 'content-range': 'bytes 0-7/' + object.bytes.length },
      })
    },
  })
  const get = (book, query = '', headers) =>
    routeModule.exports.GET(new Request('http://localhost/materials?' + query, { headers }), {
      params: Promise.resolve({ finalJobId: book.review }),
    })
  return {
    a,
    b,
    rows,
    dedications,
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
    assert.equal(summary.purchaser, 'Mei Chan')
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

test('Purchaser follows each order’s checkout name, including guest orders and incomplete names', async () => {
  const h = harness()
  const second = { order_id: id(90), customer_id: owner, shipping_address: { firstName: 'Ana', lastName: 'de Souza' } }
  h.rows.orders.push(second)
  h.rows.final_jobs.find(row => row.final_job_id === h.b.review).order_id = second.order_id
  h.rows.cart_items.find(row => row.cart_item_id === h.b.item).order_id = second.order_id
  h.rows.customers[0].is_guest = true
  const name = async book => (await (await h.get(book)).json()).purchaser
  assert.equal(await name(h.a), 'Mei Chan')
  assert.equal(await name(h.b), 'Ana de Souza')
  second.shipping_address = { lastName: '林' }
  assert.equal(await name(h.b), '林')
  second.shipping_address = null
  assert.equal(await name(h.b), null)
})

test('A guest-origin source is available only after its stored ownership matches the purchaser', async () => {
  const h = harness()
  const asset = h.rows.user_assets[0]
  const summary = async () => (await h.get(h.a)).json()
  Object.assign(asset, { owner_type: 'anon', customer_id: null, anon_session_id: id(90) })
  assert.equal((await summary()).sourceAvailable, false)
  assert.equal((await h.get(h.a, 'kind=source-download')).status, 409)

  // The checkout claim updates ownership in place and leaves the original object key intact.
  Object.assign(asset, { owner_type: 'customer', customer_id: owner, anon_session_id: null })
  assert.equal(asset.storage_path, h.a.source)
  assert.equal((await summary()).sourceAvailable, true)
  for (const kind of ['source', 'source-download']) {
    const file = await h.get(h.a, 'kind=' + kind)
    assert.equal(file.status, 200)
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), Uint8Array.of(10))
  }
  asset.customer_id = id(91)
  assert.equal((await summary()).sourceAvailable, false)
  assert.equal((await h.get(h.a, 'kind=source')).status, 409)
})

test('Clearing a dedication returns the new empty revision only for the selected book', async () => {
  const h = harness()
  const clearedAt = '2026-11-19T08:00:00Z'
  Object.assign(h.dedications[0], { body: null, revision: 4 })
  h.rows.order_dedication_revisions.push({ cart_item_id: h.a.item, revision: 4, created_at: clearedAt })
  for (const query of ['', 'kind=dedication']) {
    const { dedication } = await (await h.get(h.a, query)).json()
    assert.deepEqual(dedication, { body: null, revision: 4, updatedAt: clearedAt })
  }
  const sibling = await (await h.get(h.b)).json()
  assert.equal(sibling.dedication.body, 'For 30\nLove')
  assert.equal(sibling.dedication.revision, 3)
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

test('The authorized panel delivers text and gallery before delayed PNG signature probes finish', async () => {
  const gate = Promise.withResolvers()
  const h = harness(gate.promise)
  const headers = { accept: 'application/x-ndjson' }
  const res = await h.get(h.a, '', headers)
  assert.match(res.headers.get('cache-control'), /private, no-store/)
  assert.match(res.headers.get('content-type'), /ndjson/)
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  const facts = {}
  try {
    // The simulated PNG read stays blocked until every other section has arrived.
    while (!facts.pages || !facts.dedication || !facts.purchaser || facts.sourceAvailable === undefined) {
      const { value, done } = await reader.read()
      assert.equal(done, false)
      Object.assign(facts, JSON.parse(value))
    }
    assert.equal(facts.lineId, h.a.item)
    assert.equal(facts.dedication.body, 'For 10\nLove')
    assert.deepEqual(facts.pages, [{ index: 0, label: 'Cover', pngAvailable: false }])
  } finally {
    gate.resolve()
  }
  const last = JSON.parse((await reader.read()).value)
  assert.deepEqual(last.pages, [{ index: 0, label: 'Cover', pngAvailable: true }])
  assert.equal((await reader.read()).done, true)
  assert.equal((await h.get(h.a, 'order=' + order + '&item=' + h.b.item, headers)).status, 409)
  h.deny()
  assert.equal((await h.get(h.a, '', headers)).status, 403)
})
