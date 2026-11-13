import assert from 'node:assert/strict'
import test from 'node:test'
import { loadUi } from './helpers/preview-uiux-harness.mjs'

const { removeCheckoutPaymentResumeStep } = loadUi('src/lib/checkout-step-navigation.ts', {}, { URLSearchParams })

test('Checkout Back removes the payment marker and preserves the order, source and anchor', () => {
  assert.equal(removeCheckoutPaymentResumeStep({
    pathname: '/checkout', search: '?orderId=1&step=payment&source=cart', hash: '#address',
  }), '/checkout?orderId=1&source=cart#address')
})

test('Checkout Back does not rewrite a URL without a payment marker', () => {
  assert.equal(removeCheckoutPaymentResumeStep({ pathname: '/checkout', search: '?step=delivery' }), null)
  assert.equal(removeCheckoutPaymentResumeStep({ pathname: '/checkout', search: '?orderId=1' }), null)
})
