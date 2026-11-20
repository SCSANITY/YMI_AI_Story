import assert from 'node:assert/strict'
import test from 'node:test'
import { GET } from '../../app/book-preview/[orderId]/route'
import { buildPdfDeliveryLink } from './pdf-delivery-link'

const orderId = 'a0347a4a-7b3e-4f62-b3b0-42a354f49308'
const order = 'https://www.example.com/orders/' + orderId
const context = { params: Promise.resolve({ orderId }) }

function signed(book: string, exp: number) {
  const payload = Buffer.from(JSON.stringify({ exp })).toString('base64url')
  return 'https://example.supabase.co/storage/v1/object/sign/raw-private/orders/' + orderId +
    '/final/books/' + book + '/final.pdf?token=fixture.' + payload + '.fixture&download=My%20book.pdf'
}

test('two books retain their individual signed grants, filename and original deadline', async () => {
  const exp = Math.floor(Date.now() / 1000) + 3500
  for (const book of ['one', 'two']) {
    const pdf = signed(book, exp)
    const address = 'reader+gift@gmail.com'
    const link = new URL(buildPdfDeliveryLink(order, orderId, pdf, address))
    assert.equal(link.origin, new URL(order).origin)
    const details = new URLSearchParams(link.hash.slice(1))
    assert.equal(details.get('pdf'), pdf)
    assert.equal(details.get('email'), address)
    assert.equal(link.search, '?expires=' + exp)
    link.hash = ''
    assert.doesNotMatch(link.href, /token|final\.pdf|reader|gmail/)
    const response = await GET(new Request(link), context)
    assert.match(await response.text(), /Your PDF preview is ready/)
    assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer')
  }
})

test('expired grants serve the branded order link without contacting Storage', async () => {
  const pdf = signed('one', Math.floor(Date.now() / 1000) - 1)
  const response = await GET(new Request(buildPdfDeliveryLink(order, orderId, pdf, 'reader@example.org')), context)
  const html = await response.text()
  assert.match(html, /Your preview link has expired/)
  assert.ok(html.includes('href="/orders/' + orderId + '"'))
  assert.doesNotMatch(html, /token=|final\.pdf|reader@example/)
  assert.match(html, /Checked out as a guest/)
  assert.match(response.headers.get('Cache-Control')!, /no-store/)
  assert.throws(() => buildPdfDeliveryLink(order, orderId, 'https://example.com/book.pdf', 'reader@example.org'))
})
