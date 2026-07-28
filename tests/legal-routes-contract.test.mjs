import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

const canonicalRoutes = [
  ['app/legal/page.tsx', '/legal'],
  ['app/privacy/page.tsx', '/privacy'],
  ['app/terms/page.tsx', '/terms'],
  ['app/shipping-policy/page.tsx', '/shipping-policy'],
  ['app/refund-policy/page.tsx', '/refund-policy'],
]

test('canonical legal routes stay public, static, and independent of publishing internals', async () => {
  const sitemap = await read('app/sitemap.ts')

  for (const [file, route] of canonicalRoutes) {
    const source = await read(file)

    assert.doesNotMatch(source, /['"]use client['"]/)
    assert.doesNotMatch(source, /\bsearchParams\b|\buseSearchParams\b/)
    assert.doesNotMatch(source, /\bcookies\s*\(|\bheaders\s*\(|\bdraftMode\s*\(/)
    assert.doesNotMatch(source, /requireAdminCustomer|requireCustomer|redirect\s*\(/)
    assert.doesNotMatch(source, /supabase|from\s*\(\s*['"]legal_/)
    assert.match(source, /export const metadata/)
    assert.match(source, new RegExp(`path:\\s*['"]${route.replaceAll('/', '\\/')}['"]|legalDocumentMetadata`))
    assert.match(sitemap, new RegExp(`['"]${route.replaceAll('/', '\\/')}['"]`))
  }
})

test('all public legal surfaces use the shared published-content boundary', async () => {
  const publishedLoader = await read('src/lib/published-legal-content.ts')
  const publicApi = await read('app/api/legal-content/route.ts')
  const documentPage = await read('components/legal/LegalDocumentPage.tsx')
  const shell = await read('components/legal/LegalPageShell.tsx')
  const legalOverview = await read('app/legal/page.tsx')
  const footer = await read('components/Footer.tsx')
  const checkout = await read('app/checkout/page.tsx')

  assert.match(publishedLoader, /getFooterLegalContent\('en'\)/)
  assert.match(publishedLoader, /current_published_revision_id/)
  assert.match(publishedLoader, /\.eq\('status', 'published'\)/)
  assert.match(publicApi, /getPublishedLegalContentSnapshot/)
  assert.match(documentPage, /getPublishedLegalDocument/)
  assert.match(shell, /getPublishedLegalDocuments/)
  assert.match(legalOverview, /getPublishedLegalDocuments/)
  assert.match(footer, /fetchPublishedLegalContentSnapshot/)
  assert.match(checkout, /fetchPublishedLegalContentSnapshot/)
  assert.match(documentPage, /document\.sections\.map/)
  assert.doesNotMatch(footer, /getFooterLegalContent/)
  assert.doesNotMatch(checkout, /getFooterLegalContent/)

  for (const [file] of canonicalRoutes) {
    const source = await read(file)
    assert.doesNotMatch(source, /Data We Collect|Personalized products|business days/)
  }
})

test('bootstrap, publish, and rollback invalidate public content while draft save does not', async () => {
  const collectionRoute = await read('app/api/admin/legal-documents/route.ts')
  const draftRoute = await read('app/api/admin/legal-documents/[documentKey]/route.ts')
  const publishRoute = await read(
    'app/api/admin/legal-documents/[documentKey]/publish/route.ts',
  )
  const rollbackRoute = await read(
    'app/api/admin/legal-documents/[documentKey]/rollback/route.ts',
  )

  assert.match(collectionRoute, /invalidatePublishedLegalContent\(\)/)
  assert.match(publishRoute, /invalidatePublishedLegalContent\(\)/)
  assert.match(rollbackRoute, /invalidatePublishedLegalContent\(\)/)
  assert.doesNotMatch(draftRoute, /invalidatePublishedLegalContent/)
})

test('legal surfaces expose canonical navigation, versions, contact, and cookie settings', async () => {
  const registry = await read('src/lib/legal-documents.ts')
  const shell = await read('components/legal/LegalPageShell.tsx')
  const documentPage = await read('components/legal/LegalDocumentPage.tsx')
  const cookieSettings = await read('components/legal/LegalCookieSettingsButton.tsx')

  for (const route of ['/privacy', '/terms', '/shipping-policy', '/refund-policy']) {
    assert.match(registry, new RegExp(`path:\\s*['"]${route.replaceAll('/', '\\/')}['"]`))
  }

  assert.match(shell, /href="\/legal"/)
  assert.match(shell, /documents\.map/)
  assert.match(documentPage, /Effective date:/)
  assert.match(documentPage, /Version:/)
  assert.match(documentPage, /mailto:admin@ymistory\.com/)
  assert.match(cookieSettings, /openCookieSettings/)
  assert.match(cookieSettings, /Cookie Settings/)
})
