import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeAppPathname } from './app-pathname'

test('normalizes the root prerender fallback without changing real routes', () => {
  assert.equal(normalizeAppPathname(null), '/')
  assert.equal(normalizeAppPathname(undefined), '/')
  assert.equal(normalizeAppPathname(''), '/')
  assert.equal(normalizeAppPathname('/books'), '/books')
})
