import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveReadIdentity, withReadIdentity } from './read-identity'

test('read identity stays unresolved until auth hydration completes', () => {
  assert.equal(resolveReadIdentity(false, 'customer-1'), null)
  assert.deepEqual(resolveReadIdentity(true, null), { key: 'anon', expectCustomer: false })
  assert.deepEqual(resolveReadIdentity(true, ' customer-1 '), { key: 'customer:customer-1', expectCustomer: true })
})

test('customer read requests carry an expectation without an identifier', () => {
  const request = withReadIdentity(resolveReadIdentity(true, 'customer-1'), { method: 'GET' })
  assert.equal(new Headers(request.headers).get('X-YMI-Expect-Customer'), '1')
})
