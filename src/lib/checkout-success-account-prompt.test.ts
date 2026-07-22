import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveCheckoutSuccessAccountPromptEmail } from './checkout-success-account-prompt'

const baseInput = {
  isHydrated: true,
  isAuthResolved: true,
  customerId: null,
  paymentFactsReady: true,
  orderStatus: 'paid',
  orderEmail: ' Guest@Example.com ',
}

test('shows the continuity prompt for a signed-out customer after paid facts resolve', () => {
  assert.equal(resolveCheckoutSuccessAccountPromptEmail(baseInput), 'guest@example.com')
})

test('waits for both client and auth hydration before showing a guest prompt', () => {
  assert.equal(
    resolveCheckoutSuccessAccountPromptEmail({ ...baseInput, isHydrated: false }),
    null
  )
  assert.equal(
    resolveCheckoutSuccessAccountPromptEmail({ ...baseInput, isAuthResolved: false }),
    null
  )
})

test('never shows the guest prompt to an authenticated customer', () => {
  assert.equal(
    resolveCheckoutSuccessAccountPromptEmail({ ...baseInput, customerId: 'customer-id' }),
    null
  )
})

test('does not render before payment facts or for a non-paid-like status', () => {
  assert.equal(
    resolveCheckoutSuccessAccountPromptEmail({ ...baseInput, paymentFactsReady: false }),
    null
  )
  assert.equal(
    resolveCheckoutSuccessAccountPromptEmail({ ...baseInput, orderStatus: 'unpaid' }),
    null
  )
  assert.equal(
    resolveCheckoutSuccessAccountPromptEmail({ ...baseInput, orderStatus: 'refunded' }),
    null
  )
})

test('requires the server-confirmed order email used for account prefill', () => {
  assert.equal(
    resolveCheckoutSuccessAccountPromptEmail({ ...baseInput, orderEmail: '   ' }),
    null
  )
})
