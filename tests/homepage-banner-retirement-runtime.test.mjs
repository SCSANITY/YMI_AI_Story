import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { build } = require('esbuild') // Existing tsx toolchain, no new dependency.
const activeKeys = ['after_for_boys', 'after_in_discount']
const publishedFields = [
  'display_name', 'desktop_asset_source', 'desktop_asset_path', 'desktop_width',
  'desktop_height', 'mobile_asset_source', 'mobile_asset_path', 'mobile_width',
  'mobile_height', 'alt_text', 'href', 'is_visible',
]

function fixtureRow(slotKey) {
  return {
    slot_key: slotKey, display_name: slotKey,
    desktop_asset_source: 'builtin', desktop_asset_path: `banners/${slotKey}-desktop.webp`,
    desktop_width: 2400, desktop_height: 1200,
    mobile_asset_source: 'builtin', mobile_asset_path: `banners/${slotKey}-mobile.webp`,
    mobile_width: 1100, mobile_height: 550,
    alt_text: slotKey, href: '/books', is_visible: true,
    row_version: 1, updated_at: '2026-09-18T00:00:00Z',
  }
}

async function harness() {
  const rows = [fixtureRow('after_hero'), ...activeKeys.map(fixtureRow)]
  // The retired record must never be parsed or have assets resolved, even if
  // retained historical data has become invalid.
  rows[0].desktop_asset_source = 'retired-invalid-source'
  const calls = { reads: 0, uploads: 0, rpc: [], invalidations: [], cache: [] }
  let authorized = true
  const supabaseAdmin = {
    from(table) {
      assert.equal(table, 'homepage_banner_slots')
      calls.reads++
      let selection = rows
      const query = {
        select() { return query },
        in(column, keys) {
          assert.equal(column, 'slot_key')
          assert.deepEqual(Array.from(keys), activeKeys)
          selection = selection.filter(row => keys.includes(row.slot_key))
          return query
        },
        eq(column, key) {
          selection = selection.filter(row => row[column] === key)
          return query
        },
        async order() {
          assert.equal(selection.some(row => row.slot_key === 'after_hero'), false)
          return { data: selection, error: null }
        },
        async maybeSingle() { return { data: selection[0] ?? null, error: null } },
      }
      return query
    },
    async rpc(name, args) {
      calls.rpc.push({ name, args })
      if (name === 'publish_homepage_banner_slot') {
        const row = rows.find(row => row.slot_key === args.p_slot_key)
        if (row.row_version !== args.p_expected_version) {
          return { error: { message: 'changed in another session' } }
        }
        for (const field of publishedFields) row[field] = args[`p_${field}`]
        row.row_version++
      } else {
        assert.equal(name, 'swap_homepage_banner_slots')
        const first = rows.find(row => row.slot_key === args.p_first_slot_key)
        const second = rows.find(row => row.slot_key === args.p_second_slot_key)
        if (first.row_version !== args.p_first_expected_version ||
          second.row_version !== args.p_second_expected_version) {
          return { error: { message: 'changed in another session' } }
        }
        for (const field of publishedFields) [first[field], second[field]] = [second[field], first[field]]
        first.row_version++
        second.row_version++
      }
      return { error: null }
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, 'site-public')
        return {
          getPublicUrl() { assert.fail('Retained retired assets must not be resolved') },
          download() { assert.fail('These tests publish only verified current built-ins') },
          async createSignedUploadUrl(path, options) {
            calls.uploads++
            assert.equal(options.upsert, false)
            assert.match(path, /^homepage-banners\/admin\//)
            return { data: { signedUrl: 'https://fixture.test/upload', token: 'fixture-token' }, error: null }
          },
        }
      },
    },
  }

  async function load(relativePath) {
    const result = await build({
      entryPoints: [fileURLToPath(new URL(`../${relativePath}`, import.meta.url))],
      bundle: true, write: false, platform: 'node', format: 'cjs',
      tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)),
      external: ['@/lib/adminAuth', '@/lib/supabaseAdmin', 'next/cache', 'next/server', 'server-only', 'sharp'],
    })
    const runtimeModule = { exports: {} }
    runInNewContext(result.outputFiles[0].text, {
      module: runtimeModule, exports: runtimeModule.exports, Buffer, console,
      require(name) {
        if (name === 'server-only') return {} // Next build guard, not an auth stub.
        if (name === '@/lib/adminAuth') return {
          requireAdminCustomer: async () => authorized ? { customer_id: '00000000-0000-4000-8000-000000000001' } : null,
        }
        if (name === '@/lib/supabaseAdmin') return { supabaseAdmin }
        if (name === 'next/cache') return {
          unstable_cache(fn, keys, options) {
            calls.cache.push({ keys: Array.from(keys), tags: Array.from(options.tags), revalidate: options.revalidate })
            return fn
          },
          revalidateTag: (tag, options) => calls.invalidations.push([tag, options.expire]),
          revalidatePath: path => calls.invalidations.push(path),
        }
        if (name === 'sharp') return () => assert.fail('No image decoding is needed for these fixtures')
        assert.ok(['next/server', 'node:crypto'].includes(name), `Unexpected dependency: ${name}`)
        return require(name)
      },
    })
    return runtimeModule.exports
  }

  return { rows, calls, load, authorize: value => { authorized = value } }
}

const request = (body, method = 'POST') => new Request('https://fixture.test/api/admin/homepage-banners', {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const publishBody = (slotKey, version = 1) => ({
  slotKey, expectedVersion: version, displayName: 'Updated active banner',
  desktop: { source: 'builtin', path: `banners/${slotKey}-desktop.webp` },
  mobile: { source: 'builtin', path: `banners/${slotKey}-mobile.webp` },
  altText: 'Updated active banner', href: '/books', isVisible: true,
})

test('actual Admin handlers deny anonymous callers before reads, uploads or RPCs', async () => {
  const env = await harness()
  env.authorize(false)
  const slots = await env.load('app/api/admin/homepage-banners/route.ts')
  const swap = await env.load('app/api/admin/homepage-banners/swap/route.ts')
  const upload = await env.load('app/api/admin/homepage-banners/upload-url/route.ts')
  const responses = [
    await slots.GET(), await slots.PATCH(request(publishBody('after_hero'), 'PATCH')),
    await swap.POST(request({ firstSlotKey: 'after_hero', secondSlotKey: activeKeys[0] })),
    await upload.POST(request({ slotKey: 'after_hero', contentType: 'image/webp', sizeBytes: 100 })),
  ]
  for (const response of responses) {
    assert.equal(response.status, 403)
    assert.match(response.headers.get('cache-control'), /private, no-store/)
  }
  assert.equal(env.calls.reads, 0)
  assert.equal(env.calls.uploads, 0)
  assert.equal(env.calls.rpc.length, 0)
})

test('actual publish, upload and either side of swap reject retired/missing/unknown keys before IO', async () => {
  const env = await harness()
  const slots = await env.load('app/api/admin/homepage-banners/route.ts')
  const swap = await env.load('app/api/admin/homepage-banners/swap/route.ts')
  const upload = await env.load('app/api/admin/homepage-banners/upload-url/route.ts')
  for (const key of ['after_hero', 'after_brand_new', undefined]) {
    const responses = [
      await slots.PATCH(request(publishBody(key), 'PATCH')),
      await swap.POST(request({ firstSlotKey: key, secondSlotKey: activeKeys[0], firstExpectedVersion: 1, secondExpectedVersion: 1 })),
      await swap.POST(request({ firstSlotKey: activeKeys[0], secondSlotKey: key, firstExpectedVersion: 1, secondExpectedVersion: 1 })),
      await upload.POST(request({ slotKey: key, contentType: 'image/webp', sizeBytes: 100 })),
    ]
    for (const response of responses) {
      assert.equal(response.status, 400)
      assert.match(response.headers.get('cache-control'), /private, no-store/)
    }
  }
  assert.equal(env.calls.reads, 0)
  assert.equal(env.calls.uploads, 0)
  assert.equal(env.calls.rpc.length, 0)
})

test('actual Admin GET returns exactly two independent active positions despite an invalid retained retired row', async () => {
  const env = await harness()
  const slots = await env.load('app/api/admin/homepage-banners/route.ts')
  const response = await slots.GET()
  assert.equal(response.status, 200)
  const data = await response.json()
  assert.deepEqual(data.slots.map(slot => slot.slotKey), activeKeys)
  assert.equal(data.slots[0].desktop.width, 2400)
  assert.equal(data.slots[0].mobile.width, 1100)
  assert.match(response.headers.get('cache-control'), /private, no-store/)
})

test('actual active-slot publish, CAS conflict, swap reload and upload preparation retain their contracts', async () => {
  const env = await harness()
  const slots = await env.load('app/api/admin/homepage-banners/route.ts')
  const swap = await env.load('app/api/admin/homepage-banners/swap/route.ts')
  const upload = await env.load('app/api/admin/homepage-banners/upload-url/route.ts')
  const published = await slots.PATCH(request(publishBody(activeKeys[0]), 'PATCH'))
  assert.equal(published.status, 200)
  assert.equal((await published.json()).slot.rowVersion, 2)
  const conflict = await slots.PATCH(request(publishBody(activeKeys[0]), 'PATCH'))
  assert.equal(conflict.status, 409)
  const swapped = await swap.POST(request({
    firstSlotKey: activeKeys[0], secondSlotKey: activeKeys[1], firstExpectedVersion: 2, secondExpectedVersion: 1,
  }))
  assert.equal(swapped.status, 200)
  const data = await swapped.json()
  assert.deepEqual(data.slots.map(slot => slot.slotKey), activeKeys)
  assert.equal(data.slots[1].displayName, 'Updated active banner')
  const prepared = await upload.POST(request({ slotKey: activeKeys[1], contentType: 'image/webp', sizeBytes: 100 }))
  assert.equal(prepared.status, 200)
  assert.equal((await prepared.json()).bucket, 'site-public')
  assert.equal(env.calls.uploads, 1)
  assert.deepEqual(env.calls.invalidations,
    [['ymi-homepage-banners-v2', 0], '/', ['ymi-homepage-banners-v2', 0], '/'])
  assert.equal(env.rows[0].slot_key, 'after_hero')
  assert.equal(env.rows[0].row_version, 1)
})

test('actual cached public loader filters retired rows and shares the v2 key/tag without live services', async () => {
  const env = await harness()
  const loader = await env.load('src/lib/homepage-banners.ts')
  const banners = await loader.getPublishedHomepageBanners()
  assert.deepEqual(Object.keys(banners), activeKeys)
  assert.deepEqual(env.calls.cache, [{ keys: ['ymi-homepage-banners-v2'], tags: ['ymi-homepage-banners-v2'], revalidate: 300 }])
  assert.equal(banners.after_for_boys.desktop.width, 2400)
  assert.equal(banners.after_for_boys.mobile.width, 1100)
})
