import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const JOB_ID = '10000000-0000-4000-8000-000000000001'
const CREATION_ID = '20000000-0000-4000-8000-000000000002'

function transpile(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
}

const routeJs = transpile('../../app/api/jobs/[jobId]/retry/route.ts')

function loadRoute({
  owner = { ownerType: 'customer' },
  retryable = true,
  invalidated = false,
} = {}) {
  const calls = []
  const state = {
    job: {
      job_id: JOB_ID,
      job_type: 'preview',
      status: 'failed',
      creation_id: CREATION_ID,
      input_snapshot: invalidated
        ? { config_url: 'private/config.json', preview_variant_invalidated_at: 'now' }
        : { config_url: 'private/config.json' },
      output_assets: { pages: [{ page_index: 0 }] },
      provider_runs: { retryable },
      claim_attempts: 1,
      progress: 30,
    },
    creation: {
      creation_id: CREATION_ID,
      preview_job_id: JOB_ID,
      is_archived: false,
      deleted_at: null,
    },
  }

  class Query {
    constructor(table) {
      this.table = table
      this.filters = []
      this.updatePayload = null
      this.selected = ''
    }
    select(columns) { this.selected = columns; calls.push({ kind: 'select', table: this.table, columns }); return this }
    eq(column, value) { this.filters.push([column, value]); calls.push({ kind: 'eq', table: this.table, column, value }); return this }
    update(payload) { this.updatePayload = payload; calls.push({ kind: 'update', table: this.table, payload }); return this }
    async maybeSingle() {
      calls.push({ kind: 'maybeSingle', table: this.table })
      if (this.table === 'creations') return { data: state.creation, error: null }
      if (this.updatePayload) {
        const expectedStatus = this.filters.find(([column]) => column === 'status')?.[1]
        if (expectedStatus && state.job.status !== expectedStatus) return { data: null, error: null }
        Object.assign(state.job, this.updatePayload)
        return {
          data: {
            job_id: state.job.job_id,
            creation_id: state.job.creation_id,
            status: state.job.status,
          },
          error: null,
        }
      }
      return { data: state.job, error: null }
    }
  }

  const dependencies = {
    '@/lib/checkout-owner': {
      resolveCheckoutOwner: async () => owner,
      checkoutOwnerErrorResponse: () => null,
      scopeCheckoutOwnerQuery: (query) => query,
    },
    '@/lib/http-response': {
      noStoreJson: (body, status = 200) => Response.json(body, {
        status,
        headers: { 'Cache-Control': 'private, no-store, max-age=0' },
      }),
    },
    '@/lib/purchase-state': {
      loadCreationPhotoLockState: async () => ({
        purchaseState: 'unpurchased',
        hasCartAttachment: false,
      }),
    },
    '@/lib/preview-retry': {
      resolvePreviewRetryDecision: (providerRuns) => ({
        failureCode: providerRuns?.retryable
          ? 'retryable_generation_failure'
          : 'generation_failed',
        retryable: providerRuns?.retryable === true,
      }),
    },
    '@/lib/preview-variants': {
      getPreviewVariantMarker: () => null,
      isPreviewVariantInvalidated: (snapshot) => Boolean(snapshot?.preview_variant_invalidated_at),
    },
    '@/lib/supabaseAdmin': {
      supabaseAdmin: { from(table) { calls.push({ kind: 'from', table }); return new Query(table) } },
    },
    '@/lib/validators': {
      isUuid: (value) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(value)),
    },
  }
  const loaded = { exports: {} }
  vm.runInNewContext(routeJs, {
    module: loaded,
    exports: loaded.exports,
    Response,
    Request,
    Date,
    Object,
    Promise,
    require(name) {
      if (Object.hasOwn(dependencies, name)) return dependencies[name]
      throw new Error(`Unmocked ${name}`)
    },
  }, { filename: 'app/api/jobs/[jobId]/retry/route.ts' })
  return { ...loaded.exports, calls, state }
}

function retryRequest() {
  return new Request(`http://localhost/api/jobs/${JOB_ID}/retry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creationId: CREATION_ID }),
  })
}

test('W2 requeues the same failed Job while preserving immutable input and checkpoint fields', async () => {
  const { POST, calls, state } = loadRoute()
  const inputSnapshot = structuredClone(state.job.input_snapshot)
  const outputAssets = structuredClone(state.job.output_assets)
  const providerRuns = structuredClone(state.job.provider_runs)
  const response = await POST(retryRequest(), { params: Promise.resolve({ jobId: JOB_ID }) })
  const body = await response.json()

  assert.equal(response.status, 200)
  assert.match(response.headers.get('Cache-Control'), /no-store/)
  assert.deepEqual(body, {
    ok: true,
    reused: false,
    jobId: JOB_ID,
    creationId: CREATION_ID,
    status: 'queued',
  })
  assert.equal(state.job.status, 'queued')
  assert.equal(state.job.error_message, null)
  assert.deepEqual(state.job.input_snapshot, inputSnapshot)
  assert.deepEqual(state.job.output_assets, outputAssets)
  assert.deepEqual(state.job.provider_runs, providerRuns)
  assert.equal(state.job.claim_attempts, 1)
  assert.equal(state.job.progress, 30)
  assert.equal(calls.some((call) => call.kind === 'update' && call.table === 'jobs'), true)
  assert.equal(calls.some((call) => call.kind === 'insert'), false)
  assert.equal(calls.some((call) => call.kind === 'eq' && call.column === 'status' && call.value === 'failed'), true)
})

test('W2 double activation reuses the same Job even if it completes before the second response', async () => {
  const { POST, calls, state } = loadRoute()
  const first = await POST(retryRequest(), { params: Promise.resolve({ jobId: JOB_ID }) })
  // The first retry may finish before a stale second tab receives its response.
  state.job.status = 'done'
  const second = await POST(retryRequest(), { params: Promise.resolve({ jobId: JOB_ID }) })

  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  const secondBody = await second.json()
  assert.equal(secondBody.reused, true)
  assert.equal(secondBody.status, 'done')
  assert.equal(calls.filter((call) => call.kind === 'update').length, 1)
})

test('W2 denies untyped failures, invalidated variants, and missing owners without mutation', async () => {
  for (const fixture of [
    { retryable: false, expectedStatus: 409 },
    { invalidated: true, expectedStatus: 409 },
    { owner: null, expectedStatus: 401 },
  ]) {
    const { POST, calls } = loadRoute(fixture)
    const response = await POST(retryRequest(), { params: Promise.resolve({ jobId: JOB_ID }) })
    assert.equal(response.status, fixture.expectedStatus)
    assert.equal(calls.filter((call) => call.kind === 'update').length, 0)
  }
})
