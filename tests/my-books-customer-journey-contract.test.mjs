import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('My Books fails visibly instead of turning data errors into an empty library', async () => {
  const [page, route, purchaseState] = await Promise.all([
    read('app/my-books/page.tsx'),
    read('app/api/my-books/route.ts'),
    read('src/lib/purchase-state.ts'),
  ])

  assert.doesNotMatch(page, /res\.ok\s*\?\s*res\.json\(\)\s*:\s*\{\s*items:\s*\[\]\s*\}/)
  assert.match(page, /setLoadError\(t\('myBooks\.loadError'\)\)/)
  assert.match(page, /onClick=\{\(\) => void loadBooks\(\)\}/)
  assert.match(route, /Failed to load purchase state/)
  assert.match(purchaseState, /if \(cartItemsError\)/)
  assert.match(purchaseState, /if \(ordersError\)/)
  assert.match(purchaseState, /if \(finalJobsError\)/)
})

test('Buy Again starts checkout directly and cannot increment the active cart', async () => {
  const [reader, checkoutClient] = await Promise.all([
    read('app/my-books/[creationId]/OwnedBookReader.tsx'),
    read('src/lib/owned-creation-checkout-client.ts'),
  ])

  assert.match(reader, /startOwnedCreationCheckout/)
  assert.match(reader, /router\.push\(checkout\.checkoutHref\)/)
  assert.doesNotMatch(reader, /\baddToCart\b/)
  assert.match(reader, /checkoutInFlightRef\.current/)
  assert.match(checkoutClient, /items: \[\{ creationId, quantity: 1 \}\]/)
})

test('My Books preserves its return context and exposes actionable feedback', async () => {
  const [page, personalize, grid, switcher] = await Promise.all([
    read('app/my-books/page.tsx'),
    read('components/PersonalizePage.tsx'),
    read('app/my-books/MyBooksGrid.tsx'),
    read('app/my-books/MyBooksShelfSwitcher.tsx'),
  ])

  assert.match(page, /source: 'my-books'/)
  assert.match(personalize, /previewSource === 'my-books'/)
  assert.match(personalize, /router\.push\('\/my-books\?shelf=previews'\)/)
  assert.match(page, /myBooks\.addedToCart/)
  assert.match(page, /myBooks\.checkoutFailed/)
  assert.match(page, /myBooks\.deleteFailed/)
  assert.match(grid, /aria-label=\{t\('myBooks\.openPreview'/)
  assert.match(grid, /md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100/)
  assert.match(switcher, /activeDescription/)
})

test('physical-book page turns are keyboard controls and stop at the last spread', async () => {
  const pageContent = await read('components/personalize/PreviewBookPageContent.tsx')

  assert.match(pageContent, /type="button"\s+aria-label=\{nextPageLabel\}/)
  assert.match(pageContent, /type="button"\s+aria-label=\{previousPageLabel\}/)
  assert.match(pageContent, /\{canTurnNext \? \(/)
  assert.match(pageContent, /if \(!canTurnPrev\) return null/)
})
