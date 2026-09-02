import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('wide desktop Preview centers the book independently and offsets Photo Versions to its left', () => {
  const layout = read('components/personalize/PreviewStepLayout.tsx')

  assert.match(layout, /relative flex w-full flex-col items-center xl:block/)
  assert.match(layout, /<aside[\s\S]*?xl:absolute[\s\S]*?xl:right-\[calc\(50%\+412px\)\][\s\S]*?xl:w-\[168px\][\s\S]*?\{gallery\}/)
  assert.match(layout, /const bookWithScrollCue = \(\s*<div[^>]*xl:mx-auto xl:w-\[760px\][^>]*>\s*\{book\}/)
  assert.doesNotMatch(layout, /grid-cols-\[168px_760px\]/)
  assert.match(layout, /gallery \? \([\s\S]*?\) : \(\s*bookWithScrollCue\s*\)/)
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

test('desktop Preview offers an accessible animated cue only while purchase actions remain below', () => {
  const layout = read('components/personalize/PreviewStepLayout.tsx')
  const personalize = read('components/PersonalizePage.tsx')
  const messages = read('src/lib/i18n-messages.ts')

  assert.match(layout, /new IntersectionObserver/)
  assert.match(layout, /window\.matchMedia\('\(min-width: 1024px\)'\)/)
  assert.match(layout, /entry\.boundingClientRect\.top > 0 && entry\.boundingClientRect\.bottom > window\.innerHeight/)
  assert.match(layout, /threshold: \[0, 0\.25, 0\.5, 0\.75, 1\]/)
  assert.match(layout, /window\.addEventListener\('resize', updateCueVisibility\)/)
  assert.match(layout, /window\.removeEventListener\('resize', updateCueVisibility\)/)
  assert.match(layout, /scrollIntoView\(\{[\s\S]*?prefers-reduced-motion: reduce[\s\S]*?block: 'start'/)
  assert.match(layout, /aria-label=\{scrollCueLabel\}/)
  assert.match(layout, /hidden h-12 w-12[\s\S]*?lg:flex/)
  assert.match(layout, /ChevronsDown[\s\S]*?motion-safe:animate-bounce/)
  assert.match(layout, /ref=\{actionsRef\}[\s\S]*?\{actions\}/)
  assert.match(personalize, /scrollCueLabel=\{t\('personalize\.scrollToPurchase'\)\}/)
  assert.match(messages, /'personalize\.scrollToPurchase': 'Continue to order options'/)
})
