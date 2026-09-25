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

test('the Web pins the reviewed early original Preview commit database contract', async () => {
  const [fixture, route] = await Promise.all([
    read('tests/fixtures/external-contracts/sql/20260925_130000_ux2_019_preview_purchase_independence.sql'),
    read('app/api/creations/[creationId]/preview-variants/commit/route.ts'),
  ])
  const hash = createHash('sha256').update(fixture.replace(/\r\n/g, '\n')).digest('hex').toUpperCase()

  assert.equal(hash, 'F8CF050385250B955E4C4C023EDA9D7E8ACCCC3E58AE150733116D8C6AABE096')
  assert.match(fixture, /v_is_original_selection := p_selected_preview_job_id = v_creation\.preview_job_id/)
  assert.match(fixture, /v_is_original_selection[\s\S]*'queued'::public\.job_status[\s\S]*'running'::public\.job_status[\s\S]*'done'::public\.job_status/)
  assert.match(fixture, /not v_is_original_selection[\s\S]*'running'::public\.job_status[\s\S]*'done'::public\.job_status/i)
  assert.match(fixture, /v_cover_storage_path is null[\s\S]*not v_is_original_selection or v_selected_job\.status = 'done'::public\.job_status/i)
  assert.match(fixture, /if v_cover_storage_path is not null then[\s\S]*update public\.preview_share_links/i)
  assert.match(fixture, /revoke all on function public\.commit_preview_variant[\s\S]*from public, anon, authenticated/i)
  assert.match(route, /\.rpc\('commit_preview_variant'/)
  assert.match(route, /case 'not_ready':[\s\S]*preview_variant_not_ready/)
})
