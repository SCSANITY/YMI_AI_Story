import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8')

test('recipient address extras reach both database JSONB paths and order display', async () => {
  const [checkout, form, savedAddress, session, order] = await Promise.all([
    read('app/checkout/page.tsx'),
    read('app/checkout/AddressFormSection.tsx'),
    read('app/api/user/addresses/route.ts'),
    read('app/api/checkout/session/route.ts'),
    read('app/orders/[orderID]/OrderDetailPanels.tsx'),
  ])
  for (const field of ['addressLine3', 'recipientEmail', 'vatNumber', 'eoriNumber', 'iossNumber']) {
    assert.match(checkout, new RegExp(`${field}: form\\.${field}\\.trim\\(\\)`))
    assert.match(form, new RegExp(`['"]${field}['"]`))
  }
  assert.match(form, /value=\{form\.addressLine3\}/)
  assert.match(form, /value=\{form\.recipientEmail\}/)
  assert.match(form, /value=\{form\[field\]\}/)
  assert.match(savedAddress, /normalizeShippingAddress\(body\?\.address \?\? body\)/)
  assert.match(savedAddress, /metadata: address/)
  assert.match(session, /normalizeShippingAddress\(body\?\.shippingAddress\)/)
  assert.match(session, /shipping_address: shippingAddress/)
  assert.match(order, /address\.addressLine3/)
  assert.doesNotMatch(form, /rawValue\.replace\(\/\\D\/g, ''\)/)
})
