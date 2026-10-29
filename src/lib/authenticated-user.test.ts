import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAuthenticatedClaims } from './authenticated-claims'

test('claims identity rejects expired or invalid verification results locally', () => {
  assert.equal(parseAuthenticatedClaims(null, new Error('token expired')), null)
  assert.equal(parseAuthenticatedClaims({ claims: {} }, null), null)
  assert.equal(parseAuthenticatedClaims({ claims: { sub: '   ' } }, null), null)
})

test('claims identity keeps only the verified subject and email', () => {
  assert.deepEqual(
    parseAuthenticatedClaims({ claims: { sub: 'user-1', email: 'reader@example.com' } }, null),
    { id: 'user-1', email: 'reader@example.com' }
  )
})
