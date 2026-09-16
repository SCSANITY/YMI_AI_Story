import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('loading estimate drives progress and countdown from one elapsed-time model', () => {
  const page = read('components/PersonalizePage.tsx')
  const helper = read('components/personalize/loading-progress.ts')
  const overlay = read('components/personalize/LoadingPreviewOverlay.tsx')

  assert.match(helper, /PREVIEW_ESTIMATE_SECONDS = 150/)
  assert.match(helper, /progress: ratio \* PREVIEW_ESTIMATE_PROGRESS_CAP/)
  assert.match(helper, /countdownSeconds: Math\.ceil\(\(estimateMs - safeElapsedMs\) \/ 1000\)/)
  assert.match(page, /getPreviewLoadingEstimate\(Date\.now\(\) - startedAt\)/)
  assert.match(page, /setProgress\(estimate\.progress\)/)
  assert.match(page, /setLoadingCountdownSeconds\(estimate\.countdownSeconds\)/)
  assert.doesNotMatch(page, /let progressTarget|lastRampAt|elapsed < 30_000/)
  assert.match(page, /setProgress\(100\)[\s\S]*setLoadingCountdownSeconds\(0\)[\s\S]*setTimeout\(resolve, 550\)/)

  assert.match(overlay, /role="timer"/)
  assert.match(overlay, /role="progressbar"/)
  assert.match(overlay, /aria-valuenow=\{roundedProgress\}/)
  assert.match(overlay, /formatPreviewCountdown\(countdownSeconds\)/)
  assert.match(overlay, /duration-500 ease-linear motion-reduce:transition-none/)
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
  assert.match(messages, /'personalize\.purchaseNow': 'Purchase'/)
})
