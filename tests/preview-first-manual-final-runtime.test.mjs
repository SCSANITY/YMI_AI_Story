import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import test from 'node:test'

function compile(relative) {
  return ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
}
const mode = { exports: {} }
vm.runInNewContext(compile('../src/lib/final-production.ts'), {
  module: mode, exports: mode.exports,
  require: () => ({ parseFinalPageMetadataContract: () => assert.fail('Rerun should not build metadata') }),
})

function loadRerun(productionMode, authorized = true) {
  const calls = []
  const currentJob = { input_snapshot: { final_production_mode: productionMode, face_source_path: 'synthetic/reference', final_page_indices: [0, 1] },
    output_assets: { pages: [] }, status: 'manual_pending', progress: 0 }
  const rows = {
    final_jobs: { final_job_id: 'review-job', job_id: 'job', order_id: 'order', total_pages: 31 },
    jobs: currentJob,
    final_job_pages: { final_job_page_id: 'page', page_index: 0, status: 'approved', attempt_count: 0 },
  }
  const supabaseAdmin = { from(table) {
    const query = {
      select() { return query }, eq() { return query }, in() { return query },
      update(patch) { calls.push({ table, patch }); return query },
      maybeSingle: async () => ({ data: rows[table], error: null }),
      then(resolve) { return Promise.resolve({ data: rows[table], error: null }).then(resolve) },
    }
    return query
  } }
  const dependencies = {
    'next/server': { NextResponse: { json: Response.json } },
    '@/lib/adminAuth': { requireAdminCustomer: async () => authorized ? { customer_id: 'admin' } : null },
    '@/lib/supabaseAdmin': { supabaseAdmin },
    '@/lib/final-production': mode.exports,
    '@/lib/final-job-release': { isFinalJobReleased: () => false },
    '@/lib/final-review-mutation-contract': { resolveFinalReviewMutationPage: () => ({}), FinalReviewMutationContractError: class extends Error {} },
    '@/lib/final-review-mutation-store': { loadFinalReviewMutationPlan: async () => ({}) },
  }
  const loaded = { exports: {} }
  vm.runInNewContext(compile('../app/api/admin/final-jobs/[finalJobId]/pages/[pageIndex]/rerun/route.ts'), {
    module: loaded, exports: loaded.exports, Request, Response, Date,
    require(name) { assert.ok(Object.hasOwn(dependencies, name), `Unmocked ${name}`); return dependencies[name] },
  })
  return { ...loaded.exports, calls }
}

function request() {
  return new Request('http://localhost/api/admin/final-jobs/review-job/pages/0/rerun', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reviewIntentId: '11111111-1111-4111-8111-111111111111' }),
  })
}
const context = { params: Promise.resolve({ finalJobId: 'review-job', pageIndex: '0' }) }

test('manual Final rerun is rejected before every page/job write', async () => {
  const route = loadRerun('manual')
  const response = await route.POST(request(), context)
  assert.equal(response.status, 409)
  assert.equal((await response.json()).code, 'manual_final_rerun_disabled')
  assert.equal(route.calls.length, 0)
})

test('automatic Final rerun retains frozen mode and the existing queued path', async () => {
  const route = loadRerun('auto')
  const response = await route.POST(request(), context)
  assert.equal(response.status, 200)
  const jobWrite = route.calls.find((call) => call.table === 'jobs')
  assert.equal(jobWrite.patch.status, 'queued')
  assert.equal(jobWrite.patch.input_snapshot.final_production_mode, 'auto')
  assert.ok(route.calls.some((call) => call.table === 'final_job_pages'))
})

test('Rerun keeps the existing Admin authentication boundary', async () => {
  const route = loadRerun('auto', false)
  const response = await route.POST(request(), context)
  assert.equal(response.status, 403)
  assert.equal(route.calls.length, 0)
})
