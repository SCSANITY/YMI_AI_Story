import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('Customize reuses the global account menu while durable Preview versions survive navigation', () => {
  const personalizeHeader = read('components/personalize/PersonalizeHeader.tsx')
  const personalizePage = read('components/PersonalizePage.tsx')
  const globalMenu = read('components/navbar/NavbarUserMenu.tsx')

  assert.match(personalizeHeader, /import \{ NavbarUserMenu \}/)
  assert.match(personalizeHeader, /<NavbarUserMenu/)
  assert.doesNotMatch(personalizeHeader, /<Package|<LogOut|labels\.myOrders|labels\.logOut/)
  assert.match(personalizeHeader, /style=\{\{ zIndex: isUserMenuOpen \|\| isCartOpen \? 150 : 50 \}\}/)

  assert.match(personalizePage, /onNavigate=\{\(path\) => void navigateAwayFromPreview\(path\)\}/)
  assert.doesNotMatch(personalizePage, /cleanupCurrentPreviewVariantSession/)

  for (const destination of ['/account', '/favorites', '/orders', '/my-books', '/admin/finals']) {
    assert.match(globalMenu, new RegExp(destination.replace('/', '\\/')))
  }
  assert.match(globalMenu, /onOpenRewards/)
  assert.match(globalMenu, /onLogout/)
})
