import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')

test('closing the first spread keeps the generated cover out of the moving leaf', async () => {
  const stage = await read('components/personalize/PreviewBookStage.tsx')

  assert.match(stage, /const isClosingToCover = currentSpread === 1 && isFlipping && flipDirection === 'prev'/)
  assert.match(stage, /return isClosed \|\| isClosingToCover \? -pageWidth \/ 2 : 0/)
  assert.match(stage, /animate=\{\{ x: modelTargetX \}\}/)
  assert.match(
    stage,
    /\{isClosingToCover \? \([\s\S]*?data-preview-page-role="cover-backing"[\s\S]*?\) : \([\s\S]*?renderPageContent\('right', currentSpread - 1\)/,
  )
  assert.doesNotMatch(stage, /data-preview-cover-guard/)
  assert.doesNotMatch(stage, /renderPageContent\('right', 0\)/)
  assert.doesNotMatch(stage, /AnimatePresence/)
  assert.doesNotMatch(stage, /animate=\{\{ x: \(currentSpread === 0 && !isFlipping\)/)
})
