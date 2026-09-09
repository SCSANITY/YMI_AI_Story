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
      orderId="order-1"
      resumeUrl="https://www.ymistory.com/checkout?orderId=order-1"
      items={[]}
    />
  )

  assert.doesNotMatch(html, noticePattern)
  assert.doesNotMatch(html, new RegExp(ORDER_ACCESS_NOTICE_TEXT, 'i'))
})

test('personalizes the unpaid checkout reminder from the story child name', async () => {
  const items = [{ name: "Mia's Forest Adventure", quantity: 1, childName: '  Mia  ' }]
  const copy = buildAbandonmentEmailCopy(items)

  assert.deepEqual(copy, {
    subject: 'Mia’s magical journey is waiting! ✨',
    title: 'Mia’s magical journey is waiting! ✨',
    body: 'You’re just one step away from bringing this Magical Story to life. We’ve saved your personalized preview so you can pick up right where you left off. Give Mia a gift they’ll treasure forever—your reserved copy is ready for printing!',
    cta: "Bring Mia's Story Home",
  })

  const html = await render(
    <AbandonmentEmail
      orderId="order-1"
      resumeUrl="https://www.ymistory.com/checkout?orderId=order-1"
      items={items}
    />
  )

  assert.match(html, /Mia’s magical journey is waiting! ✨/)
  assert.match(html, /Give Mia a gift they’ll treasure forever—your reserved copy is ready for printing!/)
  assert.match(html, /Bring Mia(?:'|&#x27;)s Story Home/)
  assert.doesNotMatch(html, /Still Interested in Your Story|Resume Checkout/)
})

test('uses natural unpaid-reminder copy when a legacy item has no child name', () => {
  assert.deepEqual(buildAbandonmentEmailCopy([]), {
    subject: 'Your magical journey is waiting! ✨',
    title: 'Your magical journey is waiting! ✨',
    body: 'You’re just one step away from bringing this Magical Story to life. We’ve saved your personalized preview so you can pick up right where you left off. Give someone special a gift they’ll treasure forever—your reserved copy is ready for printing!',
    cta: 'Bring This Story Home',
  })
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
