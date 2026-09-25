import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('wide desktop Preview uses a stable 70/30 book and purchase configuration split', () => {
  const layout = read('components/personalize/PreviewStepLayout.tsx')
  const intro = read('components/personalize/PreviewIntroHeader.tsx')

  assert.match(layout, /xl:grid-cols-\[minmax\(0,7fr\)_minmax\(310px,3fr\)\]/)
  assert.match(layout, /max-w-\[380px\][^>]*>\{intro\}/)
  assert.match(layout, /\{progress\}[\s\S]*?\{intro\}[\s\S]*?\{book\}/)
  assert.doesNotMatch(layout, /\{gallery\}|grid-cols-\[112px/)
  assert.match(layout, /ref=\{purchaseRef\}[\s\S]*?\{purchase\}/)
  assert.match(intro, /mb-5 text-center text-gray-800 md:mb-7/)
  assert.match(intro, /mt-4 flex w-full flex-col items-center/)
  assert.match(intro, /mx-auto inline-flex items-center/)
  assert.doesNotMatch(intro, /sm:text-left|sm:items-start/)
})

test('book remains ahead of the purchase configuration in source order', () => {
  const layout = read('components/personalize/PreviewStepLayout.tsx')

  const stableBookLayout = layout.indexOf('aria-label="Book Preview"')
  const book = layout.indexOf('{book}', stableBookLayout)
  const purchase = layout.indexOf('ref={purchaseRef}', book)

  assert.ok(stableBookLayout >= 0)
  assert.ok(book > stableBookLayout)
  assert.ok(purchase > book)
})

test('Preview book island scales from its actual column instead of global window width', () => {
  const stage = read('components/personalize/PreviewBookStage.tsx')
  const personalize = read('components/PersonalizePage.tsx')

  assert.match(stage, /new ResizeObserver\(recomputeScale\)/)
  assert.match(stage, /stage\.getBoundingClientRect\(\)\.width/)
  assert.match(stage, /\(availableWidth - 8\) \/ \(pageWidth \* 2\)/)
  assert.doesNotMatch(personalize, /isCompactPreview|compactPreviewScale|previewStageHeight/)
})

test('compact Preview offers an accessible animated cue while purchase configuration remains below', () => {
  const layout = read('components/personalize/PreviewStepLayout.tsx')
  const personalize = read('components/PersonalizePage.tsx')
  const messages = read('src/lib/i18n-messages.ts')

  assert.match(layout, /new IntersectionObserver/)
  assert.match(layout, /window\.matchMedia\('\(min-width: 1280px\)'\)/)
  assert.match(layout, /entry\.boundingClientRect\.top > 0/)
  assert.match(layout, /threshold: \[0, 0\.25, 0\.5, 0\.75, 1\]/)
  assert.match(layout, /window\.addEventListener\('resize', updateCueVisibility\)/)
  assert.match(layout, /window\.removeEventListener\('resize', updateCueVisibility\)/)
  assert.match(layout, /scrollIntoView\(\{[\s\S]*?prefers-reduced-motion: reduce[\s\S]*?block: 'start'/)
  assert.match(layout, /aria-label=\{scrollCueLabel\}/)
  assert.match(layout, /fixed bottom-5[\s\S]*?xl:hidden/)
  assert.match(layout, /ChevronsDown[\s\S]*?motion-safe:animate-bounce/)
  assert.match(layout, /ref=\{purchaseRef\}[\s\S]*?\{purchase\}/)
  assert.match(personalize, /scrollCueLabel=\{t\('personalize\.scrollToPurchase'\)\}/)
  assert.match(messages, /'personalize\.scrollToPurchase': 'Continue to order options'/)
})
