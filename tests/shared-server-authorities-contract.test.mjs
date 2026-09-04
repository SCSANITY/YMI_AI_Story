import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('private JSON responses have one server-only no-store authority', async () => {
  const helper = await read('src/lib/http-response.ts')

  assert.match(helper, /import ['"]server-only['"]/)
  assert.match(helper, /NextResponse\.json/)
  assert.match(helper, /private, no-store, max-age=0/)
  assert.match(helper, /response\.headers\.set\(['"]Cache-Control['"]/)
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
