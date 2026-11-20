import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { createBrowserClient, createServerClient } from '@supabase/ssr'

const require = createRequire(import.meta.url)
require('tsx/cjs')
const { hasRemoteMatch } = require('next/dist/shared/lib/match-remote-pattern')
const configPath = require.resolve('../next.config.ts')
const projectRef = 'abcdefghijklmnopqrst'
const original = `${projectRef}.supabase.co`
const vanity = 'story-brand.supabase.co'

// This file runs in its own Node test process. Reload the actual build config
// for each environment so a cached result cannot mask a rollback regression.
function loadConfig(primaryHost, vanityHost, serviceOrigin = `https://${original}`) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${primaryHost}`
  process.env.SUPABASE_URL = serviceOrigin
  if (vanityHost) process.env.SUPABASE_AUTH_VANITY_HOST = vanityHost
  else delete process.env.SUPABASE_AUTH_VANITY_HOST
  delete require.cache[configPath]
  return require(configPath).default
}

test('cutover and rollback builds can display both generations of Storage images', () => {
  for (const primary of [vanity, original]) {
    const { images: { remotePatterns: patterns } } = loadConfig(primary, vanity)
    const matches = (url) => hasRemoteMatch([], patterns, new URL(url))
    for (const host of [original, vanity]) {
      assert.ok(matches(`https://${host}/storage/v1/object/public/books/cover.webp`))
      assert.ok(matches(`https://${host}/storage/v1/object/sign/books/page.png?token=fixture`))
      assert.equal(matches(`https://${host}/auth/v1/callback`), false)
      assert.equal(matches(`http://${host}/storage/v1/object/public/books/cover.webp`), false)
    }
    assert.equal(matches('https://other.supabase.co/storage/v1/object/public/books/cover.webp'), false)
  }
})

test('normal builds keep SDK defaults and vanity builds reject incomplete endpoint pairs', () => {
  const config = loadConfig(original)
  assert.deepEqual(config.images.remotePatterns.map((entry) => entry.hostname), [original, original])
  assert.equal(config.env.NEXT_PUBLIC_SUPABASE_SESSION_COOKIE_NAME, '')
  assert.throws(() => loadConfig(original, '*.supabase.co'), /exact vanity hostname/)
  assert.throws(() => loadConfig(vanity, vanity, ''), /original Supabase project URL/)
  assert.throws(() => loadConfig('unrelated.supabase.co', vanity), /must match/)
})

test('switching accounts then rolling back reads only the latest account; logout clears it', async () => {
  const jar = new Map()
  const cookies = {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (entries) => {
      for (const { name, value } of entries) {
        if (value) jar.set(name, value)
        else jar.delete(name)
      }
    },
  }
  const authFetch = async (url, init) => {
    if (new URL(url).pathname === '/auth/v1/logout') return new Response(null, { status: 204 })
    assert.equal(new URL(url).pathname, '/auth/v1/token')
    const { email } = JSON.parse(init.body)
    const exp = Math.floor(Date.now() / 1000) + 3600
    const payload = Buffer.from(JSON.stringify({ sub: email, exp })).toString('base64url')
    return Response.json({
      access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.c2ln`, refresh_token: 'fixture',
      token_type: 'bearer', expires_in: 3600, user: { id: email, email, user_metadata: { sample: 'x'.repeat(4000) } },
    })
  }
  const cookieModule = require.resolve('../src/lib/supabase-session-cookie.ts')
  function client(host, vanitySetting, create) {
    process.env.NEXT_PUBLIC_SUPABASE_SESSION_COOKIE_NAME = loadConfig(host, vanitySetting).env.NEXT_PUBLIC_SUPABASE_SESSION_COOKIE_NAME
    delete require.cache[cookieModule]
    return create(`https://${host}`, 'offline-public-key', {
      cookies, cookieOptions: require(cookieModule).sessionCookieOptions,
      isSingleton: false, global: { fetch: authFetch },
    })
  }
  for (const file of ['src/lib/supabase.ts', 'src/lib/supabaseServer.ts', 'proxy.ts']) {
    const source = await readFile(new URL(`../${file}`, import.meta.url), 'utf8')
    assert.match(source, /cookieOptions: sessionCookieOptions/)
  }
  const before = client(original, undefined, createBrowserClient)
  assert.equal((await before.auth.signInWithPassword({ email: 'a@example.test', password: 'test' })).error, null)
  assert.ok(jar.has(`sb-${projectRef}-auth-token.0`), 'exercise chunked session cookies')
  const after = client(vanity, vanity, createBrowserClient)
  assert.equal((await after.auth.signInWithPassword({ email: 'b@example.test', password: 'test' })).error, null)
  const restored = client(original, vanity, createServerClient)
  assert.equal((await restored.auth.getSession()).data.session?.user.email, 'b@example.test')
  assert.equal((await after.auth.signOut({ scope: 'local' })).error, null)
  assert.equal((await restored.auth.getSession()).data.session, null)
})
