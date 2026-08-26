import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('paid-traffic Hero contains no simulated social proof or duplicated feature chips', async () => {
  const hero = await read('components/Hero.tsx')
  const messages = await read('src/lib/i18n-messages.ts')

  assert.doesNotMatch(hero, /TESTIMONIALS|AVATAR_GRADIENTS|FEATURE_CHIPS|★★★★★/)
  assert.doesNotMatch(messages, /hero\.badge|hero\.socialProof|Rated 4\.9|2,000\+ Families|#1 Personalized Gift/)
})

test('Hero marquee avoids unsupported shipping-count and preview-time claims', async () => {
  const messages = await read('src/lib/i18n-messages.ts')

  assert.match(messages, /hero\.marquee\.shipsWorldwide': 'International Shipping Available'/)
  assert.match(messages, /hero\.marquee\.previewReady': 'Preview Before You Order'/)
  assert.doesNotMatch(messages, /Ships to \d+\+ Countries|Preview Ready in \d+ Minute/)
})
