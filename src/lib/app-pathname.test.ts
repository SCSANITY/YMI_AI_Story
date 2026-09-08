import assert from 'node:assert/strict'
import test from 'node:test'
import { layoutSegmentsToPathname } from './app-pathname'

test('derives a stable pathname from the root layout route segments', () => {
  assert.equal(layoutSegmentsToPathname([]), '/')
  assert.equal(layoutSegmentsToPathname(['books']), '/books')
  assert.equal(layoutSegmentsToPathname(['orders', 'order-123']), '/orders/order-123')
  assert.equal(layoutSegmentsToPathname(['(store)', 'books']), '/books')
})
