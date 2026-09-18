import assert from 'node:assert/strict'
import test from 'node:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { MagicAttributesPanel } from '@/components/personalize/MagicAttributesPanel'
import { PersonalizeProductIntro } from '@/components/personalize/PersonalizeProductIntro'

test('Magic Attributes render database-controlled accessible meters without visible percentages', () => {
  const html = renderToStaticMarkup(<MagicAttributesPanel
    heading="Magic Attributes"
    attributes={[{ label: 'Curiosity', percent: 85 }, { label: 'Kindness', percent: 110 }]}
    translateAttribute={(key) => key}
  />)
  assert.match(html, /aria-valuenow="85"/)
  assert.match(html, /aria-valuenow="100"/)
  assert.match(html, /width:85%/)
  assert.match(html, /width:100%/)
  assert.match(html, /h-3\.5/)
  assert.doesNotMatch(html, />\s*\d+%\s*</)
  assert.match(html, /Curiosity/)
  assert.match(html, /Kindness/)
})

test('Product Intro server markup retains the native CTA and excludes the client scroll guide', () => {
  let started = false
  const html = renderToStaticMarkup(<PersonalizeProductIntro
    eyebrow="Your story" title="A little adventure" description="A printed keepsake."
    facts={[]} fromLabel="From" priceLabel="$35.90" ctaLabel="Personalize this book"
    faqHeading="About this story" faqItems={[]}
    onStart={() => { started = true }}
  />)
  assert.match(html, /Personalize this book/)
  assert.match(html, /scroll-mt-24/)
  assert.doesNotMatch(html, /Scroll to |fixed inset-x-0/)
  assert.equal(started, false)
})
