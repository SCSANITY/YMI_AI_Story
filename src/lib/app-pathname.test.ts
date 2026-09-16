import assert from 'node:assert/strict'
import test from 'node:test'
import { isPrimaryNavigationRoute, layoutSegmentsToPathname } from './app-pathname'

test('derives a stable pathname from the root layout route segments', () => {
  assert.equal(layoutSegmentsToPathname([]), '/')
  assert.equal(layoutSegmentsToPathname(['books']), '/books')
  assert.equal(layoutSegmentsToPathname(['orders', 'order-123']), '/orders/order-123')
  assert.equal(layoutSegmentsToPathname(['(store)', 'books']), '/books')
})

test('all primary header destinations omit Back regardless of navigation history', () => {
  for (const pathname of ['/', '/books', '/favorites', '/my-books', '/collaboration', '/support', '/orders', '/account']) {
    assert.equal(isPrimaryNavigationRoute(pathname), true, pathname)
  }
})

test('primary route matching does not suppress descendants or purchase-flow Back', () => {
  for (const pathname of ['/orders/order-123', '/my-books/creation-123', '/support/order-123',
    '/books/details', '/personalize/Explorer_story', '/cart', '/privacy', '/bookshelf']) {
    assert.equal(isPrimaryNavigationRoute(pathname), false, pathname)
  }
})

test('layout groups and repeated primary/detail transitions use the same route rule', () => {
  const visits = [
    { segments: [], primary: true },
    { segments: ['(store)', 'books'], primary: true },
    { segments: ['favorites'], primary: true },
    { segments: ['orders', 'order-123'], primary: false },
    { segments: ['orders'], primary: true },
    { segments: ['my-books', 'creation-123'], primary: false },
    { segments: ['my-books'], primary: true },
    { segments: ['cart'], primary: false },
    { segments: [], primary: true },
  ]
  for (const { segments, primary } of visits) {
    assert.equal(isPrimaryNavigationRoute(layoutSegmentsToPathname(segments)), primary)
  }
})
