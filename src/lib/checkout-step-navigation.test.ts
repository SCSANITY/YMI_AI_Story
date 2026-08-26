import assert from 'node:assert/strict'
import test from 'node:test'
import { removeCheckoutPaymentResumeStep } from './checkout-step-navigation'

test('removes the one-time payment resume marker while preserving checkout state', () => {
  assert.equal(
    removeCheckoutPaymentResumeStep({
      pathname: '/checkout',
      search: '?orderId=order-123&step=payment&ref=SAVE5',
      hash: '#payment',
    }),
    '/checkout?orderId=order-123&ref=SAVE5#payment'
  )
})

test('does not rewrite checkout URLs without the payment resume marker', () => {
  assert.equal(
    removeCheckoutPaymentResumeStep({
      pathname: '/checkout',
      search: '?orderId=order-123',
    }),
    null
  )
})
