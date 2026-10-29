import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')

test('proxy uses local claims verification and the default helper remains remote', () => {
  const proxy = read('proxy.ts')
  const helper = read('src/lib/authenticated-user.ts')
  assert.match(proxy, /auth\.getClaims\(\)/)
  assert.doesNotMatch(proxy, /auth\.getUser\(\)/)
  assert.match(helper, /auth\.getUser\(\)/)
})

test('the explicit claims read allowlist opts into claims verification', () => {
  const routes = [
    'app/api/favourites/route.ts',
    'app/api/orders/route.ts',
    'app/api/jobs/[jobId]/route.ts',
    'app/api/jobs/[jobId]/preview-state/route.ts',
    'app/api/jobs/[jobId]/preview-url/route.ts',
    'app/api/creations/[creationId]/route.ts',
    'app/api/creations/resolve/route.ts',
    'app/api/my-books/route.ts',
    'app/api/my-books/[creationId]/reader/route.ts',
    'app/api/user/notice-counts/route.ts',
    'app/api/cart/route.ts',
    'app/api/community/posts/route.ts',
    'app/api/community/posts/[postId]/route.ts',
  ]
  for (const route of routes) {
    assert.match(read(route), /verification:\s*'claims'/, route)
  }
})

test('account profile and cart keep mutations on remote verification', () => {
  const profile = read('app/api/user/account-profile/route.ts')
  const cart = read('app/api/cart/route.ts')
  assert.match(profile, /export async function GET\(\)[\s\S]*?getAuthenticatedClaims\(\)/)
  assert.match(profile, /export async function PATCH\([\s\S]*?getAuthenticatedUser\(\)/)
  assert.match(cart, /export async function GET\([\s\S]*?verification:\s*'claims'/)
  assert.doesNotMatch(cart, /export async function POST\([\s\S]*?verification:\s*'claims'/)
})

test('sensitive administration and mutation helpers retain getUser verification', () => {
  const admin = read('src/lib/adminAuth.ts')
  const checkout = read('src/lib/checkout-owner.ts')
  assert.match(admin, /getAuthenticatedUser\(/)
  assert.match(checkout, /verification \?\? 'remote'/)
  assert.match(checkout, /verification === 'claims'/)
})
