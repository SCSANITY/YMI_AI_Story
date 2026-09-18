import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8')

test('mobile Hero is edge-to-edge and content-height while desktop keeps its full-viewport scene', async () => {
  const hero = await read('components/Hero.tsx')

  assert.equal((hero.match(/<video\b/g) ?? []).length, 1)
  assert.match(hero, /relative w-full md:min-h-\[100svh\] md:bg-transparent \$\{styles.mobileHero\}/)
  assert.match(hero, /className="absolute inset-x-0 top-16 aspect-video w-full bg-\[#f4d5bd\] object-cover md:inset-0 md:h-full md:bg-\[#f7e2d0\]"/)
  assert.match(hero, /h-\[calc\(4rem\+56\.25vw\)\] shrink-0 md:hidden/)
  assert.match(hero, /className="hidden flex-1 md:block"/)
  assert.match(hero, /md:text-\[clamp\(2\.4rem,5\.5vw,5rem\)\]/)
  assert.doesNotMatch(hero, /minHeight: '100svh'|min-h-\[330px\]|top-24|w-\[calc\(100%-2rem\)\]|object-contain/)
})

test('Hero facts occupy no mobile space while all six desktop bubbles and motion remain', async () => {
  const hero = await read('components/Hero.tsx')

  assert.equal((hero.match(/labelKey: 'hero\.facts\./g) ?? []).length, 6)
  assert.match(hero, /aria-label="YMI Story product highlights"/)
  const highlightsClasses = hero.match(/aria-label="YMI Story product highlights"[\s\S]*?className="([^"]+)"/)?.[1]
  assert.equal(highlightsClasses, 'hidden w-full text-left md:mt-6 md:flex md:max-w-6xl md:flex-wrap md:items-center md:justify-center md:gap-3 lg:flex-nowrap lg:gap-2.5')
  assert.doesNotMatch(hero, /grid-cols-2|gap-x-4 gap-y-2|max-md:!opacity-100/)
  assert.match(hero, /style=\{\{ paddingBottom: 'clamp\(22px, 3vh, 40px\)' \}\}/)
  assert.match(hero, /setFloatFacts\(!mobileQuery\.matches && !prefersReducedMotion\)/)
  assert.match(hero, /mobileQuery\.addEventListener\('change', updateFactMotion\)/)
  assert.match(hero, /mobileQuery\.removeEventListener\('change', updateFactMotion\)/)
  assert.match(hero, /animate=\{!floatFacts/)
  assert.match(hero, /repeat: floatFacts \? Infinity : 0/)
  assert.match(hero, /delay: floatFacts \? floatDelay : 0/)
  assert.match(hero, /duration: floatFacts \? 3\.8 \+ \(index % 3\) \* 0\.45 : 0/)
  assert.match(hero, /min-h-8[^"\n]*md:min-h-\[4\.6rem\][^"\n]*md:backdrop-blur-xl/)
  assert.equal((hero.match(/bubbleClass: 'md:rounded-/g) ?? []).length, 6)
  assert.match(hero, /onClick=\{goToBooks\}/)
  assert.match(hero, /const goToBooks = \(\) => router\.push\('\/books'\)/)
})

test('mobile Home shares a warm layered material and video transition without changing desktop or other route shells', async () => {
  const navbar = await read('components/Navbar.tsx')
  const hero = await read('components/Hero.tsx')
  const material = await read('components/MobileHomeScene.module.css')

  assert.match(navbar, /const isTransparent = isHomePage && !scrolled/)
  assert.match(navbar, /isHomePage \? homeStyles.mobileHomeNav : ''/)
  assert.match(navbar, /isTransparent\s*\? 'md:bg-transparent backdrop-blur-none/)
  assert.match(material, /@media \(max-width: 767px\)/)
  assert.match(material, /\.mobileHomeNav\.mobileHomeNav[\s\S]*backdrop-filter: blur\(16px\)/)
  assert.match(material, /\.mobileHero[\s\S]*radial-gradient/)
  assert.match(hero, /md:hidden" aria-hidden="true">[\s\S]*styles.mobileVideoTransition/)
  assert.doesNotMatch(material, /animation:|url\(/)
  assert.match(navbar, /text-gray-700 md:text-white/)
  assert.match(navbar, /md:border-white\/35 md:bg-white\/10 md:text-white/)
  assert.match(navbar, /className="container mx-auto px-4 h-16 flex items-center justify-between"/)
  assert.match(navbar, /id="navbar-mobile-navigation"/)
  assert.match(navbar, /showBackButton = !isPrimaryNavigationRoute\(pathname\) && !isCheckoutRoute/)
})

test('mobile video joins the paper through decorative open-book pages rather than a gradient veil or curved lip', async () => {
  const hero = await read('components/Hero.tsx')
  const material = await read('components/MobileHomeScene.module.css')
  const transition = material.match(/\.mobileVideoTransition\s*\{([^}]+)\}/)?.[1]

  assert.match(hero, /pointer-events-none absolute inset-x-0 bottom-0 \$\{styles.mobileVideoTransition\}/)
  assert.match(hero, /<svg viewBox="0 0 390 64" preserveAspectRatio="none" focusable="false"/)
  assert.match(hero, /styles.mobilePageBack[\s\S]*styles.mobilePageFront[\s\S]*styles.mobilePageEdge[\s\S]*styles.mobilePageCrease/)
  assert.match(hero, /styles.mobileStorySpark/)
  assert.match(hero, /styles.mobileStoryContent/)
  assert.match(transition, /height: 64px/)
  assert.match(transition, /translateY\(24px\)/)
  assert.doesNotMatch(transition, /background:|linear-gradient/)
  assert.doesNotMatch(material, /mobileVideoTransition::after|border-radius: 50% 65%|height: 80px/)
  assert.match(material, /\.mobilePageFront \{ fill: var\(--hero-paper\)/)
  assert.match(material, /\.mobileStoryContent[\s\S]*padding-top: 32px[\s\S]*linear-gradient/)
  assert.doesNotMatch(hero, /<canvas|<image\b|<animate\b/)
})

test('Home moves the complete catalogue closer to Hero through responsive top padding only', async () => {
  const categories = await read('components/HomeBookCategories.tsx')
  const sectionClasses = categories.match(/<section className="([^"]+)"/)?.[1]

  assert.equal(sectionClasses, 'page-surface page-surface--flush-bottom relative pt-10 pb-10 md:pt-14 md:pb-14')
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
