import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
require('tsx/cjs')
const { hasRemoteMatch } = require('next/dist/shared/lib/match-remote-pattern')
const configPath = require.resolve('../next.config.ts')
const original = 'original-project.supabase.co'
const vanity = 'story-brand.supabase.co'

// This file runs in its own Node test process. Reload the actual build config
// for each environment so a cached result cannot mask a rollback regression.
function loadPatterns(primaryHost, aliasHost) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${primaryHost}`
  if (aliasHost) process.env.SUPABASE_STORAGE_IMAGE_ALIAS_HOST = aliasHost
  else delete process.env.SUPABASE_STORAGE_IMAGE_ALIAS_HOST
  delete require.cache[configPath]
  return require(configPath).default.images.remotePatterns
}

test('cutover and rollback builds can display both generations of Storage images', () => {
  for (const [primary, alias] of [[vanity, original], [original, vanity]]) {
    const matches = (url) => hasRemoteMatch([], patterns, new URL(url))
    const patterns = loadPatterns(primary, alias)
    for (const host of [original, vanity]) {
      assert.ok(matches(`https://${host}/storage/v1/object/public/books/cover.webp`))
      assert.ok(matches(`https://${host}/storage/v1/object/sign/books/page.png?token=fixture`))
      assert.equal(matches(`https://${host}/auth/v1/callback`), false)
      assert.equal(matches(`http://${host}/storage/v1/object/public/books/cover.webp`), false)
    }
    assert.equal(matches('https://other.supabase.co/storage/v1/object/public/books/cover.webp'), false)
  }
})

test('existing installations retain one host and an alias cannot be a wildcard', () => {
  assert.deepEqual(loadPatterns(original).map((entry) => entry.hostname), [original, original])
  assert.deepEqual(loadPatterns(original, original), loadPatterns(original))
  assert.throws(() => loadPatterns(original, '*.supabase.co'), /exact Supabase hostname/)
})
