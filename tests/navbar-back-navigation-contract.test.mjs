import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('shared Navbar omits primary-page Back in the render tree, not after hydration', () => {
  const navbar = read('components/Navbar.tsx')

  assert.match(navbar, /import \{ isPrimaryNavigationRoute, layoutSegmentsToPathname \} from '@\/lib\/app-pathname'/)
  assert.match(navbar, /const pathname = layoutSegmentsToPathname\(useSelectedLayoutSegments\(\)\)/)
  assert.match(navbar, /const showBackButton = !isPrimaryNavigationRoute\(pathname\) && !isCheckoutRoute/)
  assert.match(navbar, /\{showBackButton && \([\s\S]*?pathname === '\/cart'/)
  assert.doesNotMatch(navbar, /\{pathname !== '\/' && !isCheckoutRoute && \(/)
  assert.doesNotMatch(navbar, /usePathname|suppressHydrationWarning/)
  assert.match(navbar, /if \(isPersonalizeRoute\) return null/)
})

test('the primary-page rule covers all current desktop, mobile and account destinations', () => {
  const navbar = read('components/Navbar.tsx')
  const userMenu = read('components/navbar/NavbarUserMenu.tsx')
  const rule = read('src/lib/app-pathname.ts')
  const paths = new Set([
    ...[...navbar.matchAll(/href="(\/[^"?#]*)"/g)].map(match => match[1]),
    ...[...userMenu.matchAll(/onNavigate\('(\/[^'?#]*)'\)/g)].map(match => match[1]),
  ])

  for (const pathname of paths) {
    if (pathname.startsWith('/admin/')) continue
    assert.ok(rule.includes(`'${pathname}'`), `missing primary header destination: ${pathname}`)
  }
})

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
