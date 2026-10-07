import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { build } = require('esbuild')

async function loadBundled(entry, { external = [] } = {}) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL(`../${entry}`, import.meta.url))],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)),
    external,
  })
  const loaded = { exports: {} }
  runInNewContext(result.outputFiles[0].text, {
    module: loaded,
    exports: loaded.exports,
    Headers,
    Request,
    Response,
    fetch,
    process: { env: {} },
    require(name) {
      if (name === 'server-only') return {}
      return require(name)
    },
  }, { filename: entry })
  return loaded.exports
}

test('public credential prefers a valid publishable key and keeps legacy anon compatibility', async () => {
  const credentials = await loadBundled('src/lib/supabase-public-key.ts')
  assert.deepEqual(
    structuredClone(credentials.resolveSupabasePublicKey('sb_publishable_WEB_TEST', 'legacy-anon-test')),
    { value: 'sb_publishable_WEB_TEST', kind: 'publishable' }
  )
  assert.deepEqual(
    structuredClone(credentials.resolveSupabasePublicKey(undefined, 'legacy-anon-test')),
    { value: 'legacy-anon-test', kind: 'legacy-anon' }
  )
  assert.throws(
    () => credentials.resolveSupabasePublicKey('', 'legacy-anon-test'),
    /missing or invalid/
  )
  assert.throws(
    () => credentials.resolveSupabasePublicKey('sb_secret_WRONG_TYPE', 'legacy-anon-test'),
    /invalid format/
  )
})

test('service credential prefers sb_secret, classifies legacy fallback and fails closed on wrong types', async () => {
  const credentials = await loadBundled('src/lib/supabase-service-credential.ts', {
    external: ['server-only'],
  })
  assert.deepEqual(
    structuredClone(credentials.resolveSupabaseServiceCredential({
      SUPABASE_SECRET_KEY: 'sb_secret_WEB_TEST',
      SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-test',
    })),
    { value: 'sb_secret_WEB_TEST', kind: 'secret', source: 'SUPABASE_SECRET_KEY' }
  )
  assert.deepEqual(
    structuredClone(credentials.resolveSupabaseServiceCredential({
      SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-test',
    })),
    {
      value: 'legacy-service-test',
      kind: 'legacy-service-role',
      source: 'SUPABASE_SERVICE_ROLE_KEY',
    }
  )
  assert.throws(
    () => credentials.resolveSupabaseServiceCredential({
      SUPABASE_SECRET_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-test',
    }),
    /missing or invalid/
  )
  assert.throws(
    () => credentials.resolveSupabaseServiceCredential({
      SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_WRONG_TYPE',
    }),
    /invalid key type/
  )
})

test('native service headers are apikey-only for new secrets and preserve legacy headers', async () => {
  const credentials = await loadBundled('src/lib/supabase-service-credential.ts', {
    external: ['server-only'],
  })
  const secret = credentials.resolveSupabaseServiceCredential({
    SUPABASE_SECRET_KEY: 'sb_secret_WEB_TEST',
  })
  const legacy = credentials.resolveSupabaseServiceCredential({
    SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-test',
  })
  assert.deepEqual(
    structuredClone(credentials.supabaseServiceRequestHeaders(secret)),
    { apikey: 'sb_secret_WEB_TEST' }
  )
  assert.deepEqual(
    structuredClone(credentials.supabaseServiceRequestHeaders(legacy)),
    {
      Authorization: 'Bearer legacy-service-test',
      apikey: 'legacy-service-test',
    }
  )
})

test('service fetch removes only a new secret used as Bearer and retains an actual user JWT', async () => {
  const credentials = await loadBundled('src/lib/supabase-service-credential.ts', {
    external: ['server-only'],
  })
  const secret = credentials.resolveSupabaseServiceCredential({
    SUPABASE_SECRET_KEY: 'sb_secret_WEB_TEST',
  })
  const seen = []
  const fetchImpl = async (_input, init) => {
    const headers = new Headers(init.headers)
    seen.push(Object.fromEntries(headers.entries()))
    return new Response('{}', { status: 200 })
  }
  const wrapped = credentials.createSupabaseServiceFetch(secret, fetchImpl)
  await wrapped('https://example.invalid/rest/v1/test', {
    headers: { Authorization: 'Bearer sb_secret_WEB_TEST' },
  })
  await wrapped('https://example.invalid/rest/v1/test', {
    headers: { Authorization: 'Bearer user-jwt-test' },
  })
  assert.deepEqual(seen, [
    { apikey: 'sb_secret_WEB_TEST' },
    { apikey: 'sb_secret_WEB_TEST', authorization: 'Bearer user-jwt-test' },
  ])
  const accessToken = credentials.createSupabaseServiceAccessToken(secret)
  assert.equal(typeof accessToken, 'function')
  assert.equal(await accessToken(), null)
  assert.equal(
    credentials.createSupabaseServiceAccessToken(
      credentials.resolveSupabaseServiceCredential({
        SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-test',
      })
    ),
    undefined
  )
})

test('all public Supabase clients use the static publishable-key resolver', async () => {
  const sources = await Promise.all([
    readFile(new URL('../proxy.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/supabase.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/lib/supabaseServer.ts', import.meta.url), 'utf8'),
  ])
  for (const source of sources) {
    assert.match(source, /configuredSupabasePublicKey\(\)/)
    assert.doesNotMatch(source, /const supabaseAnonKey/)
  }
  const resolver = await readFile(new URL('../src/lib/supabase-public-key.ts', import.meta.url), 'utf8')
  assert.match(resolver, /process\.env\.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/)
  assert.match(resolver, /process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY/)
})

test('server fallbacks accept the new secret variable first', async () => {
  const paths = [
    '../app/api/guest/request-otp/route.ts',
    '../app/api/newsletter-subscribers/route.ts',
    '../app/api/upload-url/route.ts',
  ]
  for (const relativePath of paths) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
    const secretIndex = source.indexOf('process.env.SUPABASE_SECRET_KEY')
    const roleIndex = source.indexOf('process.env.SUPABASE_SERVICE_ROLE_KEY')
    assert.ok(secretIndex >= 0, relativePath)
    assert.ok(roleIndex > secretIndex, relativePath)
  }
})

test('maintenance scripts use the same apikey-only secret contract', async () => {
  const helper = await import('../scripts/supabase-service-client.mjs')
  const secret = helper.resolveSupabaseServiceKey({
    SUPABASE_SECRET_KEY: 'sb_secret_SCRIPT_TEST',
    SUPABASE_SERVICE_ROLE_KEY: 'legacy-service-test',
  })
  assert.deepEqual(secret, { value: 'sb_secret_SCRIPT_TEST', kind: 'secret' })
  const options = helper.supabaseServiceClientOptions(secret)
  assert.equal(await options.accessToken(), null)

  const seen = []
  const wrapped = helper.createSupabaseServiceFetch(secret, async (_input, init) => {
    seen.push(Object.fromEntries(new Headers(init.headers).entries()))
    return new Response('{}', { status: 200 })
  })
  await wrapped('https://example.invalid/rest/v1/test', {
    headers: { Authorization: 'Bearer sb_secret_SCRIPT_TEST' },
  })
  assert.deepEqual(seen, [{ apikey: 'sb_secret_SCRIPT_TEST' }])

  for (const relativePath of [
    '../scripts/normalize-template-covers.mjs',
    '../scripts/optimize-images.mjs',
  ]) {
    const source = await readFile(new URL(relativePath, import.meta.url), 'utf8')
    assert.match(source, /resolveSupabaseServiceKey\(\)/)
    assert.match(source, /supabaseServiceClientOptions\(SERVICE_CREDENTIAL\)/)
  }
})
