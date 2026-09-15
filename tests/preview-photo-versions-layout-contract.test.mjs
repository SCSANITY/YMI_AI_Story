import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('wide desktop Preview uses a stable 65/35 book and purchase configuration split', () => {
  const layout = read('components/personalize/PreviewStepLayout.tsx')

  assert.match(layout, /xl:grid-cols-\[minmax\(0,1\.82fr\)_minmax\(340px,1fr\)\]/)
  assert.match(layout, /xl:grid-cols-\[150px_minmax\(0,1fr\)\]/)
  assert.match(layout, /\{gallery\}[\s\S]*?\{book\}/)
  assert.match(layout, /ref=\{purchaseRef\}[\s\S]*?\{purchase\}/)
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

test('Photo Versions stays horizontal on compact desktops and becomes a bounded rail when space permits', () => {
  const gallery = read('components/personalize/PreviewVariantGallery.tsx')

  assert.match(gallery, /overflow-x-auto[\s\S]*?xl:flex-col/)
  assert.match(gallery, /xl:max-h-\[326px\]/)
  assert.match(gallery, /xl:overflow-x-hidden/)
  assert.match(gallery, /xl:overflow-y-auto/)
  assert.match(gallery, /snap-x snap-mandatory[\s\S]*?xl:snap-none/)
  assert.match(gallery, /h-11 w-11/)
  assert.match(gallery, /focus-visible:ring-2/)
})

test('compact Preview scaling follows available width without the old phone clamp or tablet jump', () => {
  const personalize = read('components/PersonalizePage.tsx')

  assert.match(personalize, /const isCompactPreview = windowWidth < 1024/)
  assert.match(personalize, /\(windowWidth - 32\) \/ \(PAGE_WIDTH \* 2\)/)
  assert.match(personalize, /const previewScale = isCompactPreview \? compactPreviewScale : 1/)
  assert.match(personalize, /previewScale < 1/)
  assert.doesNotMatch(personalize, /mobilePreviewScale|Math\.min\(0\.58|Math\.max\(0\.4/)
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
