import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('Preview purchase controls depend on durable identity, not image availability', async () => {
  const page = await read('components/PersonalizePage.tsx')

  assert.match(page, /hasPurchaseIdentity = isUuid\(creationId\) && isUuid\(displayedPreviewJobId\)/)
  assert.match(page, /canConfigurePurchase = hasPurchaseIdentity && !hasTerminalPreviewFailure/)
  assert.match(page, /canAddToCart = stageCanAddToCart && canConfigurePurchase/)
  assert.match(page, /canCheckout = stageCanCheckout && canConfigurePurchase/)
  assert.doesNotMatch(page, /canAddToCart = [^\n]*(hasReadyPreviewCover|previewCompletionReady|previewError)/)
  assert.doesNotMatch(page, /canCheckout = [^\n]*(hasReadyPreviewCover|previewCompletionReady|previewError)/)
  assert.match(page, /selectionDisabled=\{!canConfigurePurchase \|\| isSavingVoice\}/)
  assert.match(page, /dedication=\{canConfigurePurchase \? <PreviewDedication/)
  assert.match(page, /canShare=\{Boolean\(creationId\) && !isPreviewCoverPending && !previewError\}/)
})

test('the first Preview enters Preview after Creation and Job identity exist without waiting for an image', async () => {
  const page = await read('components/PersonalizePage.tsx')
  const start = page.indexOf('const created = await createPreviewJob(')
  const end = page.indexOf('} catch (error: unknown) {', start)
  const generation = page.slice(start, end)

  assert.ok(start >= 0 && end > start)
  assert.match(generation, /setPreviewJobId\(created\.jobId\)/)
  assert.match(generation, /setCreationId\(created\.creationId\)/)
  assert.match(generation, /replacePreviewUrl\(created\.creationId, created\.jobId\)/)
  assert.match(generation, /mode: 'identity-ready'/)
  assert.match(generation, /finishGenerating\(\)/)
  assert.doesNotMatch(generation, /watchPreviewJob|waitForImageDecode/)
})

test('My Books never substitutes the template original for a missing generated cover', async () => {
  const [page, cover, savedGrid, purchasedGrid] = await Promise.all([
    read('app/my-books/page.tsx'),
    read('components/BookCardCover.tsx'),
    read('app/my-books/MyBooksGrid.tsx'),
    read('app/my-books/PurchasedBooksGrid.tsx'),
  ])

  assert.match(page, /return row\.preview_cover_url \? templateStorageUrl\(row\.preview_cover_url\) : null/)
  assert.doesNotMatch(page, /preview_cover_url \|\| row\.templates/)
  assert.match(cover, /if \(!src \|\| failedSrc === src\)/)
  assert.match(cover, /Cover unavailable/)
  assert.match(savedGrid, /placeholderLabel=\{t\('myBooks\.previewPreparing'\)\}/)
  assert.match(purchasedGrid, /placeholderLabel=\{t\('myBooks\.previewPreparing'\)\}/)
})

test('the Web pins the reviewed durable Preview version fork database contract', async () => {
  const [fixture, route] = await Promise.all([
    read('tests/fixtures/external-contracts/sql/20260925_143000_ux2_020_creation_version_fork.sql'),
    read('app/api/creations/[creationId]/preview-versions/route.ts'),
  ])
  const hash = createHash('sha256').update(fixture.replace(/\r\n/g, '\n')).digest('hex').toUpperCase()

  assert.equal(hash, '37DD135C212E837CB86A3499CCF1A1BD0E9C8343E43700495083AA4718732B2A')
  assert.match(fixture, /create or replace function public\.fork_preview_creation_version/i)
  assert.match(fixture, /from public\.create_preview_job\(/i)
  assert.match(fixture, /insert into public\.creation_dedications/i)
  assert.match(fixture, /v_source_job\.status not in \([\s\S]*'queued'[\s\S]*'running'[\s\S]*'done'/i)
  assert.match(fixture, /revoke all on function public\.fork_preview_creation_version[\s\S]*from public, anon, authenticated/i)
  assert.match(route, /\.rpc\('fork_preview_creation_version'/)
  assert.match(route, /expected_preview_job_id/)
  assert.doesNotMatch(route, /loadCreationPhotoLockState|cart_items|orders/)
})
