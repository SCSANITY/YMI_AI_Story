import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { canHydrateEdition } from './edition-hydration'
import { PreviewGeneratingCover } from '@/components/personalize/PreviewGeneratingCover'
import { getPreviewGenerationEstimate } from '@/components/personalize/preview-generation-estimate'
import { PreviewPurchasePanel } from '@/components/personalize/PreviewPurchasePanel'
import { PersonalizeProductIntro } from '@/components/personalize/PersonalizeProductIntro'
import { PreviewActionBar } from '@/components/personalize/PreviewActionBar'
import { GeneratePreviewAction } from '@/components/personalize/GeneratePreviewAction'

test('70-second estimate follows elapsed wall time, clamps safely, and has no completion signal', () => {
  assert.deepEqual(getPreviewGenerationEstimate(0), { countdownSeconds: 70, fraction: 0 })
  assert.deepEqual(getPreviewGenerationEstimate(35_000), { countdownSeconds: 35, fraction: 0.5 })
  assert.deepEqual(getPreviewGenerationEstimate(69_999), { countdownSeconds: 1, fraction: 69_999 / 70_000 })
  for (const elapsed of [70_000, 180_000, 600_000]) {
    assert.deepEqual(getPreviewGenerationEstimate(elapsed), { countdownSeconds: 0, fraction: 1 })
  }
  for (const elapsed of [-10, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(getPreviewGenerationEstimate(elapsed).countdownSeconds, 70)
  }
})

test('Product Intro shows decorative stars without invented ratings or reviews', () => {
  const html = renderToStaticMarkup(<PersonalizeProductIntro
    eyebrow="Story" title="A book" description="Full story description" facts={[]}
    fromLabel="From" priceLabel="$35.90" ctaLabel="Personalize" faqHeading="About" faqItems={[]} onStart={() => {}}
  />)
  assert.match(html, /data-product-star-motif="true"/)
  assert.match(html, /data-product-star-motif="true"[^>]*aria-hidden="true"|aria-hidden="true"[^>]*data-product-star-motif="true"/)
  assert.equal((html.match(/fill="currentColor"/g) ?? []).length, 5)
  assert.doesNotMatch(html, /Reviews|rating|sample reviews|data-review-design-sample/)
  assert.match(html, /line-clamp-2/)
  assert.match(html, /Full story description/)
})

test('Creation hydration cannot revert a local selection, even when its read started later', () => {
  assert.equal(canHydrateEdition(0, 0), true)
  assert.equal(canHydrateEdition(0, 1), false)
  assert.equal(canHydrateEdition(1, 1), false)
  assert.equal(canHydrateEdition(1, 2), false)
})

const pendingProps = {
  startedAt: null, title: 'Creating your cover', body: 'Your cover will appear when ready.',
  estimateLabel: 'Estimated time remaining', stillWorking: 'Still creating — no need to refresh',
  capacityWaiting: false, capacityTitle: 'Your place is saved', capacityBody: 'Please wait.',
  error: null, retryLabel: 'Review details and retry', onReturnToDetails: () => {},
}

test('pending cover is inline, has a non-announcing estimate timer, and shows an actionable failure', () => {
  const html = renderToStaticMarkup(<PreviewGeneratingCover {...pendingProps} />)
  assert.match(html, /data-preview-generating-cover="true"/)
  assert.match(html, /role="timer" aria-live="off"/)
  assert.match(html, /70s/)
  assert.match(html, /Estimated time remaining/)
  assert.doesNotMatch(html, /fixed|role="progressbar"|100%|RunPod/)
  const failed = renderToStaticMarkup(<PreviewGeneratingCover {...pendingProps} error="Unable to generate" />)
  assert.match(failed, /Unable to generate/)
  assert.match(failed, /type="button"/)
  assert.match(failed, /Review details and retry/)
  assert.doesNotMatch(failed, /role="timer"/)
  const queued = renderToStaticMarkup(<PreviewGeneratingCover {...pendingProps} capacityWaiting />)
  assert.match(queued, /Your place is saved/)
  assert.match(queued, /70s/)
})

test('edition cards use real full-card radio targets and are selectable while saving, not while generating', () => {
  const props = {
    value: 'basic' as const,
    options: [{ value: 'basic' as const, title: 'Hardcover', subtitle: 'Printed book', image: '/personalize-editions/classic-portrait.svg', imageAlt: 'Hardcover', price: '$35.90' },
      { value: 'supreme' as const, title: 'Hardcover + Voice', subtitle: 'Printed book and audio', image: '/personalize-editions/signature-voice.svg', imageAlt: 'Hardcover and voice', price: '$65.90', badge: 'Most Popular' }],
    title: 'Choose your edition', voiceTitle: 'Voice', voiceBody: 'Record a sample', voiceReadyLabel: 'Voice ready', addVoiceLabel: 'Add voice', changeVoiceLabel: 'Change', privacyCopy: 'Private and secure. No third-party reuse.',
    isSavingEdition: true, editionError: null, voiceReady: false, voiceDurationSeconds: null,
    actions: null, onChange: async () => {}, onOpenVoice: () => {},
  }
  const html = renderToStaticMarkup(<PreviewPurchasePanel {...props} />)
  assert.equal((html.match(/type="radio"/g) ?? []).length, 2)
  assert.match(html, /absolute inset-0 z-10/)
  assert.doesNotMatch(html, /disabled=""/)
  assert.match(html, /Hardcover \+ Voice[\s\S]*Most Popular/)
  const pending = renderToStaticMarkup(<PreviewPurchasePanel {...props} selectionDisabled />)
  assert.match(pending, /fieldset disabled=""/)
})

test('pending Preview cannot add to cart or purchase even if the acknowledgement is toggled', () => {
  const html = renderToStaticMarkup(<PreviewActionBar
    acknowledgementLabel="Confirm" acknowledgementRequiredLabel="Required" shareLabel="Share" addToCartLabel="Add to cart" purchaseLabel="Purchase" loadingLabel="Loading"
    shareError={null} canShare={false} isPreparingShare={false} isCheckoutPending={false}
    previewReady={false} onShare={() => {}} onAddToCart={() => {}} onCheckout={() => {}} addToCartButtonRef={null}
  />)
  assert.equal((html.match(/disabled=""/g) ?? []).length, 3)
  assert.doesNotMatch(html, /checked=""/)
})

test('a complete form still starts with generation consent unchecked and its action disabled', () => {
  const html = renderToStaticMarkup(<GeneratePreviewAction
    isFormReady isFacePreparing={false} isPhotoFailed={false} previewError={null} onGenerate={() => {}}
    labels={{ acknowledgement: 'Use my photo', privacyPolicy: 'Privacy Policy', required: 'Required', photoPreparing: 'Preparing', photoNeedsFix: 'Fix photo', dataConsentRequiredShort: 'Please agree', generateMagicPreview: 'Generate', completeDetails: 'Complete details' }}
  />)
  assert.match(html, /type="checkbox"/)
  assert.doesNotMatch(html, /checked=""/)
  assert.match(html, /disabled=""/)
  assert.match(html, /Please agree/)
})
