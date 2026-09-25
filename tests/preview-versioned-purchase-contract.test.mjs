import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const pathUrl = (path) => new URL(`../${path}`, import.meta.url)

test('Change Photo forks a server-owned durable version without cart or purchase locks', async () => {
  const [route, service] = await Promise.all([
    read('app/api/creations/[creationId]/preview-versions/route.ts'),
    read('src/services/jobs.ts'),
  ])

  assert.match(route, /resolveCheckoutOwner\(request,[\s\S]*allowAnon: true[\s\S]*createAnonIfMissing: false/)
  assert.match(route, /\.from\('creations'\)[\s\S]*\.eq\('owner_type', filter\.owner_type\)[\s\S]*\.eq\(filter\.column, filter\.value\)/)
  assert.match(route, /String\(sourceCreation\.preview_job_id \|\| ''\) !== expectedPreviewJobId/)
  assert.match(route, /confirmPendingFaceAsset|loadOwnedFaceAsset/)
  assert.match(route, /\.rpc\('fork_preview_creation_version'/)
  assert.match(route, /sqlState === '54000'[\s\S]*preview_version_limit/)
  assert.match(route, /sqlState === '40001'[\s\S]*preview_version_source_conflict/)
  assert.match(route, /sqlState !== '55000'[\s\S]*preview_version_source_terminal/)
  assert.match(route, /rpcConflictCode\(error\)/)
  assert.doesNotMatch(route, /rpcConflictCode\(error\.message/)
  assert.doesNotMatch(route, /loadCreationPhotoLockState|hasCartAttachment|purchaseState/)
  assert.match(service, /\/preview-versions/)
  assert.match(service, /expected_preview_job_id: input\.expectedPreviewJobId/)
})

test('purchase exits do not commit or lock a photo selection and no confirm modal remains', async () => {
  const [page, overlays] = await Promise.all([
    read('components/PersonalizePage.tsx'),
    read('components/personalize/PersonalizeOverlays.tsx'),
  ])

  for (const obsolete of [
    'commitSelectedPreviewForExit',
    'commitPreviewVariant(',
    'showAddToCartConfirm',
    'isPreviewPhotoLocked',
    'discardPreviewVariantSession',
    'PreviewVariantGallery',
  ]) {
    assert.doesNotMatch(page, new RegExp(obsolete.replace('(', '\\(')))
  }
  assert.doesNotMatch(overlays, /addToCartConfirm|add-to-cart-confirm-title/)
  assert.match(page, /const currentPreviewJobId = purchaseConfiguration\.previewJobId/)
  assert.match(page, /previewJobId: currentPreviewJobId/)
})

test('cart edit reuse is creation-scoped so a new photo version cannot overwrite the old item', async () => {
  const context = await read('contexts/GlobalContext.tsx')

  assert.match(
    context,
    /const shouldResume = Boolean\([\s\S]*resumeData\.bookID === book\.bookID[\s\S]*resumeData\.creationId === creationId[\s\S]*\)/
  )
  assert.match(context, /const existingItem = cart\.find\(item => item\.creationId === creationId\)/)
  assert.match(context, /existingItem\.quantity \+ 1/)
  assert.match(context, /setCart\(prev => \[\.\.\.prev, newItem\]\)/)
})

test('leaving Preview preserves durable versions and the old inline gallery is gone', async () => {
  const [page, layout] = await Promise.all([
    read('components/PersonalizePage.tsx'),
    read('components/personalize/PreviewStepLayout.tsx'),
  ])

  assert.doesNotMatch(page, /cleanupCurrentPreviewVariantSession|handlePageHide[\s\S]*previewVariant/)
  assert.doesNotMatch(layout, /gallery|grid-cols-\[112px/)
  assert.match(page, /router\.push\('\/my-books\?shelf=previews'\)/)
})

test('superseded same-Creation mutators are absent from both HTTP and client surfaces', async () => {
  const retiredRoutes = [
    'app/api/creations/[creationId]/preview-variants/route.ts',
    'app/api/creations/[creationId]/preview-variants/[jobId]/route.ts',
    'app/api/creations/[creationId]/preview-variants/commit/route.ts',
  ]

  for (const route of retiredRoutes) {
    await assert.rejects(access(pathUrl(route)), { code: 'ENOENT' })
  }

  const service = await read('src/services/jobs.ts')
  for (const retiredExport of [
    'createPreviewVariant',
    'commitPreviewVariant',
    'discardPreviewVariant',
    'discardPreviewVariantSession',
  ]) {
    assert.doesNotMatch(service, new RegExp(`export async function ${retiredExport}\\b`))
  }
  assert.doesNotMatch(service, /\/preview-variants(?:\/|`)/)
})
