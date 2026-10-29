import test from 'node:test'
import assert from 'node:assert/strict'
import { nextReadIdentity, resolveReadIdentity, withReadIdentity } from './read-identity'

test('read identity stays unresolved until auth hydration completes', () => {
  assert.equal(resolveReadIdentity(false, 'customer-1'), null)
  assert.deepEqual(resolveReadIdentity(true, null), { key: 'anon', expectCustomer: false })
  assert.deepEqual(resolveReadIdentity(true, ' customer-1 '), { key: 'customer:customer-1', expectCustomer: true })
})

test('customer read requests carry an expectation without an identifier', () => {
  const request = withReadIdentity(resolveReadIdentity(true, 'customer-1'), { method: 'GET' })
  assert.equal(new Headers(request.headers).get('X-YMI-Expect-Customer'), '1')
})

test('read identity preserves object identity for the same key and replaces it on change', () => {
  const customerA = nextReadIdentity(null, 'a')
  assert.strictEqual(nextReadIdentity(customerA, 'a'), customerA)
  const customerB = nextReadIdentity(customerA, 'b')
  assert.notStrictEqual(customerB, customerA)
  assert.deepEqual(nextReadIdentity(null, null), { key: 'anon', expectCustomer: false })
  assert.deepEqual(nextReadIdentity(null, 'a'), { key: 'customer:a', expectCustomer: true })
})
