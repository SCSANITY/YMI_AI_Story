import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('order references are validated and bound without raw PostgREST or filters', async () => {
  const [ownerStore, orderRoute] = await Promise.all([
    read('src/lib/checkout-owner.ts'),
    read('app/api/orders/[orderId]/route.ts'),
  ])

  assert.match(ownerStore, /export function parseOrderReference/)
  assert.match(ownerStore, /UUID_PATTERN/)
  assert.match(ownerStore, /DISPLAY_ID_PATTERN/)
  assert.match(ownerStore, /\.eq\(reference\.column, reference\.value\)/)
  assert.doesNotMatch(ownerStore, /\.or\(`/)
  assert.match(orderRoute, /parseOrderReference\(rawOrderId\)/)
  assert.match(orderRoute, /\.eq\(orderReference\.column, orderReference\.value\)/)
  assert.doesNotMatch(orderRoute, /\.or\(`/)
})

test('guest OTP generation uses a cryptographic integer source', async () => {
  const requestOtp = await read('app/api/guest/request-otp/route.ts')

  assert.match(requestOtp, /import \{ randomInt \} from 'node:crypto'/)
  assert.match(requestOtp, /randomInt\(100000, 1000000\)/)
  assert.doesNotMatch(requestOtp, /Math\.random/)
})

test('private customer API families receive a centralized no-store policy', async () => {
  const nextConfig = await read('next.config.ts')

  assert.match(nextConfig, /private, no-store, max-age=0/)
  for (const route of [
    '/api/account/:path*',
    '/api/community/:path*',
    '/api/creations/:path*',
    '/api/jobs/:path*',
    '/api/my-books/:path*',
    '/api/orders/:path*',
    '/api/user/:path*',
    '/api/user-assets/:path*',
  ]) {
    assert.ok(nextConfig.includes(`'${route}'`), `missing private no-store route ${route}`)
  }
})

test('every Final page mutation entry point rejects released jobs', async () => {
  const routes = await Promise.all([
    read('app/api/admin/final-jobs/[finalJobId]/pages/[pageIndex]/approve/route.ts'),
    read('app/api/admin/final-jobs/[finalJobId]/pages/[pageIndex]/needs-fix/route.ts'),
    read('app/api/admin/final-jobs/[finalJobId]/pages/[pageIndex]/rerun/route.ts'),
    read('app/api/admin/final-jobs/[finalJobId]/pages/[pageIndex]/upload-replacement/route.ts'),
    read('app/api/admin/final-jobs/[finalJobId]/approve-all-pages/route.ts'),
  ])

  for (const source of routes) {
    assert.match(source, /isFinalJobReleased\(finalJob\)/)
    assert.match(source, /Released Final jobs cannot be modified/)
    assert.match(source, /status: 409/)
  }
})

test('cart and order creation reject non-positive or non-integer quantities', async () => {
  const [quantityStore, cartRoute, orderStart] = await Promise.all([
    read('src/lib/cart-quantity.ts'),
    read('app/api/cart/route.ts'),
    read('app/api/orders/start/route.ts'),
  ])

  assert.match(quantityStore, /Number\.isInteger\(quantity\)/)
  assert.match(quantityStore, /quantity < 1/)
  assert.match(cartRoute, /parseCartItemQuantity\(body\?\.quantity\)/)
  assert.match(cartRoute, /parseCartItemQuantity\(body\.quantity\)/)
  assert.match(orderStart, /parseCartItemQuantity\(item\?\.quantity\)/)
})

test('internal route secrets use constant-time comparison', async () => {
  const [secretStore, ...routes] = await Promise.all([
    read('src/lib/secret-compare.ts'),
    read('app/api/internal/worker-callback/route.ts'),
    read('app/api/internal/cron/unpaid/route.ts'),
    read('app/api/internal/jobs/stats/route.ts'),
    read('app/api/internal/email/inbound/process/route.ts'),
  ])

  assert.match(secretStore, /timingSafeEqual/)
  for (const route of routes) assert.match(route, /matchesSecret/)
})

test('raw face voice and avatar signed URLs expire within one hour', async () => {
  const [storagePolicy, assetsRoute, confirmRoute, profileRoute] = await Promise.all([
    read('src/lib/userAssetsStorage.ts'),
    read('app/api/user-assets/route.ts'),
    read('app/api/user-assets/confirm/route.ts'),
    read('app/api/user/account-profile/route.ts'),
  ])

  assert.match(storagePolicy, /USER_ASSET_SIGN_TTL_SECONDS = 60 \* 60/)
  for (const route of [assetsRoute, confirmRoute, profileRoute]) {
    assert.match(route, /USER_ASSET_SIGN_TTL_SECONDS/)
    assert.doesNotMatch(route, /createSignedUrl\([^)]*,\s*60 \* 60 \* 24\)/s)
  }
})
