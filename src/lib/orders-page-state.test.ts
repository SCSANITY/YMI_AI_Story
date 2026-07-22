import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveOrdersPageState } from './orders-page-state'

const baseInput = {
  isHydrated: true,
  isAuthResolved: true,
  customerId: 'customer-id',
  loadedCustomerId: 'customer-id',
  isLoading: false,
  orderCount: 0,
}

test('keeps the loading state until local and auth hydration both finish', () => {
  assert.equal(resolveOrdersPageState({ ...baseInput, isHydrated: false }), 'loading')
  assert.equal(resolveOrdersPageState({ ...baseInput, isAuthResolved: false }), 'loading')
})

test('shows the signed-out state only after auth resolves without a customer', () => {
  assert.equal(
    resolveOrdersPageState({ ...baseInput, customerId: null, isLoading: true }),
    'signed_out'
  )
})

test('loads authenticated order history before deciding whether it is empty', () => {
  assert.equal(resolveOrdersPageState({ ...baseInput, isLoading: true }), 'loading')
  assert.equal(
    resolveOrdersPageState({ ...baseInput, customerId: 'next-customer-id' }),
    'loading'
  )
})

test('shows the genuine empty state for an authenticated customer with no orders', () => {
  assert.equal(resolveOrdersPageState(baseInput), 'empty')
})

test('shows the order list once authenticated orders are available', () => {
  assert.equal(resolveOrdersPageState({ ...baseInput, orderCount: 2 }), 'ready')
})
