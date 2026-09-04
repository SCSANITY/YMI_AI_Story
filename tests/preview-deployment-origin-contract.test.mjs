import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('Customize receives one server-loaded template without a duplicate client Catalog request', () => {
  const catalog = read('components/useBookCatalog.ts')
  const personalize = read('components/PersonalizePage.tsx')
  const page = read('app/personalize/[bookID]/page.tsx')

  assert.match(catalog, /credentials:\s*'same-origin'/)
  assert.doesNotMatch(catalog, /credentials:\s*'omit'/)
  assert.match(page, /loadActiveTemplateDetail\(bookID\)/)
  assert.match(page, /initialBook=\{initialBook\}/)
  assert.match(personalize, /initialBook:\s*CatalogBook/)
  assert.doesNotMatch(personalize, /\/api\/templates|useBookCatalog/)
})

test('runtime callbacks use the preview deployment origin without changing canonical SEO URLs', () => {
  const siteUrl = read('src/lib/site-url.ts')
  const checkout = read('app/api/checkout/session/route.ts')
  const cancel = read('app/api/checkout/session/cancel/route.ts')
  const newsletter = read('app/api/newsletter-subscribers/route.ts')
  const seo = read('src/lib/seo.ts')

  assert.match(siteUrl, /process\.env\.VERCEL_ENV === 'preview'/)
  assert.match(siteUrl, /process\.env\.VERCEL_URL/)
  assert.match(checkout, /getSiteUrl\(request\.url\)/)
  assert.match(checkout, /checkoutSessionMatchesSiteOrigin\(existingSession, baseUrl\)/)
  assert.match(checkout, /new URL\(session\.success_url \|\| ''\)\.origin === expectedOrigin/)
  assert.match(checkout, /new URL\(session\.cancel_url \|\| ''\)\.origin === expectedOrigin/)
  assert.match(checkout, /checkout\.sessions\.expire\(existingSession\.id\)/)
  assert.match(cancel, /getSiteUrl\(request\.url\)/)
  assert.match(newsletter, /getSiteUrl\(request\.url\)/)
  assert.match(seo, /https:\/\/www\.ymistory\.com/)
})
