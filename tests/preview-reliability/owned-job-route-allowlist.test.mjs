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

const routeJs = transpile('../../app/api/jobs/[jobId]/route.ts')

function loadRoute(job) {
  const query = {
    select() { return this },
    eq() { return this },
    async maybeSingle() { return { data: job, error: null } },
  }
  const dependencies = {
    'next/server': {
      NextResponse: {
        json: (body, init) => Response.json(body, init),
      },
    },
    '@/lib/supabaseAdmin': {
      supabaseAdmin: { from: () => query },
    },
    '@/lib/checkout-owner': {
      resolveCheckoutOwner: async () => ({ ownerType: 'customer' }),
      checkoutOwnerErrorResponse: () => null,
      scopeCheckoutOwnerQuery: (value) => value,
    },
    '@/lib/preview-capacity': {
      resolvePreviewCapacityState: () => 'waiting',
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
  }, { filename: 'app/api/jobs/[jobId]/route.ts' })
  return loaded.exports
}

test('owned Job GET serializes an exact public key allowlist', async () => {
  const { GET } = loadRoute({
    job_id: 'job-1',
    job_type: 'preview',
    story_language: 'English',
    selected_book_type: 'Classic',
    status: 'running',
    progress: 30,
    error_message: null,
    input_snapshot: { template_id: 'template-1' },
    output_assets: null,
    provider_runs: {
      preview_face: {
        attempts: {
          attempt_1: {
            intermediate_path: 'jobs/private/runtime/providers/openai/attempt-1/page.png',
          },
        },
      },
    },
    intermediatePath: 'renamed-private-path',
    objectKey: 'future-private-object-key',
    created_at: '2026-09-28T00:00:00.000Z',
    updated_at: '2026-09-28T00:01:00.000Z',
  })
  const response = await GET(
    new Request('http://localhost/api/jobs/job-1'),
    { params: Promise.resolve({ jobId: 'job-1' }) }
  )
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.match(response.headers.get('Cache-Control'), /no-store/)
  assert.deepEqual(Object.keys(body).sort(), [
    'capacity_state',
    'created_at',
    'error_message',
    'input_snapshot',
    'job_id',
    'job_type',
    'output_assets',
    'progress',
    'selected_book_type',
    'status',
    'story_language',
    'updated_at',
  ])
  assert.equal(body.capacity_state, 'waiting')
  assert.equal('provider_runs' in body, false)
  assert.equal('intermediatePath' in body, false)
  assert.equal('objectKey' in body, false)
})
