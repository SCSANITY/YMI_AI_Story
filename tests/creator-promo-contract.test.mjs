import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('creator promo creation uses the fixed five-dollar any-order policy', async () => {
  const policy = await read('src/lib/creator-promo-policy.ts')
  const creatorRoute = await read('app/api/creator-promo/my-code/route.ts')
  const adminRoute = await read('app/api/admin/creator-promo-config/route.ts')

  assert.match(policy, /CREATOR_PROMO_DISCOUNT_USD\s*=\s*5/)
  assert.match(policy, /CREATOR_PROMO_FIRST_ORDER_ONLY\s*=\s*false/)
  assert.match(creatorRoute, /effect_config:\s*\{\s*amount_usd:\s*CREATOR_PROMO_DISCOUNT_USD\s*\}/)
  assert.match(creatorRoute, /first_order_only:\s*CREATOR_PROMO_FIRST_ORDER_ONLY/)
  assert.match(adminRoute, /discount_amount_usd:\s*CREATOR_PROMO_DISCOUNT_USD/)
  assert.match(adminRoute, /first_order_only:\s*CREATOR_PROMO_FIRST_ORDER_ONLY/)
  assert.doesNotMatch(adminRoute, /body\.discountAmountUsd|body\.firstOrderOnly/)
})

test('public and Admin creator promo surfaces explain the non-self-use policy', async () => {
  const messages = await read('src/lib/i18n-messages.ts')
  const collaboration = await read('app/collaboration/CreatorPromoSection.tsx')
  const adminControl = await read('components/admin/sections/service/CreatorPromoControl.tsx')

  assert.match(messages, /'collaboration\.creatorPromoDiscountValue': '\$5 OFF'/)
  assert.match(messages, /collaboration\.creatorPromoSelfUse/)
  assert.match(messages, /cannot use your own creator code/)
  assert.match(messages, /share\.promoTemplate/)
  assert.match(messages, /save \$5 on your order/)
  assert.doesNotMatch(messages, /special discount on your first order/)
  assert.match(collaboration, /t\('collaboration\.creatorPromoSelfUse'\)/)
  assert.match(adminControl, /\$5 USD per valid order/)
  assert.match(adminControl, /Any order \/ owner excluded/)
  assert.doesNotMatch(adminControl, /type="number"|First order only/)
})
