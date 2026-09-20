import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')

test('closing the first spread hands centering and cover ownership to one animation phase', async () => {
  const stage = await read('components/personalize/PreviewBookStage.tsx')

  assert.match(stage, /const isClosingToCover = currentSpread === 1 && isFlipping && flipDirection === 'prev'/)
  assert.match(stage, /return isClosed \|\| isClosingToCover \? -pageWidth \/ 2 : 0/)
  assert.match(stage, /animate=\{\{ x: modelTargetX \}\}/)
  assert.match(stage, /data-preview-cover-guard="true"/)
  assert.match(stage, /data-preview-cover-guard-state=\{isClosingToCover \? 'closing' : isClosed \? 'closed' : 'inactive'\}/)
  assert.match(stage, /opacity: isClosingToCover[\s\S]*?\[0, 0, 1\][\s\S]*?isClosed[\s\S]*?\? 1[\s\S]*?: 0/)
  assert.match(stage, /\{renderPageContent\('right', 0\)\}/)
  assert.match(stage, /aria-hidden="true"[\s\S]*?inert[\s\S]*?pointer-events-none/)
  assert.doesNotMatch(stage, /animate=\{\{ x: \(currentSpread === 0 && !isFlipping\)/)
})
