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

test('book artwork cannot escape the physical page through native image interaction', async () => {
  const page = await read('components/personalize/PreviewBookPageContent.tsx')
  const leafImage = await read('components/personalize/BookLeafImage.tsx')

  assert.match(page, /data-preview-cover-native-interaction="disabled"/)
  assert.match(page, /data-preview-cover-surface-action="next-page"/)
  assert.match(page, /onContextMenu=\{\(event\) => event\.preventDefault\(\)\}/)
  assert.match(page, /draggable=\{false\}/)
  assert.match(page, /WebkitTouchCallout: 'none'/)
  assert.match(leafImage, /data-book-leaf-native-interaction="disabled"/)
  assert.match(leafImage, /draggable=\{false\}/)
  assert.match(leafImage, /pointer-events-none/)
  assert.match(leafImage, /WebkitTouchCallout: 'none'/)
})
