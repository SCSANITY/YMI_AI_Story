import assert from 'node:assert/strict'
import test from 'node:test'
import * as React from 'react'
import { render } from '@react-email/render'
import { AbandonmentEmail } from './AbandonmentEmail'
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
