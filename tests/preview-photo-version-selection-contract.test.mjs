import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const personalize = fs.readFileSync(path.join(root, 'components/PersonalizePage.tsx'), 'utf8')

test('Photo Versions selection switches the saved book snapshot immediately', () => {
  assert.match(
    personalize,
    /const handleSelectPreviewVariant = useCallback\(\(jobId: string\) => \{[\s\S]*?previewVariants\.find[\s\S]*?applyPreviewVariantSelection\(variant\)/
  )
  assert.match(
    personalize,
    /setPreviewPages\(variant\.pages\.length \? variant\.pages : \[variant\.coverUrl\]\)/
  )
  assert.match(personalize, /key=\{displayedPreviewJobId \?\? 'preview-book'\}/)
})

test('late image responses cannot overwrite a different selected photo version', () => {
  assert.match(
    personalize,
    /selectedPreviewJobIdRef\.current && selectedPreviewJobIdRef\.current !== jobId[\s\S]*?return false/
  )
  assert.match(
    personalize,
    /getPreviewPageAssets\(jobId,[\s\S]*?applyPreviewDisplayAssetsForJob\(jobId, assets\)/
  )
  assert.equal(
    personalize.match(/pages: previewPages,/g)?.length,
    1,
    'the initial version may capture the current pages, but no effect may copy them across selections'
  )
})
