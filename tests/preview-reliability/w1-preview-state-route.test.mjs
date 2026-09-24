import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function transpile(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
}

const routeJs = transpile('../../app/api/jobs/[jobId]/preview-state/route.ts')

function loadRoute({ owner = { ownerType: 'customer' }, job }) {
  const calls = []
  const query = {
    select(columns) { calls.push({ kind: 'select', columns }); return this },
    eq(column, value) { calls.push({ kind: 'eq', column, value }); return this },
    async maybeSingle() { calls.push({ kind: 'maybeSingle' }); return { data: job, error: null } },
  }
  const supabaseAdmin = {
    from(table) { calls.push({ kind: 'from', table }); return query },
    storage: { from(bucket) { return { async createSignedUrl(path, ttl) {
      calls.push({ kind: 'sign', bucket, path, ttl })
      return { data: { signedUrl: `https://signed.example/${path}` }, error: null }
    } } } },
  }
  const dependencies = {
    '@/lib/preview-page-contract': {
      selectPreviewSignTargets: ({ pages }) => pages.map((page) => ({
        page,
        storagePath: page.storage_path,
        assetSize: 'small',
      })),
      buildSignedPreviewResponse: ({ targets, signedUrls }) => ({
        schema_version: 3,
        asset_layout: 'single-page',
        pages: targets.map((target, index) => ({
          ...target.page,
          storage_path: undefined,
          asset_size: 'small',
          url: signedUrls[index],
        })),
      }),
      parseSignedPreviewAssets: (value) => ({
        schemaVersion: 3,
        assetLayout: 'single-page',
        pages: value.pages,
        urls: value.pages.map((page) => page.url),
      }),
    },
    '@/lib/preview-book-presentation': {
      resolvePreviewDisplayAssets: (assets) => ({
        ...assets,
        coverUrl: assets.pages.find((page) => page.role === 'preview_cover')?.url ?? null,
        presentation: { cover: assets.pages.find((page) => page.role === 'preview_cover') ?? null },
      }),
      isPreviewDisplayComplete: (display) => display.pages.length >= 3,
    },
    '@/lib/preview-capacity': {
      resolvePreviewCapacityState: ({ status }) => status === 'queued' ? 'waiting' : 'normal',
    },
    '@/lib/preview-job-state': {
      resolvePreviewJobPhase: ({ status, hasCover, displayComplete }) => {
        if (status === 'failed') return hasCover ? 'partial_failed' : 'failed'
        if (status === 'cancel_requested' || status === 'cancelled') return 'cancelled'
        if (status === 'done' && displayComplete) return 'complete'
        return hasCover ? 'partial' : 'pending'
      },
    },
    '@/lib/http-response': {
      noStoreJson: (body, status = 200) => Response.json(body, {
        status,
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate' },
      }),
    },
    '@/lib/supabaseAdmin': { supabaseAdmin },
    '@/lib/checkout-owner': {
      resolveCheckoutOwner: async () => owner,
      checkoutOwnerErrorResponse: () => null,
      scopeCheckoutOwnerQuery: (value) => value,
    },
  }
  const loaded = { exports: {} }
  vm.runInNewContext(routeJs, {
    module: loaded,
    exports: loaded.exports,
    Response,
    Request,
    URL,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name]
      throw new Error(`Unmocked ${name}`)
    },
  }, { filename: 'app/api/jobs/[jobId]/preview-state/route.ts' })
  return { ...loaded.exports, calls }
}

const cover = {
  page_index: 0,
  output_order: 0,
  role: 'preview_cover',
  spread_index: 0,
  side: null,
  page_number: null,
  storage_path: 'preview/job/cover.webp',
}

test('failed old-Worker output returns the saved cover in one redacted owned read', async () => {
  const { GET, calls } = loadRoute({
    job: {
      job_id: 'job-1',
      job_type: 'preview',
      status: 'failed',
      progress: 30,
      provider_runs: { 0: { status: 'COMPLETED' } },
      output_assets: { bucket: 'private', schema_version: 3, asset_layout: 'single-page', pages: [cover] },
    },
  })
  const response = await GET(
    new Request('http://localhost/api/jobs/job-1/preview-state'),
    { params: Promise.resolve({ jobId: 'job-1' }) }
  )
  const body = await response.json()
  const serialized = JSON.stringify(body)

  assert.equal(response.status, 200)
  assert.match(response.headers.get('Cache-Control'), /no-store/)
  assert.equal(body.phase, 'partial_failed')
  assert.equal(body.assets.pages[0].url, 'https://signed.example/preview/job/cover.webp')
  assert.equal(calls.filter((call) => call.kind === 'from').length, 1)
  assert.equal(calls.filter((call) => call.kind === 'maybeSingle').length, 1)
  assert.equal(calls.filter((call) => call.kind === 'sign').length, 1)
  assert.doesNotMatch(serialized, /provider_runs|storage_path|error_message|input_snapshot/)
})

test('failed Preview without a page signs nothing and remains recoverable by identity', async () => {
  const { GET, calls } = loadRoute({
    job: {
      job_id: 'job-2', job_type: 'preview', status: 'failed', progress: 0,
      provider_runs: {}, output_assets: null,
    },
  })
  const response = await GET(
    new Request('http://localhost/api/jobs/job-2/preview-state'),
    { params: Promise.resolve({ jobId: 'job-2' }) }
  )
  const body = await response.json()
  assert.equal(body.phase, 'failed')
  assert.equal(body.assets, null)
  assert.equal(calls.filter((call) => call.kind === 'sign').length, 0)
})

test('Preview state remains owner-gated before database or Storage access', async () => {
  const { GET, calls } = loadRoute({ owner: null, job: null })
  const response = await GET(
    new Request('http://localhost/api/jobs/job-3/preview-state'),
    { params: Promise.resolve({ jobId: 'job-3' }) }
  )
  assert.equal(response.status, 401)
  assert.equal(calls.length, 0)
})
