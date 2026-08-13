import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('Navbar separates Home logo navigation from ordinary Back history', () => {
  const navbar = read('components/Navbar.tsx')

  assert.match(navbar, /const handleDefaultBackClick = useCallback/)
  assert.match(navbar, /window\.history\.back\(\)/)
  assert.match(navbar, /window\.addEventListener\('popstate', handleBackTraversal, \{ once: true \}\)/)
  assert.ok(
    navbar.indexOf("window.addEventListener('popstate', handleBackTraversal, { once: true })")
      < navbar.indexOf('window.history.back()'),
    'query-only history traversal must register its one-shot completion listener before Back',
  )
  assert.match(navbar, /onClick=\{handleDefaultBackClick\}/)
  assert.doesNotMatch(navbar, /<Link href="\/" onClick=\{\(event\) => handlePlainLinkClick\(event, '\/'\)\} className="mr-2/)
  assert.match(navbar, /<Link[\s\S]*?href="\/"[\s\S]*?logo\.webp/)
})

test('Cart keeps its validated Preview return and otherwise uses ordinary Back', () => {
  const navbar = read('components/Navbar.tsx')
  const cartNavigation = read('src/lib/cart-navigation.ts')

  assert.match(navbar, /resolveCartBackNavigation/)
  assert.match(navbar, /navigation\.method === 'history'/)
  assert.match(navbar, /handleDefaultBackClick\(\)/)
  assert.match(cartNavigation, /if \(!returnPath\) return \{ href: '\/', method: 'history' \}/)
  assert.match(cartNavigation, /method: 'replace'/)
})
