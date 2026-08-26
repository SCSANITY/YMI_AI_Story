import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('paid-traffic Hero contains no simulated social proof and one verified fact bubble cluster', async () => {
  const hero = await read('components/Hero.tsx')
  const messages = await read('src/lib/i18n-messages.ts')

  assert.doesNotMatch(hero, /TESTIMONIALS|AVATAR_GRADIENTS|FEATURE_CHIPS|★★★★★/)
  assert.match(hero, /const HERO_FACTS:/)
  assert.match(hero, /backdrop-blur-xl/)
  assert.match(hero, /rounded-\[2\.2rem_1\.25rem_1\.8rem_1\.35rem\]/)
  assert.match(hero, /y: \[0, -11, 3, 8, 0\]/)
  assert.match(hero, /whileHover=\{\{/)
  assert.match(hero, /duration: 0\.13, ease: 'easeOut'/)
  assert.match(hero, /useReducedMotion\(\)/)
  assert.doesNotMatch(hero, /MARQUEE_ITEM_KEYS|animate=\{\{ x:/)
  assert.doesNotMatch(messages, /hero\.badge|hero\.socialProof|Rated 4\.9|2,000\+ Families|#1 Personalized Gift/)
})

test('Hero fact panel avoids unsupported shipping-count and preview-time claims', async () => {
  const messages = await read('src/lib/i18n-messages.ts')

  assert.match(messages, /hero\.facts\.shipsWorldwide': 'International Shipping Available'/)
  assert.match(messages, /hero\.facts\.previewReady': 'Preview Before You Order'/)
  assert.doesNotMatch(messages, /Ships to \d+\+ Countries|Preview Ready in \d+ Minute/)
})
