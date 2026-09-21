import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeShippingAddress,
  recipientAddressIssue,
  shippingStreet,
} from './shipping-address'

const recipient = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'buyer@example.com',
  recipientEmail: 'receiver@example.com',
  company: 'YMI Story',
  phone: '+442012345678',
  country: 'gb',
  region: 'Greater London',
  city: 'London',
  zip: 'WC1B 3DG',
  addressLine1: '1 Example Street',
  addressLine2: 'Floor 2',
  addressLine3: 'Reception',
  vatNumber: 'GB123456789',
  eoriNumber: 'GB123456789000',
  iossNumber: 'IM1234567890',
}

test('Dealer Send portal fields survive canonical JSONB address normalization', () => {
  const address = normalizeShippingAddress({ ...recipient, extra: 'not stored' })
  assert.equal(address.country, 'GB')
  assert.equal(address.zip, 'WC1B 3DG')
  assert.equal(address.addressLine3, 'Reception')
  assert.equal(address.recipientEmail, 'receiver@example.com')
  assert.equal(address.vatNumber, 'GB123456789')
  assert.equal(address.eoriNumber, 'GB123456789000')
  assert.equal(address.iossNumber, 'IM1234567890')
  assert.equal('extra' in address, false)
  assert.equal(recipientAddressIssue(address), null)
  assert.equal(shippingStreet(address), '1 Example Street, Floor 2, Reception')
})

test('required region and portal field limits are enforced before persistence', () => {
  assert.equal(recipientAddressIssue(normalizeShippingAddress({ ...recipient, region: '' })), 'region')
  assert.equal(recipientAddressIssue(normalizeShippingAddress({ ...recipient, zip: 'A'.repeat(21) })), 'zip')
  assert.equal(recipientAddressIssue(normalizeShippingAddress({ ...recipient, addressLine3: 'A'.repeat(31) })), 'addressLine3')
  assert.equal(recipientAddressIssue(normalizeShippingAddress({ ...recipient, firstName: 'A'.repeat(34) })), 'name')
  assert.equal(recipientAddressIssue(normalizeShippingAddress({ ...recipient, recipientEmail: 'not-an-email' })), 'recipientEmail')
})
