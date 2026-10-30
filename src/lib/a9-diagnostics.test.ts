import assert from 'node:assert/strict'
import { AsyncLocalStorage } from 'node:async_hooks'
import test from 'node:test'
import { loadUi } from '../../tests/helpers/preview-uiux-harness.mjs'

function fixture() {
  const processStub = { env: { YMI_A9_DIAGNOSTICS: 'true' } }
  const globals = { process: processStub, performance, Response, Request, Headers, URL }
  const diagnostics = loadUi('src/lib/a9-diagnostics.ts', {
    'node:async_hooks': { AsyncLocalStorage },
    'node:crypto': { randomUUID: () => 'fixture-instance' },
  }, globals)
  const service = loadUi('src/lib/supabase-service-credential.ts', {
    'server-only': {},
    '@/lib/a9-diagnostics': diagnostics,
  }, globals)
  return { diagnostics, processStub, service }
}

test('the real service fetch path records the REST table entry', async () => {
  const { diagnostics, service } = fixture()
  const fetchImpl = async () => new Response('{}', { status: 200 })
  const serviceFetch = service.createSupabaseServiceFetch({
    value: 'legacy-service-role-key',
    kind: 'legacy-service-role',
    source: 'SUPABASE_SERVICE_ROLE_KEY',
  }, fetchImpl)

  const response = await diagnostics.withA9Diagnostics(async () => {
    await serviceFetch('https://example.supabase.co/rest/v1/customers', { method: 'GET' })
    return new Response('ok')
  })

  assert.match(response.headers.get('Server-Timing') ?? '', /rest\.customers;dur=/)
})

test('the first concurrent handlers share one instance and both record calls', async () => {
  const { diagnostics, service } = fixture()
  const fetchImpl = async () => {
    await new Promise((resolve) => setTimeout(resolve, 5))
    return new Response('{}', { status: 200 })
  }
  const serviceFetch = service.createSupabaseServiceFetch({
    value: 'legacy-service-role-key',
    kind: 'legacy-service-role',
    source: 'SUPABASE_SERVICE_ROLE_KEY',
  }, fetchImpl)
  const handler = () => diagnostics.withA9Diagnostics(async () => {
    await serviceFetch('https://example.supabase.co/rest/v1/customers', { method: 'GET' })
    return new Response('ok')
  })

  const responses = await Promise.all([handler(), handler()])
  const timings = responses.map((response) => response.headers.get('Server-Timing') ?? '')
  assert.equal(timings.filter((timing) => timing.includes('a9-instance;desc="fixture-instance"')).length, 2)
  assert.equal(timings.filter((timing) => timing.includes('rest.customers;dur=')).length, 2)
  assert.deepEqual(timings.map((timing) => timing.match(/a9-seq;desc="(\d+)"/)?.[1]).sort(), ['1', '2'])
})

test('the default-off path emits no diagnostic header', async () => {
  const { diagnostics, processStub } = fixture()
  processStub.env.YMI_A9_DIAGNOSTICS = 'false'
  const response = await diagnostics.withA9Diagnostics(async () => new Response('ok'))
  assert.equal(response.headers.get('Server-Timing'), null)
})
