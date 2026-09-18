import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8')

test('Home moves the complete catalogue closer to Hero through responsive top padding only', async () => {
  const categories = await read('components/HomeBookCategories.tsx')
  const sectionClasses = categories.match(/<section className="([^"]+)"/)?.[1]

  assert.equal(sectionClasses, 'page-surface page-surface--flush-bottom relative pt-8 pb-10 md:pt-12 md:pb-14')
  assert.match(categories, /className="space-y-14 md:space-y-20"/)
  assert.match(categories, /mb-7 flex flex-col gap-4[^"\n]*md:mb-9/)
  assert.match(categories, /grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-8/)
  assert.match(categories, /relative left-1\/2 mt-10 mb-0 w-screen -translate-x-1\/2 md:mt-14/)
})

test('Home starts its catalogue with Brand New, without a collections intro or reserved wrapper', async () => {
  const page = await read('app/page.tsx')
  const categories = await read('components/HomeBookCategories.tsx')
  const messages = await read('src/lib/i18n-messages.ts')

  assert.match(page, /<Hero \/>\s*<HomeBookCategories banners=\{banners\} \/>/)
  assert.doesNotMatch(categories, /homeBooks\.(eyebrow|heading|subheading)|max-w-4xl text-center/)
  assert.doesNotMatch(messages, /'homeBooks\.(eyebrow|heading|subheading)'/)
  assert.match(categories, /const HOME_BOOK_CATEGORIES[^=]*=\s*\[\s*\{\s*titleKey: 'homeBooks\.category\.brandNew'/)
  assert.match(categories, /className="container[^"\n]*">\s*<div className="space-y-14 md:space-y-20">\s*\{HOME_BOOK_CATEGORIES\.map/)
  assert.match(categories, /<h2[^>]*>\s*\{t\(category\.titleKey\)\}\s*<\/h2>/)
  assert.match(categories, /\{t\(category\.descriptionKey\)\}/)
  assert.match(categories, /grid-cols-2[^"\n]*md:grid-cols-4/)
  assert.match(categories, /onClick=\{\(\) => handlePersonalize\(book\.bookID\)\}/)
  assert.match(categories, /onPrefetch=\{\(\) => prefetchCustomizeHref/)
  assert.match(categories, /toggleFavorite\(book\)/)
  assert.match(categories, /banners\.after_for_boys/)
  assert.match(categories, /banners\.after_in_discount/)
})

test('the shared shell derives route shape from layout segments and server-renders consent deterministically', async () => {
  const shell = await read('components/AppShell.tsx')
  const navbar = await read('components/Navbar.tsx')
  const layout = await read('app/layout.tsx')

  assert.match(shell, /layoutSegmentsToPathname\(useSelectedLayoutSegments\(\)\)/)
  assert.match(navbar, /layoutSegmentsToPathname\(useSelectedLayoutSegments\(\)\)/)
  assert.doesNotMatch(shell, /usePathname/)
  assert.doesNotMatch(navbar, /usePathname/)
  assert.match(shell, /CookieConsentBanner = dynamic/)
  assert.match(shell, /CookieConsentBanner = dynamic\([\s\S]{0,180}\{ ssr: true \}/)
  assert.match(layout, /suppressHydrationWarning/)
  assert.doesNotMatch(shell, /suppressHydrationWarning/)
  assert.doesNotMatch(navbar, /suppressHydrationWarning/)
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
  const footer = await read('components/Footer.tsx')
  const config = await read('next.config.ts')
  const vercel = await read('vercel.json')

  assert.match(hero, /poster="\/hero-poster-v2\.webp"/)
  assert.match(hero, /ReactDOM\.preload\('\/hero-poster-v2\.webp',[\s\S]{0,120}fetchPriority: 'high'/)
  assert.match(hero, /window\.matchMedia\('\(max-width: 767px\)'\)/)
  assert.match(hero, /\? '\/hero-video-mobile-v1\.mp4'/)
  assert.match(hero, /: '\/hero-video-desktop-v1\.mp4'/)
  assert.match(hero, /src=\{videoSrc \?\? undefined\}/)
  assert.doesNotMatch(hero, /<source/)
  assert.doesNotMatch(hero, /src="\/hero-video\.mp4"/)
  assert.doesNotMatch(hero, /initial=\{\{ opacity: 0, y: 20 \}\}[\s\S]{0,160}hero\.titleLine/)
  assert.match(config, /max-age=31536000, immutable/)
  assert.match(config, /hero-poster-v2\.webp/)
  assert.doesNotMatch(vercel, /hero-video\.mp4|hero-poster/)
  assert.match(footer, /src="\/logo\.webp"[\s\S]{0,160}sizes="47px"/)
})

test('consent initializes directly after hydration without waiting on unrelated global state', async () => {
  const banner = await read('components/CookieConsentBanner.tsx')
  const bootstrap = await read('components/CookieConsentBootstrap.tsx')
  const layout = await read('app/layout.tsx')
  const styles = await read('app/globals.css')

  assert.doesNotMatch(banner, /isHydrated/)
  assert.match(banner, /useState\(true\)/)
  assert.match(banner, /const stored = readStoredCookieConsent\(\)/)
  assert.match(banner, /setIsBannerVisible\(!wasCookieConsentDismissedForSession\(\)\)/)
  assert.match(bootstrap, /COOKIE_CONSENT_STORAGE_KEY/)
  assert.match(bootstrap, /COOKIE_CONSENT_DISMISSED_KEY/)
  assert.match(bootstrap, /COOKIE_CONSENT_VERSION/)
  assert.match(bootstrap, /consent\.necessary === true/)
  assert.match(layout, /<CookieConsentBootstrap \/>/)
  assert.match(styles, /data-ymi-cookie-consent='stored'/)
  assert.match(styles, /ymi-cookie-consent-enter[\s\S]*800ms forwards/)
  assert.match(styles, /prefers-reduced-motion: reduce/)
})
