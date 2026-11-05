import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

function load(file) {
  const fixtureModule = { exports: {} }
  vm.runInNewContext(ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: fixtureModule, exports: fixtureModule.exports,
    require() { return new Proxy({}, { get: (_, key) => key }) },
  })
  return fixtureModule.exports
}

const core = load('src/lib/multi-book-offer-core.ts')
const {
  capMultiBookOfferToHeadroom,
  computeMultiBookDiscountUsd,
  computeMultiBookSubtotalUsd,
  computeMultiBookTotalQuantity,
  getMultiBookOfferBadgeLabel,
  normalizeMultiBookOfferRule,
} = core

const PERCENT_20 = { enabled: true, effectType: 'percentage', value: 20, minItems: 2 }
const FIXED_5 = { enabled: true, effectType: 'fixed_amount', value: 5, minItems: 2 }

test('engine matrix: threshold, quantity counting, percentage and fixed modes', () => {
  const one = [{ quantity: 1, unitPriceUsd: 29.99 }]
  const two = [{ quantity: 1, unitPriceUsd: 29.99 }, { quantity: 1, unitPriceUsd: 29.99 }]
  const qty2 = [{ quantity: 2, unitPriceUsd: 29.99 }]

  assert.equal(computeMultiBookDiscountUsd(one, PERCENT_20), 0)
  assert.equal(computeMultiBookDiscountUsd(two, PERCENT_20), 12) // 59.98 * 0.2 = 11.996 -> 12
  // an item with quantity=2 counts as two books
  assert.equal(computeMultiBookTotalQuantity(qty2), 2)
  assert.equal(computeMultiBookDiscountUsd(qty2, PERCENT_20), 12)
  // fixed mode caps at the subtotal
  assert.equal(computeMultiBookDiscountUsd(two, { ...FIXED_5, value: 500 }), 59.98)
  assert.equal(computeMultiBookDiscountUsd(two, FIXED_5), 5)
  // disabled or empty inputs yield nothing
  assert.equal(computeMultiBookDiscountUsd(two, { ...PERCENT_20, enabled: false }), 0)
  assert.equal(computeMultiBookDiscountUsd([], PERCENT_20), 0)
  assert.equal(computeMultiBookDiscountUsd(two, null), 0)
})

test('engine matrix: percentage rounding and per-line subtotal parity', () => {
  const items = [{ quantity: 1, unitPriceUsd: 33.33 }, { quantity: 1, unitPriceUsd: 27.33 }]
  assert.equal(computeMultiBookSubtotalUsd(items), 60.66)
  assert.equal(computeMultiBookDiscountUsd(items, PERCENT_20), 12.13) // 12.132 -> 12.13
  // exactly at the threshold applies
  const exact = [{ quantity: 1, unitPriceUsd: 10 }, { quantity: 1, unitPriceUsd: 10 }]
  assert.equal(computeMultiBookDiscountUsd(exact, { ...PERCENT_20, minItems: 2 }), 4)
  // one below the threshold does not
  assert.equal(computeMultiBookDiscountUsd([{ quantity: 1, unitPriceUsd: 10 }], { ...PERCENT_20, minItems: 2 }), 0)
})

test('engine matrix: input normalization is finite, non-negative, floor-free', () => {
  const junk = [{ quantity: Number.NaN, unitPriceUsd: Number.NaN }, { quantity: -3, unitPriceUsd: -10 }]
  assert.equal(computeMultiBookDiscountUsd(junk, PERCENT_20), 0)
  const mixed = [{ quantity: 1, unitPriceUsd: 20 }, { quantity: 'bad', unitPriceUsd: 'bad' }]
  assert.equal(computeMultiBookDiscountUsd(mixed, PERCENT_20), 4)
})

test('stacked cap: the offer never exceeds the headroom after product discounts', () => {
  // subtotal 100, product discount 90, raw offer 20 -> effective 10
  assert.equal(capMultiBookOfferToHeadroom(20, 100, 90), 10)
  assert.equal(capMultiBookOfferToHeadroom(20, 100, 0), 20)
  assert.equal(capMultiBookOfferToHeadroom(20, 100, 100), 0)
  assert.equal(capMultiBookOfferToHeadroom(20, 100, 130), 0)
  assert.equal(capMultiBookOfferToHeadroom(Number.NaN, 100, 0), 0)
})

test('rule normalization accepts snake/camel rows and rejects malformed shapes', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(normalizeMultiBookOfferRule({ enabled: true, effect_type: 'percentage', value: '20', min_items: 2 }))), PERCENT_20)
  assert.equal(normalizeMultiBookOfferRule({ enabled: true, effectType: 'percentage', value: 120, minItems: 2 }), null)
  assert.equal(normalizeMultiBookOfferRule({ enabled: true, effectType: 'nonsense', value: 20, minItems: 2 }), null)
  assert.equal(normalizeMultiBookOfferRule({ enabled: true, effectType: 'percentage', value: 0, minItems: 2 }), null)
  assert.equal(normalizeMultiBookOfferRule(null), null)
  assert.equal(normalizeMultiBookOfferRule({ enabled: false }), null)
  assert.equal(getMultiBookOfferBadgeLabel(PERCENT_20), '20% OFF')
  assert.equal(getMultiBookOfferBadgeLabel(FIXED_5), '$5.00 OFF')
  assert.equal(getMultiBookOfferBadgeLabel(null), '')
})

test('module boundary: the client-safe core never pulls in server dependencies', async () => {
  const source = read('src/lib/multi-book-offer-core.ts')
  assert.doesNotMatch(source, /supabaseAdmin|multi-book-offer(?!-core)|process\.env/)

  const checkoutPage = read('app/checkout/page.tsx')
  assert.match(checkoutPage, /from '@\/lib\/multi-book-offer-core'/)
  assert.doesNotMatch(checkoutPage, /from '@\/lib\/multi-book-offer'/)

  const banner = read('components/LaunchOfferBanner.tsx')
  assert.doesNotMatch(banner, /supabaseAdmin|multi-book-offer'/)
})

test('server session route persists and allocates one effective amount', async () => {
  const route = read('app/api/checkout/session/route.ts')

  assert.match(route, /getMultiBookOfferRule\(\)/)
  assert.match(route, /capMultiBookOfferToHeadroom\(\s*computeMultiBookDiscountUsd\(multiBookItems, multiBookRule\),\s*multiBookSubtotalUsd,\s*discountSummary\.productDiscountAmountUsd\s*\)/)
  assert.match(route, /multi_book_discount_amount_usd: multiBookDiscountUsd/)
  // single allocation path: product instruments + the capped offer together
  assert.match(route, /allocateProductDiscountToLineItems\([\s\S]*?discountSummary\.productDiscountAmountUsd \+ multiBookDiscountUsd\s*\)/)
  // Stripe session + payment intent metadata carry the same effective amount
  assert.equal((route.match(/multi_book_discount_amount_usd: String\(multiBookDiscountUsd \|\| 0\)/g) || []).length, 2)
})

test('checkout fingerprint snapshot covers the frozen offer column', () => {
  const lock = read('src/lib/checkout-session-lock.ts')
  assert.match(lock, /multi_book_discount_amount_usd/)
  assert.match(lock, /multiBookDiscount: normalizedNumber\(orderRow\.multi_book_discount_amount_usd\)/)
})

test('admin route is singleton-keyed and invalidates the ISR home page', () => {
  const admin = read('app/api/admin/multi-book-offer/route.ts')
  assert.equal((admin.match(/singleton_key', MULTI_BOOK_OFFER_SINGLETON_KEY/g) || []).length, 2)
  assert.match(admin, /revalidatePath\('\/', 'page'\)/)
  assert.match(admin, /value <= 0/)
  assert.match(admin, /value > 100/)
  assert.match(admin, /minItems < 2/)

  const migration = read('../database/migrations/20261105_224500_web_uiux_033_multi_book_offer.sql')
  assert.match(migration, /UNIQUE \(singleton_key\)/)
  assert.match(migration, /ON CONFLICT \(singleton_key\) DO NOTHING/)
  assert.match(migration, /ADD COLUMN multi_book_discount_amount_usd numeric NOT NULL DEFAULT 0/)
})

test('checkout client recalculates with the same effective cap', () => {
  const page = read('app/checkout/page.tsx')
  assert.match(page, /capMultiBookOfferToHeadroom\(\s*computeMultiBookDiscountUsd\(multiBookItems, multiBookRule\),\s*multiBookSubtotalUsd,\s*discountTotalUsd\s*\)/)
  assert.match(page, /total - discountTotalUsd - multiBookDiscountUsd/)
  assert.match(page, /fetch\('\/api\/multi-book-offer'/)

  const panel = read('app/checkout/CheckoutSummaryPanel.tsx')
  assert.match(panel, /checkout\.multiBookOffer/)
  assert.match(panel, /multiBookDiscountTotalUsd > 0/)
})

test('home banner renders server-side with first-paint geometry', () => {
  const home = read('app/page.tsx')
  assert.match(home, /getMultiBookOfferRule\(\)\.catch\(\(\) => null\)/)
  assert.match(home, /<LaunchOfferBanner rule=\{multiBookRule\} \/>/)

  const banner = read('components/LaunchOfferBanner.tsx')
  assert.match(banner, /if \(!rule\?\.enabled\) return null/)
  assert.match(banner, /--launch-banner-h:36px/)
  assert.match(banner, /--launch-banner-h:32px/)

  const navbar = read('components/Navbar.tsx')
  assert.match(navbar, /top-\[var\(--launch-banner-h,0px\)\]/)

  const hero = read('components/Hero.tsx')
  assert.equal((hero.match(/var\(--launch-banner-h,0px\)/g) || []).length, 4)
})
