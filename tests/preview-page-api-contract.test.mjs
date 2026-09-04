import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const routePath = new URL('../app/api/jobs/[jobId]/preview-url/route.ts', import.meta.url)
const jobsServicePath = new URL('../src/services/jobs.ts', import.meta.url)
const previewContractPath = new URL('../src/lib/preview-page-contract.ts', import.meta.url)
const personalizePath = new URL('../components/PersonalizePage.tsx', import.meta.url)
const previewControllerPath = new URL('../components/personalize/usePreviewController.ts', import.meta.url)
const sharePreviewPath = new URL('../src/lib/share-preview.ts', import.meta.url)
const orderFulfillmentPath = new URL('../src/lib/orderFulfillment.ts', import.meta.url)
const readerPath = new URL('../app/api/my-books/[creationId]/reader/route.ts', import.meta.url)

test('structured Preview signing preserves authorization and no-store responses', async () => {
  const source = await readFile(routePath, 'utf8')

  assert.match(source, /scopeCheckoutOwnerQuery\([\s\S]*\.from\(['"]jobs['"]\)/)
  assert.match(source, /if \(!owner\)[\s\S]*Unauthorized/)
  assert.match(source, /noStoreJson as jsonNoStore/)
  assert.match(source, /job\.status !== ['"]done['"] && job\.status !== ['"]running['"]/)
  assert.match(source, /job\.status === ['"]running['"][\s\S]*Preview not ready/)
  assert.match(source, /createSignedUrl\(target\.storagePath, 60 \* 10\)/)
  assert.match(source, /buildSignedPreviewResponse/)
})

test('structured Personalize pages leave variant, share, cart, and Reader contracts intact', async () => {
  const [jobsService, previewContract, personalize, previewController, sharePreview, orderFulfillment, reader] = await Promise.all([
    readFile(jobsServicePath, 'utf8'),
    readFile(previewContractPath, 'utf8'),
    readFile(personalizePath, 'utf8'),
    readFile(previewControllerPath, 'utf8'),
    readFile(sharePreviewPath, 'utf8'),
    readFile(orderFulfillmentPath, 'utf8'),
    readFile(readerPath, 'utf8'),
  ])

  assert.match(jobsService, /return parseSignedPreviewAssets\(await response\.json\(\)\)/)
  assert.doesNotMatch(jobsService, /getPreviewUrl|getPreviewPages/)
  assert.doesNotMatch(previewContract, /Array\.isArray\(value\.urls\)|value\.urls\.map/)
  assert.match(previewContract, /const urls = pages\.map\(\(page\) => page\.url\)/)
  assert.match(personalize, /usePreviewController/)
  assert.doesNotMatch(personalize, /getPreviewPageAssets/)
  assert.match(previewController, /setPreviewBookPresentation\(assets\.presentation\)/)
  assert.match(personalize, /bookPresentation=\{previewBookPresentation\}/)
  assert.match(personalize, /commitPreviewVariant\(/)
  assert.match(personalize, /previewPublicShareImageUrl \|\| previewUrl/)
  assert.match(sharePreview, /pages\.find\(\(page\) => page\.page_index === 0\)/)
  assert.match(orderFulfillment, /pages\.find\(\([^)]+\) => [^)]+\.page_index === 0\)/)
  assert.match(reader, /isFinalJobReleased\(finalJob\)/)
  assert.match(reader, /pages\?\.find\(\(page\) => page\.page_index === 0\)/)
})
