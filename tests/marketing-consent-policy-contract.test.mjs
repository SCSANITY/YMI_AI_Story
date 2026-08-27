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

test('the new disclosure version re-prompts users and names providers in Cookie Settings', async () => {
  const consent = await read('src/lib/cookie-consent.ts')
  const banner = await read('components/CookieConsentBanner.tsx')
  const messages = await read('src/lib/i18n-messages.ts')
  const legalDocuments = await read('src/lib/legal-documents.ts')
  const publishedLoader = await read('src/lib/published-legal-content.ts')
  const footer = await read('components/Footer.tsx')

  assert.match(consent, /COOKIE_CONSENT_VERSION = '2026-07-v2'/)
  assert.match(banner, /stored\?\.version === COOKIE_CONSENT_VERSION/)
  assert.match(messages, /Allows Google Analytics to measure coarse site usage and performance/)
  assert.match(messages, /Allows Google Ads measurement and Meta Pixel/)
  assert.match(messages, /They stay off unless you allow them/)
  assert.match(legalDocuments, /effectiveDate: 'August 27, 2026'/)
  assert.match(legalDocuments, /version: '2026-08-27-v2'/)
  assert.match(publishedLoader, /privacy: 'August 27, 2026'/)
  assert.match(footer, /publishedLegalContent\?\.footerEffectiveDates/)
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
