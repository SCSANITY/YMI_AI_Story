import assert from 'node:assert/strict'
import test from 'node:test'
import { startOwnedCreationCheckout } from './owned-creation-checkout-client'

test('starts a one-copy checkout and hydrates the created checkout item', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = []
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init })
    if (String(url) === '/api/orders/start') {
      return Response.json({ orderId: 'order-1', cartItemIds: ['cart-1'] })
    }
    return Response.json({ items: [{ cart_item_id: 'cart-1' }] })
  }) as typeof fetch

  const result = await startOwnedCreationCheckout({
    creationId: 'creation-1',
    customerId: 'customer-1',
    fetcher,
  })

  assert.deepEqual(JSON.parse(String(requests[0].init?.body)), {
    customerId: 'customer-1',
    items: [{ creationId: 'creation-1', quantity: 1 }],
  })
  assert.equal(requests[1].url, '/api/cart?ids=cart-1&customerId=customer-1')
  assert.equal(result.checkoutHref, '/checkout?ids=cart-1&orderId=order-1')
  assert.deepEqual(result.cartItems, [{ cart_item_id: 'cart-1' }])
})

test('still enters checkout when optional cart hydration fails', async () => {
  const fetcher = (async (url: string | URL | Request) => {
    if (String(url) === '/api/orders/start') {
      return Response.json({ orderId: 'order-2', cartItemIds: ['cart-2'] })
    }
    throw new Error('temporary cart read failure')
  }) as typeof fetch

  const result = await startOwnedCreationCheckout({ creationId: 'creation-2', fetcher })

  assert.equal(result.checkoutHref, '/checkout?ids=cart-2&orderId=order-2')
  assert.deepEqual(result.cartItems, [])
})

test('fails closed when order creation or its response contract fails', async () => {
  const rejected = (async () => new Response(null, { status: 500 })) as typeof fetch
  await assert.rejects(
    startOwnedCreationCheckout({ creationId: 'creation-3', fetcher: rejected }),
    /Failed to start checkout/
  )

  const incomplete = (async () => Response.json({ orderId: 'order-3', cartItemIds: [] })) as typeof fetch
  await assert.rejects(
    startOwnedCreationCheckout({ creationId: 'creation-3', fetcher: incomplete }),
    /Checkout response is incomplete/
  )
})
