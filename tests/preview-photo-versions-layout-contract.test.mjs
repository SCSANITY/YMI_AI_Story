import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('desktop Preview reserves separate columns for Photo Versions and the fully opened book', () => {
  const layout = read('components/personalize/PreviewStepLayout.tsx')

  assert.match(layout, /lg:grid-cols-\[168px_760px\]/)
  assert.match(layout, /lg:gap-8/)
  assert.match(layout, /<aside[\s\S]*?lg:order-1[\s\S]*?\{gallery\}[\s\S]*?<div[\s\S]*?lg:order-2[\s\S]*?\{book\}/)
  assert.match(layout, /gallery \? \([\s\S]*?\) : \(\s*book\s*\)/)
})

test('Photo Versions stays horizontal on compact screens and becomes a bounded vertical rail on desktop', () => {
  const gallery = read('components/personalize/PreviewVariantGallery.tsx')

  assert.match(gallery, /overflow-x-auto[\s\S]*?lg:flex-col/)
  assert.match(gallery, /lg:max-h-\[326px\]/)
  assert.match(gallery, /lg:overflow-x-hidden/)
  assert.match(gallery, /lg:overflow-y-auto/)
  assert.match(gallery, /snap-x snap-mandatory[\s\S]*?lg:snap-none/)
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
