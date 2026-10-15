import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

function compile(relative) {
  return ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
}

function loadRoute({ authorized = true, failClaims = false } = {}) {
  const calls = { claims: [], removals: [], finished: [], warnings: [] }
  const supabaseAdmin = {
    async rpc(name, args) {
      if (name.startsWith('enqueue_')) return { data: 0, error: null }
      if (name === 'claim_user_asset_cleanup') {
        calls.claims.push(args.p_limit)
        if (failClaims) return { data: null, error: { message: 'synthetic-private-failure' } }
        return { error: null, data: Array.from({ length: args.p_limit }, (_, index) => ({
          out_cleanup_id: `fixture-cleanup-${index}`, out_bucket_name: 'raw-private',
          out_storage_path: `synthetic/job-${index}.webp`, out_processing_token: `fixture-token-${index}`,
        })) }
      }
      if (name === 'finish_user_asset_cleanup_claim') {
        calls.finished.push(args)
        return { data: true, error: null }
      }
      assert.fail(`Unexpected RPC: ${name}`)
    },
    storage: { from(bucket) {
      assert.equal(bucket, 'raw-private')
      return { async remove(paths) { calls.removals.push(paths); return { error: null } } }
    } },
  }
  const helper = { exports: {} }
  vm.runInNewContext(compile('../src/lib/user-asset-cleanup-server.ts'), {
    module: helper, exports: helper.exports, Date,
    require(name) { assert.equal(name, '@/lib/supabaseAdmin'); return { supabaseAdmin } },
    console: { warn(...args) { calls.warnings.push(args) } },
  })
  const dependencies = {
    '@/lib/http-response': { noStoreJson: (body, status = 200) => Response.json(body, { status }) },
    '@/lib/internal-request-auth': { isInternalRequestAuthorized: () => authorized },
    '@/lib/user-asset-cleanup-server': helper.exports,
  }
  const route = { exports: {} }
  vm.runInNewContext(compile('../app/api/internal/user-assets/cleanup/route.ts'), {
    module: route, exports: route.exports,
    require(name) { assert.ok(Object.hasOwn(dependencies, name), `Unexpected module: ${name}`); return dependencies[name] },
    console: { error() {} },
  })
  return { route: route.exports, calls }
}

for (const method of ['GET', 'POST']) {
  test(`${method}: real cleanup helper claims/removes only 20 and retains processing tokens`, async () => {
    const { route, calls } = loadRoute()
    const response = await route[method](new Request('https://example.invalid/api/internal/user-assets/cleanup?limit=200', {
      method, ...(method === 'POST' ? { body: JSON.stringify({ limit: 200 }), headers: { 'Content-Type': 'application/json' } } : {}),
    }))
    assert.equal(response.status, 200)
    assert.deepEqual(calls.claims, [20])
    assert.equal(calls.removals.length, 20)
    assert.equal(calls.finished.length, 20)
    for (let index = 0; index < 20; index++) {
      assert.equal(calls.finished[index].p_cleanup_id, `fixture-cleanup-${index}`)
      assert.equal(calls.finished[index].p_processing_token, `fixture-token-${index}`)
    }
    const result = await response.json()
    assert.equal(result.claims, 20)
    assert.equal(result.removed, 20)
    assert.equal(result.failed, 0)
    assert.equal(route.maxDuration, 60)
    assert.equal(route.dynamic, 'force-dynamic')
    assert.equal(route.GET, route.POST)
  })

  test(`${method}: unauthorized request reaches no cleanup RPC or Storage mutation`, async () => {
    const { route, calls } = loadRoute({ authorized: false })
    const response = await route[method](new Request('https://example.invalid/api/internal/user-assets/cleanup', { method }))
    assert.equal(response.status, 401)
    assert.deepEqual(calls.claims, [])
    assert.deepEqual(calls.removals, [])
  })
}

test('cleanup RPC failure keeps fixed error response and does not retry', async () => {
  const { route, calls } = loadRoute({ failClaims: true })
  const response = await route.POST(new Request('https://example.invalid/api/internal/user-assets/cleanup', { method: 'POST' }))
  assert.equal(response.status, 500)
  assert.deepEqual(await response.json(), { error: 'User asset cleanup failed' })
  assert.deepEqual(calls.claims, [20])
  assert.deepEqual(calls.removals, [])
})
