import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')

test('one physical turning leaf keeps its real front and back page images', async () => {
  const stage = await read('components/personalize/PreviewBookStage.tsx')

  assert.match(stage, /return isClosed \|\| isClosingToCover \? -pageWidth \/ 2 : 0/)
  assert.match(stage, /animate=\{\{ x: modelTargetX \}\}/)
  assert.match(stage, /resolvePreviewBookTurningLeafFaces\(currentSpread, flipDirection\)/)
  assert.match(stage, /data-preview-turning-leaf="true"/)
  assert.match(stage, /data-preview-leaf-face="front"[\s\S]*?renderPageContent\(turningLeafFaces\.front\.side, turningLeafFaces\.front\.spreadIndex\)/)
  assert.match(stage, /data-preview-leaf-face="back"[\s\S]*?renderPageContent\(turningLeafFaces\.back\.side, turningLeafFaces\.back\.spreadIndex\)/)
  assert.match(stage, /willChange: 'transform'/)
  assert.match(stage, /transform: 'translateZ\(0\.1px\)'/)
  assert.match(stage, /transform: 'rotateY\(180deg\) translateZ\(0\.1px\)'/)
  assert.doesNotMatch(stage, /data-preview-cover-guard/)
  assert.doesNotMatch(stage, /data-preview-page-role="cover-backing"/)
  assert.doesNotMatch(stage, /AnimatePresence/)
  assert.doesNotMatch(stage, /previewBookShadow|filter:\s*previewBookShadow/)
  assert.equal((stage.match(/<motion\.div/g) ?? []).length, 2)
  assert.doesNotMatch(stage, /animate=\{\{ x: \(currentSpread === 0 && !isFlipping\)/)
})
