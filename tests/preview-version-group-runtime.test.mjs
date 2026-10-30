import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const root = uuid(1), child = uuid(2), rootJob = uuid(11), childJob = uuid(12)
function load(file, stubs = {}, globals = {}) {
  const mod = { exports: {} }
  vm.runInNewContext(ts.transpileModule(read(file), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, {
    module: mod, exports: mod.exports, Request, Response, AbortController, ...globals,
    require(name) {
      if (name in stubs) return stubs[name]
      if (name.startsWith('@/lib/')) return load(`src/lib/${name.slice(6)}.ts`, stubs, globals)
      return {}
    },
  })
  return mod.exports
}
const core = load('src/lib/preview-version-group.ts')
const rows = [
  { root_creation_id: root, creation_id: root, job_id: rootJob, is_original: true },
  { root_creation_id: root, creation_id: child, job_id: childJob, is_original: false },
]
const plain = value => JSON.parse(JSON.stringify(value))

test('restoration selects the URL Creation/Job, with server group count and no client quota input', () => {
  const group = core.buildPreviewVersionGroup(rows, child)
  assert.equal(group.groupId, root)
  assert.equal(group.selectedCreationId, child)
  assert.equal(group.selectedJobId, childJob)
  assert.equal(group.changeCount, 1)
  assert.equal(group.changeCap, 3)
  assert.equal(group.remainingCount, 2)
  assert.throws(() => core.buildPreviewVersionGroup(rows, uuid(99)))
})

test('a legacy group over the cap remains readable in full and has zero remaining changes', () => {
  const legacy = [...rows, ...[3, 4, 5, 6].map(n => ({ root_creation_id: root, creation_id: uuid(n), job_id: uuid(n + 10), is_original: false }))]
  const group = core.buildPreviewVersionGroup(legacy, child)
  assert.equal(group.versions.length, 6)
  assert.equal(group.changeCount, 5)
  assert.equal(group.remainingCount, 0)
  assert.throws(() => core.buildPreviewVersionGroup([...rows, rows[1]], child))
})

function routeHarness(kind = 'customer', foreign = false) {
  const calls = []
  const owner = kind === 'customer' ? { ownerType: 'customer', customerId: uuid(30) } : { ownerType: 'anon', anonSessionId: uuid(31) }
  const filters = []
  const query = {
    select() { return this }, eq(column, value) { filters.push([column, value]); return this },
    maybeSingle: async () => ({ data: foreign ? null : { creation_id: child }, error: null }),
  }
  const route = load('app/api/creations/[creationId]/preview-versions/route.ts', {
    'node:async_hooks': { AsyncLocalStorage },
    'node:crypto': { randomUUID },
    '@/lib/http-response': { noStoreJson: (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Cache-Control': 'no-store' } }) },
    '@/lib/checkout-owner': {
      resolveCheckoutOwner: async (request, options) => { calls.push(['owner', options]); return owner },
      ownerFilter: () => ({ owner_type: kind, column: kind === 'customer' ? 'customer_id' : 'anon_session_id', value: kind === 'customer' ? owner.customerId : owner.anonSessionId }),
    },
    '@/lib/supabaseAdmin': { supabaseAdmin: {
      from(table) { assert.equal(table, 'creations'); return query },
      rpc: async (name, args) => { calls.push([name, args]); return { data: rows, error: null } },
    } },
    '@/lib/preview-version-photos-server': {
      readVisiblePreviewVersionIds: async () => new Set([root, child]),
      readPreviewVersionPhotos: async () => new Map([[child, { photoUrl: 'https://signed.test/photo', faceAssetId: uuid(40) }]]),
    },
  })
  return { route, calls, filters }
}

for (const kind of ['customer', 'anon']) test(`GET restores ${kind} group and denies cross-owner before the RPC`, async () => {
  const h = routeHarness(kind)
  const response = await h.route.GET(new Request('https://local.test/preview-versions'), { params: Promise.resolve({ creationId: child }) })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('cache-control'), /no-store/)
  const dto = await response.json()
  assert.equal(dto.selectedJobId, childJob)
  assert.equal(dto.versions[1].photoUrl, 'https://signed.test/photo')
  assert.equal(dto.versions[1].faceAssetId, uuid(40))
  assert.doesNotMatch(JSON.stringify(dto), /storage_path|customize_snapshot|storagePath/)
  assert.equal(h.calls[1][0], 'read_preview_version_group')
  assert.deepEqual(plain(h.calls[0][1]), { allowAnon: true, createAnonIfMissing: false })
  assert.ok(h.filters.some(([column]) => column === (kind === 'customer' ? 'customer_id' : 'anon_session_id')))
  const denied = routeHarness(kind, true)
  assert.equal((await denied.route.GET(new Request('https://local.test/preview-versions'), { params: Promise.resolve({ creationId: child }) })).status, 404)
  assert.equal(denied.calls.length, 1)
})

test('reload reader uses GET only and preserves all existing identities without a generation request', async () => {
  const requests = []
  const group = core.buildPreviewVersionGroup(rows, child)
  const service = load('src/services/preview-version-group.ts', {
    '@/services/jobs': { getPreviewJobState: async jobId => { requests.push({ method: 'GET', jobId }); return { status: 'done', assets: { coverUrl: 'signed-' + jobId } } } },
    '@/lib/preview-book-presentation': { resolvePreviewDisplayAssets: assets => ({ ...assets, urls: [assets.coverUrl], presentation: null }) },
  }, { fetch: async (url, options) => { requests.push({ url, method: options.method }); return new Response(JSON.stringify(group)) } })
  const restored = await service.restorePreviewVersionGroup(child, new AbortController().signal)
  assert.equal(restored.selectedCreationId, child)
  assert.equal(restored.selectedJobId, childJob)
  assert.deepEqual(plain(restored.versions.map(v => v.creationId)), [root, child])
  assert.equal(restored.versions[1].coverUrl, 'signed-' + childJob)
  assert.equal(restored.versions[0].original, true)
  assert.ok(requests.every(request => request.method === 'GET'))
})

test('restore merge retains a newer live cover and never mislabels a child as original', () => {
  const merged = core.mergeRestoredPreviewVersions([{ jobId: childJob, coverUrl: 'new-cover', original: true }], [{ creationId: child, jobId: childJob, coverUrl: 'old-cover', original: false }])
  assert.equal(merged[0].coverUrl, 'new-cover')
  assert.equal(merged[0].creationId, child)
  assert.equal(merged[0].original, false)
  assert.equal(merged[0].countsTowardLimit, true)
})

test('restoration hook closes the loading window and ignores stale completion after identity changes', async () => {
  const pending = [], states = [], effects = []; let cursor = 0
  const hook = load('components/personalize/usePreviewVersionGroup.ts', {
    react: {
      useState(initial) { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], value => { states[index] = value }] },
      useEffect(callback) { effects.push(callback) },
    },
    '@/services/preview-version-group': { restorePreviewVersionGroup: (creationId, signal) => new Promise(resolve => pending.push({ creationId, signal, resolve })) },
  }).usePreviewVersionGroup
  const render = (c, j) => { cursor = 0; return hook(c, j, 'customer', true) }
  assert.equal(render(root, rootJob).ready, false)
  const cleanup = effects.shift()()
  cleanup()
  assert.equal(render(child, childJob).ready, false)
  const cleanupChild = effects.shift()()
  pending[0].resolve(core.buildPreviewVersionGroup(rows, root))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(render(child, childJob).ready, false)
  effects.length = 0
  pending[1].resolve(core.buildPreviewVersionGroup(rows, child))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(render(child, childJob).ready, true)
  cleanupChild()
  assert.equal(render(child, childJob).ready, false)
  assert.equal(render(root, rootJob).ready, false)
  const page = read('components/PersonalizePage.tsx')
  assert.match(page, /disabled=\{[^}]*!restoredPreviewGroup.ready/)
  assert.match(page, /previewVariantGenerationRef.current\s*\|\| !restoredPreviewGroup.ready/)
})
