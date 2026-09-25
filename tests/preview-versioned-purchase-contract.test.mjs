import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

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
