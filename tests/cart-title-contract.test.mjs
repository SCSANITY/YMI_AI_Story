import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cartItemSurfaces = [
  'app/checkout/CheckoutItemsSection.tsx',
  'app/cart/CartItemsList.tsx',
  'components/cart/MiniCart.tsx',
]

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('all cart-item surfaces derive personalized display titles', async () => {
  for (const surface of cartItemSurfaces) {
    const source = await read(surface)

    assert.match(
      source,
      /import\s+\{\s*resolveCartItemDisplayTitle\s*\}\s+from\s+['"]@\/lib\/personalized-book-title['"]/,
      `${surface} must import the shared cart-item title resolver`
    )
    assert.match(
      source,
      /resolveCartItemDisplayTitle\s*\(\s*item\s*\)/,
      `${surface} must derive its displayed title from the CartItem facts`
    )
    assert.doesNotMatch(
      source,
      /\bitem\.book\.title\b/,
      `${surface} must not render the raw template title for a personalized cart item`
    )
  }
})
