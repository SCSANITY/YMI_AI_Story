import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')

test('the v2 cover and one moving inner leaf retain the real page faces and neutral landing shade', async () => {
  const stage=await read('components/personalize/PreviewBookShell.tsx')
  const css=await read('components/personalize/PreviewBookShell.module.css')
  assert.match(stage,/resolvePreviewBookTurningLeafFaces\(turn.from,turn.direction\)/)
  assert.equal((stage.match(/data-preview-cover-leaf="true"/g)||[]).length,1)
  assert.equal((stage.match(/data-preview-turning-leaf="true"/g)||[]).length,1)
  assert.match(stage,/data-preview-leaf-face="front"[\s\S]*renderPage\(faces.front.side,faces.front.spreadIndex\)/)
  assert.match(stage,/data-preview-leaf-face="back"[\s\S]*renderPage\(faces.back.side,faces.back.spreadIndex\)/)
  assert.match(stage,/const duration=reduced\?0:1.1/)
  assert.match(stage,/duration:reduced\?0:.8/)
  assert.match(css,/@keyframes leafShade\{0%,100%\{opacity:0\}/)
  assert.match(css,/backface-visibility:hidden;-webkit-backface-visibility:hidden/)
  assert.doesNotMatch(css,/(?:^|[;{])filter:/)
  assert.match(stage,/onAnimationComplete=\{\(\)=>onComplete\(turn.id\)\}/)
  assert.doesNotMatch(stage,/AnimatePresence|setTimeout|setCurrentSpread/)
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
