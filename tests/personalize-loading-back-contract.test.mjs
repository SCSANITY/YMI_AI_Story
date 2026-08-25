import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

test('loading Back returns through the preview cancellation and draft-preservation path', () => {
  const page = read('components/PersonalizePage.tsx')
  const overlay = read('components/personalize/LoadingPreviewOverlay.tsx')

  assert.match(overlay, /onBack: \(\) => void/)
  assert.match(overlay, /import \{ createPortal \} from 'react-dom'/)
  assert.match(overlay, /return createPortal\(/)
  assert.match(overlay, /z-\[160\]/)
  assert.match(overlay, /document\.body/)
  assert.match(overlay, /type="button"[\s\S]*?onClick=\{onBack\}/)
  assert.match(overlay, /aria-label=\{labels\.back\}/)

  assert.match(
    page,
    /const handleLoadingBack = useCallback\(\(\) => \{\s*void requestPreviewCancellation\(\);\s*\}/
  )
  assert.match(
    page,
    /persistDraftForCustomizeReturn\(\{ clearPreviewRefs: true \}\);[\s\S]*?setPreviewJobId\(null\);[\s\S]*?setCreationId\(null\);[\s\S]*?startForm\(\);/
  )
  assert.match(page, /await cancelPreviewJob\(targetJobId,/)
  assert.match(
    page,
    /<LoadingPreviewOverlay[\s\S]*?back: t\('common\.back'\)[\s\S]*?onBack=\{handleLoadingBack\}/
  )
})
