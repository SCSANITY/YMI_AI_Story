import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')

test('catalogue distinguishes unresolved, failed, and genuinely empty states', async () => {
  const [catalog, list] = await Promise.all([
    read('components/useBookCatalog.ts'),
    read('components/BookList.tsx'),
  ])

  assert.match(catalog, /useState\(Boolean\(cachedCatalog\)\)/)
  assert.match(catalog, /const retry = useCallback/)
  assert.match(list, /showInitialCatalogLoading/)
  assert.match(list, /showCatalogError/)
  assert.match(list, /showResolvedEmpty/)
  assert.ok(list.indexOf('showInitialCatalogLoading ?') < list.indexOf('showResolvedEmpty ?'))
})

test('private Preview access failures stop polling and never impersonate generation', async () => {
  const [jobs, controller, page, accessCover] = await Promise.all([
    read('src/services/jobs.ts'),
    read('components/personalize/usePreviewController.ts'),
    read('components/PersonalizePage.tsx'),
    read('components/personalize/PreviewAccessCover.tsx'),
  ])

  assert.match(jobs, /\[401, 403, 404\]\.includes\(error\.status\)/)
  assert.match(controller, /isTerminalJobAccessError\(watchError\)/)
  assert.match(controller, /updatePreviewAccess\(jobId, 'unavailable'\)/)
  assert.match(page, /isPreviewUnavailable[\s\S]*PreviewAccessCover/)
  assert.match(page, /isPreviewRestoring[\s\S]*mode="restoring"/)
  assert.match(accessCover, /data-preview-access-state=\{mode\}/)
  assert.doesNotMatch(accessCover, /countdown|role="timer"/)
})

test('Preview purchase gives immediate protected handoff and Checkout owns a route shell', async () => {
  const [page, overlays, loadingRoute, loadingShell, checkout] = await Promise.all([
    read('components/PersonalizePage.tsx'),
    read('components/personalize/PersonalizeOverlays.tsx'),
    read('app/checkout/loading.tsx'),
    read('app/checkout/CheckoutLoadingShell.tsx'),
    read('app/checkout/page.tsx'),
  ])

  assert.match(page, /setCheckoutTransitionPhase\('preparing'\)/)
  assert.match(page, /setCheckoutTransitionPhase\('securing'\)/)
  assert.match(page, /setCheckoutTransitionPhase\('opening'\)/)
  assert.match(overlays, /data-checkout-transition=\{checkoutTransitionPhase\}/)
  assert.match(loadingRoute, /<CheckoutLoadingShell \/>/)
  assert.match(loadingShell, /data-checkout-loading-shell="true"/)
  assert.match(checkout, /<Suspense fallback=\{<CheckoutPageFallback \/>\}>/)
  assert.match(checkout, /<AddressFormSection/)
})

test('mobile Checkout address fields prevent browser auto-zoom without changing desktop density', async () => {
  const address = await read('app/checkout/AddressFormSection.tsx')
  const inputs = address.match(/<input[\s\S]*?>/g) ?? []
  const addressInputs = inputs.filter((input) => !input.includes('type="checkbox"'))

  assert.ok(addressInputs.length >= 10)
  addressInputs.forEach((input) => {
    assert.match(input, /text-base/)
    assert.match(input, /md:text-sm/)
  })
})
