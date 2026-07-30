import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filterActiveCartItems } from './cart-lifecycle'

test('active cart keeps unpaid checkout items and excludes paid items', () => {
  const items = [
    { id: 'plain-cart', status: 'cart', order_id: null },
    { id: 'unpaid-cart', status: 'cart', order_id: 'unpaid-order' },
    { id: 'unpaid-ordered', status: 'ordered', order_id: 'unpaid-order' },
    { id: 'paid-cart-race', status: 'cart', order_id: 'paid-order' },
    { id: 'paid-ordered', status: 'ordered', order_id: 'paid-order' },
    { id: 'orphan-ordered', status: 'ordered', order_id: 'missing-order' },
  ]

  const visible = filterActiveCartItems(items, [
    { order_id: 'unpaid-order', order_status: 'unpaid', payment_id: null },
    { order_id: 'paid-order', order_status: 'paid', payment_id: 'payment-1' },
  ])

  assert.deepEqual(visible.map((item) => item.id), [
    'plain-cart',
    'unpaid-cart',
    'unpaid-ordered',
  ])
})
