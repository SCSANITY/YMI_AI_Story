import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readSource = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('direct Preview checkout carries only the generated personalized cover', async () => {
  const source = await readSource('components/PersonalizePage.tsx')

  assert.match(
    source,
    /const checkoutPreviewCoverUrl = String\([\s\S]*?previewUrl \|\| previewPages\[0\] \|\| ''[\s\S]*?\)\.trim\(\)/
  )
  assert.match(source, /const checkoutBook = \{[\s\S]*?coverUrl: checkoutPreviewCoverUrl,[\s\S]*?\}/)
  assert.match(source, /book: checkoutBook,[\s\S]*?coverStatus: checkoutPreviewCoverUrl \? 'ready' as const : 'pending' as const/)
  assert.doesNotMatch(source, /const checkoutItem = existingItem \?[\s\S]*?: \{[\s\S]*?book: resolvedBook,/)
})

test('purchase surfaces refuse to display a template cover as a personalized cover', async () => {
  const [policy, checkout, cart, miniCart, context] = await Promise.all([
    readSource('src/lib/cart-cover.ts'),
    readSource('app/checkout/page.tsx'),
    readSource('app/cart/CartItemsList.tsx'),
    readSource('components/cart/MiniCart.tsx'),
    readSource('contexts/GlobalContext.tsx'),
  ])

  assert.match(policy, /if \(item\.coverStatus !== 'ready'\) return null/)
  assert.match(checkout, /resolveCheckoutItemCoverUrl = resolveCartItemPreviewCover/)
  assert.match(checkout, /resolveCheckoutItemCoverStatus = resolveCartItemPreviewCoverStatus/)
  assert.match(cart, /src=\{resolveCartItemPreviewCover\(item\)\}/)
  assert.match(cart, /status=\{resolveCartItemPreviewCoverStatus\(item\)\}/)
  assert.match(miniCart, /src=\{resolveCartItemPreviewCover\(item\)\}/)
  assert.match(miniCart, /status=\{resolveCartItemPreviewCoverStatus\(item\)\}/)
  assert.match(context, /coverStatus: previewCoverUrl \? 'ready' : 'pending'/)
})
