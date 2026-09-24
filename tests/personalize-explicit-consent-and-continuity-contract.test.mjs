import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')

test('generation, voice, purchase confirmation and address saving require explicit checkbox actions', async () => {
  for (const [file, state] of [
    ['components/personalize/GeneratePreviewAction.tsx', 'isDataGenerationConsentChecked'],
    ['components/personalize/SignatureVoiceDialog.tsx', 'authorized'],
    ['components/personalize/PreviewActionBar.tsx', 'isCheckoutAcknowledged'],
    ['app/checkout/AddressFormSection.tsx', 'saveAddress'],
  ]) {
    const source = await read(file)
    assert.match(source, new RegExp(`const \\[${state},[^\\]]+\\] = useState\\(false\\)`))
    assert.doesNotMatch(source, /defaultChecked/)
  }
  assert.match(await read('components/personalize/GeneratePreviewAction.tsx'), /if \(!isFormValid\) return/)
})

test('runtime Product Intro has a decorative star motif without invented ratings or reviews', async () => {
  const page = await read('components/PersonalizePage.tsx')
  assert.doesNotMatch(page, /reviewDesignSample|getBookReviewDesignSample|reviewSampleCount/)
  const intro = await read('components/personalize/PersonalizeProductIntro.tsx')
  assert.match(intro, /data-product-star-motif="true"/)
  assert.doesNotMatch(intro, /reviewDesignSample|countLabel|toFixed\(1\)\}\/5/)
})

test('polling merges progressive assets and renews URLs only for explicit image recovery', async () => {
  const controller = await read('components/personalize/usePreviewController.ts')
  assert.match(controller, /mergePreviewPresentation\(current, assets\.presentation, renew\)/)
  assert.match(controller, /retainPreviewImageUrl\(current, assets\.coverUrl, renew\)/)
  assert.match(controller, /if \(assets && reason === 'image-error'\) await decodePreviewImageRenewal\(assets\.urls\)/)
  assert.match(controller, /applyPreviewDisplayAssetsForJob\(jobId, assets, reason === 'image-error'\)/)
  const cover = await read('components/personalize/useDecodedPreviewCover.ts')
  assert.match(cover, /decoded\?\.jobId === jobId && decoded\.identity === identity/)
  assert.match(cover, /if \(active && !retained\) onError/)
  const leaf = await read('components/personalize/BookLeafImage.tsx')
  assert.match(leaf, /src=\{visibleUrl\}/)
  assert.match(leaf, /decodePreviewImage\(leaf\.url\)/)
})
