import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildMyBooksShelfPath,
  parseMyBooksShelf,
  resolveInitialMyBooksShelf,
} from './myBooksShelf'

test('accepts only supported shelf query values', () => {
  assert.equal(parseMyBooksShelf('purchased'), 'purchased')
  assert.equal(parseMyBooksShelf('previews'), 'previews')
  assert.equal(parseMyBooksShelf('archived'), null)
  assert.equal(parseMyBooksShelf(null), null)
})

test('uses the requested shelf even when it is empty', () => {
  assert.equal(resolveInitialMyBooksShelf('purchased', 0), 'purchased')
  assert.equal(resolveInitialMyBooksShelf('previews', 3), 'previews')
})

test('defaults to purchased when available and previews otherwise', () => {
  assert.equal(resolveInitialMyBooksShelf(null, 2), 'purchased')
  assert.equal(resolveInitialMyBooksShelf('invalid', 0), 'previews')
})

test('updates only the shelf query while preserving other URL state', () => {
  assert.equal(
    buildMyBooksShelfPath('https://www.ymistory.com/my-books?source=account#library', 'previews'),
    '/my-books?source=account&shelf=previews#library'
  )
})
