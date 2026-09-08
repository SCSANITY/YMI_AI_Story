import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8')

test('the shared shell normalizes the root prerender path and server-renders consent deterministically', async () => {
  const shell = await read('components/AppShell.tsx')
  const navbar = await read('components/Navbar.tsx')

  assert.match(shell, /normalizeAppPathname\(usePathname\(\)\)/)
  assert.match(navbar, /normalizeAppPathname\(usePathname\(\)\)/)
  assert.match(shell, /CookieConsentBanner = dynamic/)
  assert.match(shell, /CookieConsentBanner = dynamic\([\s\S]{0,180}\{ ssr: true \}/)
})

test('public catalog covers use responsive optimization while private media stays isolated', async () => {
  const cover = await read('components/BookCardCover.tsx')
  const storagePolicy = await read('src/lib/storage-images.ts')
  const homeBanner = await read('components/HomePosterBanner.tsx')

  assert.match(cover, /shouldBypassNextImageOptimization\(src\)/)
  assert.match(storagePolicy, /\/storage\/v1\/object\/public\//)
  assert.match(storagePolicy, /isSupabaseStorageImage\(src\) && !isPublicSupabaseStorageImage\(src\)/)
  assert.match(homeBanner, /getImageProps/)
  assert.match(homeBanner, /srcSet=\{desktopSrcSet\}/)
  assert.doesNotMatch(homeBanner, /avoid the Vercel image optimizer/)
})

test('Hero ships device-sized silent media with a poster and visible initial headline', async () => {
  const hero = await read('components/Hero.tsx')
  const config = await read('next.config.ts')

  assert.match(hero, /poster="\/hero-poster\.webp"/)
  assert.match(hero, /media="\(max-width: 767px\)" src="\/hero-video-mobile-v1\.mp4"/)
  assert.match(hero, /src="\/hero-video-desktop-v1\.mp4"/)
  assert.doesNotMatch(hero, /src="\/hero-video\.mp4"/)
  assert.doesNotMatch(hero, /initial=\{\{ opacity: 0, y: 20 \}\}[\s\S]{0,160}hero\.titleLine/)
  assert.match(config, /max-age=31536000, immutable/)
})

test('consent initializes directly after hydration without waiting on unrelated global state', async () => {
  const banner = await read('components/CookieConsentBanner.tsx')
  const bootstrap = await read('components/CookieConsentBootstrap.tsx')
  const layout = await read('app/layout.tsx')
  const styles = await read('app/globals.css')

  assert.doesNotMatch(banner, /isHydrated/)
  assert.match(banner, /useState\(true\)/)
  assert.match(banner, /const stored = readStoredCookieConsent\(\)/)
  assert.match(banner, /setIsBannerVisible\(true\)/)
  assert.match(bootstrap, /COOKIE_CONSENT_STORAGE_KEY/)
  assert.match(bootstrap, /COOKIE_CONSENT_VERSION/)
  assert.match(bootstrap, /consent\.necessary === true/)
  assert.match(layout, /<CookieConsentBootstrap \/>/)
  assert.match(styles, /data-ymi-cookie-consent='stored'/)
})
