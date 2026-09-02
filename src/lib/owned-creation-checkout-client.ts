type FetchLike = typeof fetch

type StartOwnedCreationCheckoutOptions = {
  creationId: string
  customerId?: string | null
  fetcher?: FetchLike
}

export type OwnedCreationCheckout = {
  checkoutHref: string
  cartItems: unknown[]
  cartItemIds: string[]
  orderId: string
}

export async function startOwnedCreationCheckout({
  creationId,
  customerId,
  fetcher = fetch,
}: StartOwnedCreationCheckoutOptions): Promise<OwnedCreationCheckout> {
  const response = await fetcher('/api/orders/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      customerId: customerId ?? null,
      items: [{ creationId, quantity: 1 }],
    }),
  })

  if (!response.ok) {
    throw new Error('Failed to start checkout')
  }

  const data = await response.json().catch(() => null)
  const orderId = typeof data?.orderId === 'string' ? data.orderId : ''
  const cartItemIds = Array.isArray(data?.cartItemIds)
    ? data.cartItemIds.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
    : []

  if (!orderId || cartItemIds.length === 0) {
    throw new Error('Checkout response is incomplete')
  }

  const params = new URLSearchParams({
    ids: cartItemIds.join(','),
    orderId,
  })
  const cartParams = new URLSearchParams({ ids: cartItemIds.join(',') })
  if (customerId) cartParams.set('customerId', customerId)

  let cartItems: unknown[] = []
  try {
    const cartResponse = await fetcher(`/api/cart?${cartParams.toString()}`, {
      credentials: 'include',
      cache: 'no-store',
    })
    if (cartResponse.ok) {
      const cartData = await cartResponse.json().catch(() => null)
      cartItems = Array.isArray(cartData?.items) ? cartData.items : []
    }
  } catch {
    // Checkout can recover its items from the order and cart item IDs in the URL.
  }

  return {
    checkoutHref: `/checkout?${params.toString()}`,
    cartItems,
    cartItemIds,
    orderId,
  }
}
