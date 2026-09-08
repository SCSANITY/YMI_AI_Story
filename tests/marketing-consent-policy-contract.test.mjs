import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

async function listSourceFiles(relativeDirectory) {
  const directory = path.join(root, relativeDirectory)
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listSourceFiles(relativePath))
    } else if (/\.(?:ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
      files.push(relativePath)
    }
  }

  return files
}

test('the approved privacy policy discloses optional analytics and marketing boundaries', async () => {
  const policy = await read('src/lib/footer-legal-content.ts')

  assert.match(policy, /5\. Cookies, Analytics, and Advertising Technologies/)
  assert.match(policy, /With Analytics consent, YMI Story may use Google Analytics/)
  assert.match(policy, /With Marketing consent, YMI Story may use Google Ads measurement and Meta Pixel/)
  assert.match(policy, /retention to two months/)
  assert.match(policy, /Withdrawing consent stops future optional collection/)
  assert.match(policy, /It cannot recall information already sent to a provider/)
  assert.match(policy, /Google or Meta may process limited technical and event data in countries outside/)
  assert.match(policy, /href: 'https:\/\/policies\.google\.com\/privacy'/)
  assert.match(policy, /href: 'https:\/\/www\.facebook\.com\/privacy\/policy\/'/)
})

test('the policy explicitly excludes child, customer, and private route data from vendors', async () => {
  const policy = await read('src/lib/footer-legal-content.ts')

  assert.match(policy, /Analytics and Advertising Exclusion:/)
  assert.match(policy, /name, age, uploaded photo or audio, generated likeness/)
  assert.match(policy, /does not send raw personalized routes, query strings, child information/)
  assert.match(policy, /customer contact details, or internal order and creation identifiers/)
  assert.match(policy, /uploaded materials for advertising profiles/)
})

test('the current disclosure version keeps the approved vendor boundaries and legal policy', async () => {
  const consent = await read('src/lib/cookie-consent.ts')
  const banner = await read('components/CookieConsentBanner.tsx')
  const messages = await read('src/lib/i18n-messages.ts')
  const legalDocuments = await read('src/lib/legal-documents.ts')
  const publishedLoader = await read('src/lib/published-legal-content.ts')
  const footer = await read('components/Footer.tsx')

  assert.match(consent, /COOKIE_CONSENT_VERSION = '2026-07-v2'/)
  assert.match(banner, /stored\?\.version === COOKIE_CONSENT_VERSION/)
  assert.match(messages, /Help us see which pages and stories people spend time on/)
  assert.match(messages, /Let us measure whether our ads reach families who actually want a book/)
  assert.doesNotMatch(messages, /They stay off unless you allow them/)
  assert.match(legalDocuments, /effectiveDate: 'August 28, 2026'/)
  assert.match(legalDocuments, /version: '2026-08-28-v3'/)
  assert.match(publishedLoader, /privacy: 'August 28, 2026'/)
  assert.match(footer, /publishedLegalContent\?\.footerEffectiveDates/)
})

test('the first cookie layer is compact, symmetric, and does not preselect optional tracking', async () => {
  const banner = await read('components/CookieConsentBanner.tsx')
  const messages = await read('src/lib/i18n-messages.ts')

  assert.match(banner, /defaultDraft = createCookieConsentPreferences\(\{ analytics: false, marketing: false \}\)/)
  assert.match(banner, /setDraft\(defaultDraft\)[\s\S]*setIsBannerVisible\(!wasCookieConsentDismissedForSession\(\)\)/)
  assert.match(banner, /onClick=\{rejectOptional\}[\s\S]*cookies\.rejectOptional/)
  assert.match(banner, /onClick=\{acceptAll\}[\s\S]*cookies\.acceptAll/)
  assert.match(banner, /onClick=\{openPreferences\}[\s\S]*cookies\.manageChoices/)
  assert.match(banner, /role="dialog"[\s\S]*aria-label=\{t\('cookies\.bannerTitle'\)\}/)
  assert.match(banner, /href="\/privacy"[\s\S]*cookies\.privacyPolicy/)
  assert.match(messages, /We use cookies to see which stories families love most and to keep our ads relevant/)
  assert.match(messages, /No child photos or names are ever included/)
  assert.match(messages, /'cookies\.rejectOptional': 'Reject all'/)
  assert.match(messages, /'cookies\.manageChoices': 'Manage preferences'/)
})

test('the detailed preference layer offers all three choices and plain-language reassurance', async () => {
  const banner = await read('components/CookieConsentBanner.tsx')
  const messages = await read('src/lib/i18n-messages.ts')

  assert.match(banner, /onClick=\{rejectOptional\}[\s\S]*onClick=\{acceptAll\}[\s\S]*onClick=\{saveDraft\}/)
  assert.match(banner, /cookies\.whyThisHelps/)
  assert.match(banner, /cookies\.reassurance/)
  assert.match(messages, /We're a small team — this is how we learn what to build next/)
  assert.match(messages, /Better measurement means fewer wasted ads and lower prices for you/)
  assert.match(messages, /We never share child photos, names, or uploaded media with any advertising service/)
})

test('dismissal remains unset and is scoped to the current browser session', async () => {
  const consent = await read('src/lib/cookie-consent.ts')
  const banner = await read('components/CookieConsentBanner.tsx')
  const bootstrap = await read('components/CookieConsentBootstrap.tsx')

  assert.match(consent, /COOKIE_CONSENT_DISMISSED_KEY/)
  assert.match(consent, /window\.sessionStorage\.setItem\(COOKIE_CONSENT_DISMISSED_KEY, COOKIE_CONSENT_VERSION\)/)
  assert.match(banner, /event\.key !== 'Escape'/)
  assert.match(banner, /dismissCookieConsentForSession\(\)/)
  assert.match(bootstrap, /window\.sessionStorage\.getItem/)
})

test('vendor runtime stays confined to the single S3 tracking boundary', async () => {
  const sourceDirectories = ['app', 'components', 'contexts', 'src']
  const files = (await Promise.all(sourceDirectories.map(listSourceFiles))).flat()
  const forbiddenRuntime = /googletagmanager\.com|connect\.facebook\.net|(?:^|[^\w])gtag\s*\(|(?:^|[^\w])fbq\s*\(|window\.dataLayer/
  const allowedRuntimeFiles = new Set([
    path.join('components', 'tracking', 'ConsentGatedTagAdapter.tsx'),
    path.join('components', 'tracking', 'MetaPixelFrame.tsx'),
  ])

  for (const file of files) {
    const source = await read(file)
    if (!forbiddenRuntime.test(source)) continue
    assert.ok(allowedRuntimeFiles.has(file), `${file} must not load or call a tracking vendor`)
  }
})

test('all legal policy renderers support controlled external provider links', async () => {
  const footer = await read('components/Footer.tsx')
  const checkout = await read('app/checkout/CheckoutPolicyModal.tsx')
  const canonicalPage = await read('components/legal/LegalDocumentPage.tsx')

  for (const renderer of [footer, checkout, canonicalPage]) {
    assert.match(renderer, /item\.href/)
    assert.match(renderer, /rel="noopener noreferrer"/)
  }
})
