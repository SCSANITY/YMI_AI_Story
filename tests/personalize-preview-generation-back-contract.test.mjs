import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('pending Preview Back returns through cancellation and draft preservation without a loading route', () => {
  const page = read('components/PersonalizePage.tsx')
  assert.match(page, /const handleBack = \(\) => \{[\s\S]*stage === 'GENERATING'[\s\S]*void requestPreviewCancellation\(\)/)
  assert.match(
    page,
    /persistDraftForCustomizeReturn\(\{ clearPreviewRefs: true \}\);[\s\S]*?setPreviewJobId\(null\);[\s\S]*?setCreationId\(null\);[\s\S]*?startForm\(\);/
  )
  assert.match(page, /await cancelPreviewJob\(targetJobId,/)
  assert.match(
    page,
    /currentParams\.set\('view', 'preview'\)/
  )
  assert.match(page, /window\.addEventListener\('popstate', handlePopState\)/)
  assert.match(page, /previewCancelRequestedRef\.current[\s\S]*await cancelPreviewJob\(created\.jobId/)
  assert.match(page, /setGenerationStartedAt\(null\);[\s\S]*replacePersonalizeUrl\(null\);/)
  assert.match(page, /const navigateAwayFromPreview[\s\S]*stage === 'GENERATING'[\s\S]*await requestPreviewCancellation\(\)/)
  assert.match(page, /const logoutFromPreview[\s\S]*stage === 'GENERATING'[\s\S]*await requestPreviewCancellation\(\)/)
  assert.match(page, /onViewCart=\{[\s\S]*stage === 'PREVIEW'[\s\S]*: '\/cart'/)
  assert.doesNotMatch(page, /LoadingPreviewOverlay|showLoading|view.*'loading'|handleLoadingBack/)
  assert.equal(fs.existsSync(path.join(root, 'components/personalize/LoadingPreviewOverlay.tsx')), false)
})
