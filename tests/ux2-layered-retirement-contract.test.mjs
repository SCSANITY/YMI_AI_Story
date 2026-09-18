import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('mobile Product Intro scroll guide has no start/navigation action and respects reduced motion', async () => {
  const intro = await read('components/personalize/PersonalizeProductIntro.tsx')
  const handler = intro.match(/const scrollToPersonalize = \(\) => \{[\s\S]*?\n  \}/)?.[0] ?? ''
  assert.match(handler, /setGuideUsed\(true\)/)
  assert.match(handler, /scrollIntoView/)
  assert.match(handler, /prefers-reduced-motion: reduce/)
  assert.doesNotMatch(handler, /onStart|router|location|fetch|primaryAction/)
  assert.match(intro, /IntersectionObserver/)
  assert.match(intro, /observer\.disconnect\(\)/)
  assert.match(intro, /needsScrollGuide && !guideUsed[\s\S]*createPortal/)
  assert.match(intro, /safe-area-inset-bottom/)
  assert.match(intro, /md:hidden/)
  assert.match(intro, /document\.body/)
  assert.match(intro, /onClick=\{onStart\}/)
  assert.match(intro, /ref=\{personalizeButtonRef\}/)
  assert.match(await read('components/PersonalizePage.tsx'), /<PersonalizeProductIntro\s+key=\{bookID\}/)
})

test('all live edition UI and copy exclude the retired product and artwork', async () => {
  const [page, pricing, messages] = await Promise.all([
    read('components/PersonalizePage.tsx'), read('components/admin/CatalogPricingManager.tsx'),
    read('src/lib/i18n-messages.ts'),
  ])
  for (const source of [page, pricing, messages]) {
    assert.doesNotMatch(source, /Cloud Explorer|cloud-explorer|bookTypeDigital|included\.digital|Digital and hardcover/)
  }
  assert.match(page, /value: 'basic' as const/)
  assert.match(page, /value: 'supreme' as const/)
  await assert.rejects(access(new URL('../public/personalize-editions/cloud-explorer.svg', import.meta.url)))
})

test('retired edition validation precedes owner/database writes and payment session reuse', async () => {
  const [configuration, session, store, merge] = await Promise.all([
    read('app/api/creations/[creationId]/purchase-configuration/route.ts'),
    read('app/api/checkout/session/route.ts'), read('src/lib/package-pricing-store.ts'),
    read('app/api/customer/merge/route.ts'),
  ])
  assert.ok(configuration.indexOf('if (!packageType ||') < configuration.indexOf('owner = await resolveCheckoutOwner'))
  assert.ok(session.indexOf('edition_no_longer_available') < session.indexOf('stripe.checkout.sessions.retrieve'))
  assert.ok(session.indexOf('edition_no_longer_available') < session.indexOf('.update({'))
  assert.match(session, /!normalizeBookPackageType\(item\.package_type\)/)
  assert.doesNotMatch(session, /hasOnlyEbookItems/)
  assert.match(store, /if \(!packageType\)[\s\S]*unsupported book package/)
  assert.match(merge, /loadAuthoritativeCreationPackagePrice/)
  assert.doesNotMatch(merge, /mapProductType|price_at_purchase: item\./)
})

test('physical-only Checkout preserves address, ownership, shipping, and PDF lifecycle modules', async () => {
  const checkout = await read('app/checkout/page.tsx')
  assert.doesNotMatch(checkout, /checkoutItemRequiresShipping|digital-checkout-email|!requiresShipping/)
  assert.match(checkout, /const totalSteps = 2/)
  assert.match(checkout, /<AddressFormSection/)
  await Promise.all([
    access(new URL('../src/lib/finalPdfRelease.ts', import.meta.url)),
    access(new URL('../components/admin/final-review/PdfVersionReview.tsx', import.meta.url)),
  ])
})
