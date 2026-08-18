import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const sensitiveRoutes = [
  'app/api/creations/[creationId]/route.ts',
  'app/api/creations/resolve/route.ts',
  'app/api/favourites/route.ts',
  'app/api/jobs/route.js',
  'app/api/jobs/[jobId]/route.ts',
  'app/api/jobs/[jobId]/preview-url/route.ts',
  'app/api/my-books/route.ts',
  'app/api/my-books/[creationId]/reader/route.ts',
  'app/api/share/preview/route.ts',
  'app/api/upload-url/route.ts',
  'app/api/user/addresses/route.ts',
  'app/api/user/profiles/route.ts',
  'app/api/user-assets/route.ts',
  'app/api/user-assets/confirm/route.ts',
]

const actorRoutes = [
  'app/api/community/posts/route.ts',
  'app/api/community/posts/[postId]/route.ts',
  'app/api/community/posts/[postId]/like/route.ts',
]

async function read(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8')
}

test('customer-owned routes derive authority from the server session', async () => {
  for (const route of sensitiveRoutes) {
    const source = await read(route)
    assert.match(source, /resolveCheckoutOwner\(request,/, `${route} must use the shared owner authority`)
    assert.doesNotMatch(
      source,
      /(?:const|let)\s+ownerType[^\n]*customerId\s*\?\s*['"]customer['"]\s*:\s*['"]anon['"]/,
      `${route} must not derive owner type from a caller-provided customerId`
    )
  }
})

test('caller-provided customer IDs are mismatch checks, never credentials', async () => {
  const ownerAuthority = await read('src/lib/checkout-owner.ts')
  assert.match(ownerAuthority, /createServerSupabase\(\)/)
  assert.match(ownerAuthority, /supabase\.auth\.getUser\(\)/)
  assert.match(ownerAuthority, /expectedCustomerId !== customer\.customerId/)
  assert.match(ownerAuthority, /Authentication required for this customer/)

  for (const route of [...sensitiveRoutes, ...actorRoutes]) {
    const source = await read(route)
    if (!/customerId/.test(source)) continue
    assert.match(
      source,
      /expectedCustomerId/,
      `${route} must pass customerId only as an expected identity`
    )
  }
})

test('community actor identity also follows the authenticated or anonymous session', async () => {
  for (const route of actorRoutes) {
    const source = await read(route)
    assert.match(source, /resolveCheckoutOwner\(request,/)
    assert.doesNotMatch(source, /actor_key:\s*`customer:\$\{customerId\}`/)
  }
})

test('job mutation scopes both the job and replacement face asset to the resolved owner', async () => {
  const source = await read('app/api/jobs/route.js')
  const patchSource = source.slice(source.indexOf('export async function PATCH'))

  assert.match(patchSource, /\.from\(['"]jobs['"]\)[\s\S]*\.eq\(['"]owner_type['"], filter\.owner_type\)[\s\S]*\.eq\(filter\.column, filter\.value\)/)
  assert.match(patchSource, /\.from\(['"]user_assets['"]\)[\s\S]*\.eq\(['"]owner_type['"], filter\.owner_type\)[\s\S]*\.eq\(filter\.column, filter\.value\)/)
})
