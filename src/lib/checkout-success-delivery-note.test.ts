import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldShowCheckoutSuccessDeliveryNote } from './checkout-success-delivery-note'

test('hides the delivery note until payment facts are ready', () => {
  assert.equal(
    shouldShowCheckoutSuccessDeliveryNote({
      paymentFactsReady: false,
      orderStatus: 'paid',
    }),
    false,
  )
})

test('shows the delivery note for paid-like order states', () => {
  for (const orderStatus of ['paid', 'processing', 'production', 'shipped', 'delivered']) {
    assert.equal(
      shouldShowCheckoutSuccessDeliveryNote({ paymentFactsReady: true, orderStatus }),
      true,
      orderStatus,
    )
  }
})

test('hides the delivery note for unpaid, cancelled, refunded, or unknown states', () => {
  for (const orderStatus of ['unpaid', 'cancelled', 'refunded', 'unknown', null]) {
    assert.equal(
      shouldShowCheckoutSuccessDeliveryNote({ paymentFactsReady: true, orderStatus }),
      false,
      String(orderStatus),
    )
  }
})
