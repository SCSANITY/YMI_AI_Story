import assert from 'node:assert/strict'
import test from 'node:test'
import { render } from '@react-email/render'
import { OrderReceiptEmail } from './OrderReceiptEmail'

test('confirmation renders the cover-specific title rather than a generic label or first receipt title', async () => {
  const html = await render(<OrderReceiptEmail
    orderId="synthetic-order"
    items={[
      { name: "Alston's Birthday Adventure", quantity: 1, unitPrice: 39 },
      { name: 'Sonia & the Forest', quantity: 1, unitPrice: 39 },
    ]}
    total={78}
    coverImageUrl="https://example.test/sonia-cover.webp"
    coverTitle="Sonia & the Forest"
  />)
  const cover = html.slice(html.indexOf('https://example.test/sonia-cover.webp'), html.indexOf('Your Order'))
  assert.match(cover, /Sonia &amp; the Forest/)
  assert.doesNotMatch(cover, /Alston|Personalized Book Cover/)
  assert.match(html, /Alston(?:'|&#x27;)s Birthday Adventure/)
})

test('confirmation without an available cover retains the decorative placeholder', async () => {
  const html = await render(<OrderReceiptEmail orderId="synthetic-order"
    items={[{ name: "Alston's Story", quantity: 1, unitPrice: 39 }]} total={39} />)
  assert.match(html, /cover-placeholder.png/)
  assert.doesNotMatch(html, /Personalized Book Cover/)
})
