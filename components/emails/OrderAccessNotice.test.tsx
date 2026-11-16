import assert from 'node:assert/strict'
import test from 'node:test'
import { render } from '@react-email/render'
import { AbandonmentEmail, buildAbandonmentEmailCopy } from './AbandonmentEmail'
import { DeliveryEmail } from './DeliveryEmail'
import { LogisticsUpdateEmail } from './LogisticsUpdateEmail'
import { ORDER_ACCESS_NOTICE_TEXT } from './OrderAccessNotice'
import { OrderReceiptEmail } from './OrderReceiptEmail'

const noticePattern = /To securely view this order on another device/i

test('renders the shared secure-access notice in all three order-link emails', async () => {
  const emails = [
    <OrderReceiptEmail
      key="confirmation"
      orderId="order-1"
      items={[{ name: "Mia's Story", quantity: 1, unitPrice: 29 }]}
      total={29}
      trackUrl="https://www.ymistory.com/orders/order-1"
    />,
    <DeliveryEmail
      key="delivery"
      orderId="order-1"
      orderUrl="https://www.ymistory.com/orders/order-1"
      downloadUrl="https://www.ymistory.com/download/order-1"
    />,
    <LogisticsUpdateEmail
      key="logistics"
      orderId="order-1"
      orderUrl="https://www.ymistory.com/orders/order-1"
      status="shipped"
      statusLabel="Shipped"
    />,
  ]

  for (const email of emails) {
    const html = await render(email)
    assert.match(html, noticePattern)
    assert.match(html, /using this email address/i)
    assert.equal((html.match(noticePattern) ?? []).length, 1)
  }
})

test('keeps the unpaid checkout-resume email outside the order-access promise', async () => {
  const html = await render(
    <AbandonmentEmail
      stage={1}
      resumeUrl="https://www.ymistory.com/checkout?orderId=order-1"
      items={[]}
    />
  )

  assert.doesNotMatch(html, noticePattern)
  assert.doesNotMatch(html, new RegExp(ORDER_ACCESS_NOTICE_TEXT, 'i'))
})

test('personalizes the subject and salutation without borrowing one child’s name for another book', async () => {
  const items = [{ name: "Mia's Forest Adventure", quantity: 1, childName: '  Mia  ' }]
  const copy = buildAbandonmentEmailCopy(1, items, ' Sophie ')
  assert.equal(copy.subject, 'A little adventure is waiting for Mia')
  assert.equal(copy.greeting, 'Hi Sophie,')
  assert.equal(buildAbandonmentEmailCopy(2, items).subject, 'Where will Mia’s story take you?')
  assert.equal(buildAbandonmentEmailCopy(3, items).subject, 'A story Mia can call their own')

  const mixedItems = [...items, { name: "Jack's Ocean Adventure", quantity: 2, childName: 'Jack' }]
  const mixedCopy = buildAbandonmentEmailCopy(2, mixedItems)
  assert.equal(mixedCopy.subject, 'Where will the story take you?')
  assert.equal(mixedCopy.greeting, 'Hi there,')
  assert.match(mixedCopy.paragraphs.join(' '), /The books you chose are still in your basket/)
  assert.doesNotMatch(mixedCopy.paragraphs.join(' '), /Mia|Jack/)
  const html = await render(
    <AbandonmentEmail stage={2} resumeUrl="https://www.ymistory.com/checkout?orderId=order-1" items={mixedItems} />
  )
  assert.match(html, /Mia(?:'|&#x27;)s Forest Adventure/)
  assert.match(html, /Jack(?:'|&#x27;)s Ocean Adventure/)
  assert.match(html, /2 copies/)
})

test('uses natural unpaid-reminder copy when a legacy item has no child name', () => {
  const copy = buildAbandonmentEmailCopy(3, [{ name: 'Forest Adventure', quantity: 1 }])
  assert.equal(copy.subject, 'A story to call their own')
  assert.equal(copy.greeting, 'Hi there,')
  assert.match(copy.paragraphs.join(' '), /imagine your child reaching/)
})

test('shipped email links directly to a validated carrier URL and labels tracking-only updates', async () => {
  const trackingUrl = 'https://carrier.example/track/123'
  const html = await render(
    <LogisticsUpdateEmail
      orderId="order-1"
      orderUrl="https://www.ymistory.com/orders/order-1"
      status="shipped"
      statusLabel="Shipped"
      trackingUrl={trackingUrl}
      trackingNumber="123"
      isTrackingUpdate
    />
  )

  assert.match(html, new RegExp(trackingUrl.replaceAll('/', '\\/')))
  assert.match(html, /Shipping Details Were Updated/i)
  assert.match(html, /Track Shipment/i)
})
