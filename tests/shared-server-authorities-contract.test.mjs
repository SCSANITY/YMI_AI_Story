import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

async function collectRouteSources(relativeDirectory) {
  const directory = path.join(root, relativeDirectory)
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = path.join(relativeDirectory, entry.name)
      if (entry.isDirectory()) return collectRouteSources(relativePath)
      return entry.name === 'route.ts' || entry.name === 'route.js' ? [relativePath] : []
    })
  )
  return nested.flat()
}

test('private JSON responses have one server-only no-store authority', async () => {
  const [helper, ...routes] = await Promise.all([
    read('src/lib/http-response.ts'),
    read('app/api/admin/customize-access/route.ts'),
    read('app/api/customize-access/route.ts'),
    read('app/api/internal/email/general-mail/cleanup/route.ts'),
    read('app/api/internal/email/inbound/process/route.ts'),
    read('app/api/internal/user-assets/cleanup/route.ts'),
    read('app/api/legal-content/route.ts'),
    read('app/api/webhooks/resend/route.ts'),
  ])

  assert.match(helper, /import ['"]server-only['"]/)
  assert.match(helper, /NextResponse\.json/)
  assert.match(helper, /private, no-store, max-age=0/)
  assert.match(helper, /response\.headers\.set\(['"]Cache-Control['"]/)
  for (const route of routes) {
    assert.match(route, /noStoreJson/)
    assert.doesNotMatch(route, /['"]Cache-Control['"]\s*:/)
  }
})

test('API routes share one fail-closed Supabase user authority', async () => {
  const helper = await read('src/lib/authenticated-user.ts')
  const routePaths = await collectRouteSources('app/api')
  const routeSources = await Promise.all(routePaths.map(async (routePath) => ({
    routePath: routePath.replaceAll('\\', '/'),
    source: await read(routePath.replaceAll('\\', '/')),
  })))
  const directAuthReads = routeSources
    .filter(({ source }) => /auth\.getUser\(\)/.test(source))
    .map(({ routePath }) => routePath)

  assert.match(helper, /import ['"]server-only['"]/)
  assert.match(helper, /supabase\.auth\.getUser\(\)/)
  assert.match(helper, /error \|\| !user\?\.id \? null : user/)
  assert.deepEqual(directAuthReads, [])

  for (const routePath of [
    'app/api/account/reward-vouchers/route.ts',
    'app/api/blog-posts/[postId]/like/route.ts',
    'app/api/blog-posts/route.ts',
    'app/api/checkout/vouchers/route.ts',
    'app/api/collaboration-leads/route.ts',
    'app/api/customer/merge/route.ts',
    'app/api/newsletter-subscribers/route.ts',
    'app/api/support/questions/route.ts',
    'app/api/user/account-profile/route.ts',
    'app/api/user/cookie-consent/route.ts',
  ]) {
    const route = routeSources.find((candidate) => candidate.routePath === routePath)
    assert.ok(route, `missing route source ${routePath}`)
    assert.match(route.source, /getAuthenticatedUser/)
  }
})

test('internal scheduled routes share one constant-time authorization authority', async () => {
  const [helper, secretCompare, ...routes] = await Promise.all([
    read('src/lib/internal-request-auth.ts'),
    read('src/lib/secret-compare.ts'),
    read('app/api/internal/cron/unpaid/route.ts'),
    read('app/api/internal/jobs/stats/route.ts'),
    read('app/api/internal/email/inbound/process/route.ts'),
    read('app/api/internal/email/general-mail/cleanup/route.ts'),
    read('app/api/internal/user-assets/cleanup/route.ts'),
  ])

  assert.match(helper, /import ['"]server-only['"]/)
  assert.match(helper, /INTERNAL_API_SECRET[\s\S]*CRON_SECRET/)
  assert.match(helper, /matchesSecret/)
  assert.match(secretCompare, /timingSafeEqual/)
  for (const route of routes) {
    assert.match(route, /isInternalRequestAuthorized/)
    assert.doesNotMatch(route, /function isAuthorized|matchesSecret/)
  }
})

test('customer-owned queries share the checkout owner scope authority', async () => {
  const [ownerStore, ...routes] = await Promise.all([
    read('src/lib/checkout-owner.ts'),
    read('app/api/my-books/route.ts'),
    read('app/api/my-books/[creationId]/reader/route.ts'),
    read('app/api/jobs/[jobId]/route.ts'),
    read('app/api/jobs/[jobId]/preview-url/route.ts'),
  ])

  assert.match(ownerStore, /export function scopeCheckoutOwnerQuery/)
  assert.match(ownerStore, /\.eq\(['"]owner_type['"], filter\.owner_type\)/)
  for (const route of routes) {
    assert.match(route, /scopeCheckoutOwnerQuery/)
    assert.doesNotMatch(route, /function buildOwnerScopedQuery|ownerFilter/)
  }
})
