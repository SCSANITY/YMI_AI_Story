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
  assert.match(layout, /xl:grid-cols-\[112px_minmax\(0,1fr\)\]/)
  assert.match(layout, /max-w-\[380px\][^>]*>\{intro\}/)
  assert.match(layout, /\{progress\}[\s\S]*?\{intro\}[\s\S]*?\{book\}[\s\S]*?\{gallery\}/)
  assert.match(layout, /ref=\{purchaseRef\}[\s\S]*?\{purchase\}/)
  assert.match(intro, /mb-5 text-center text-gray-800 md:mb-7/)
  assert.match(intro, /mt-4 flex flex-col items-center/)
  assert.doesNotMatch(intro, /sm:text-left|sm:items-start/)
})

test('book and Photo Versions remain ahead of the purchase configuration in source order', () => {
  const layout = read('components/personalize/PreviewStepLayout.tsx')

  const stableBookLayout = layout.indexOf('aria-label="Book Preview"')
  const book = layout.indexOf('{book}', stableBookLayout)
  const purchase = layout.indexOf('ref={purchaseRef}', book)

  assert.ok(stableBookLayout >= 0)
  assert.ok(book > stableBookLayout)
  assert.ok(purchase > book)
})

test('Photo Versions stays horizontal on compact desktops and places rail labels below each card', () => {
  const gallery = read('components/personalize/PreviewVariantGallery.tsx')

  assert.match(gallery, /overflow-x-auto[\s\S]*?xl:flex-col/)
  assert.match(gallery, /xl:max-h-\[326px\]/)
  assert.match(gallery, /xl:overflow-x-hidden/)
  assert.match(gallery, /xl:overflow-y-auto/)
  assert.match(gallery, /snap-x snap-mandatory[\s\S]*?xl:snap-none/)
  assert.match(gallery, /h-11 w-11/)
  assert.match(gallery, /focus-visible:ring-2/)
  assert.match(gallery, /flex shrink-0 snap-start flex-col items-center xl:w-full/)
  assert.match(gallery, /mt-1 w-\[76px\][^\n]*text-center[^\n]*xl:w-full/)
  assert.doesNotMatch(gallery, /xl:flex-row|truncate/)
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
