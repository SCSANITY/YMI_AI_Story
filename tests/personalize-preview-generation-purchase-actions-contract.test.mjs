import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('pending Preview uses one 70-second estimate and only real decoded assets unlock the cover', () => {
  const page = read('components/PersonalizePage.tsx')
  const helper = read('components/personalize/preview-generation-estimate.ts')
  const cover = read('components/personalize/PreviewGeneratingCover.tsx')
  const stage = read('components/personalize/usePersonalizeStage.ts')
  assert.match(helper, /PREVIEW_ESTIMATE_SECONDS = 70/)
  assert.match(cover, /getPreviewGenerationEstimate\(elapsedMs\)/)
  assert.match(cover, /Date\.now\(\) - origin/)
  assert.match(cover, /window\.clearInterval\(timer\)/)
  assert.match(cover, /role="timer" aria-live="off"/)
  assert.match(cover, /props\.stillWorking/)
  assert.match(cover, /motion-reduce:transition-none/)
  assert.match(stage, /showPreview: stage === 'PREVIEW' \|\| stage === 'GENERATING'/)
  assert.match(page, /await waitForImageDecode\(outcome\.assets\.coverUrl\)/)
  assert.match(page, /decodedPreviewCoverUrl === previewUrl/)
  assert.match(page, /canAddToCart = stageCanAddToCart && hasReadyPreviewCover && !previewError/)
  assert.match(page, /canCheckout = stageCanCheckout && hasReadyPreviewCover && !previewError/)
  assert.match(page, /active: stage === 'PREVIEW'/)
  assert.doesNotMatch(page, /showLoading|setProgress|setLoadingText|setTimeout\(resolve, 550\)/)
})

test('Preview offers equal-weight cart and purchase actions with distinct icons', () => {
  const page = read('components/PersonalizePage.tsx')
  const actions = read('components/personalize/PreviewActionBar.tsx')
  const messages = read('src/lib/i18n-messages.ts')

  assert.match(actions, /ShoppingCart/)
  assert.match(actions, /CreditCard/)
  assert.match(actions, /grid gap-2\.5 sm:grid-cols-2/)
  assert.equal((actions.match(/glass-action-btn--brand min-h-14/g) ?? []).length, 2)
  assert.match(actions, /onClick=\{handleAddToCart\}[\s\S]*disabled=\{!isCheckoutAcknowledged \|\| pending\}/)
  assert.match(actions, /onClick=\{handleCheckout\}[\s\S]*disabled=\{!isCheckoutAcknowledged \|\| pending\}/)
  assert.match(page, /addToCartLabel=\{requiresVoiceSample[\s\S]*t\('personalize\.addToCart'\)/)
  assert.match(page, /purchaseLabel=\{t\('personalize\.purchaseNow'\)\}/)
  assert.match(actions, /const pending = isCheckoutPending \|\| isConfigurationPending \|\| !previewReady/)
  assert.match(page, /previewReady=\{Boolean\(canAddToCart && canCheckout\)\}/)
  assert.match(messages, /'personalize\.purchaseNow': 'Purchase'/)
})
