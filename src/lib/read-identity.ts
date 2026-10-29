export type ReadIdentity = {
  key: string
  expectCustomer: boolean
}

export function nextReadIdentity(
  previous: ReadIdentity | null,
  customerId?: string | null
): ReadIdentity {
  const normalizedCustomerId = String(customerId ?? '').trim()
  const next = normalizedCustomerId
    ? { key: `customer:${normalizedCustomerId}`, expectCustomer: true }
    : { key: 'anon', expectCustomer: false }
  return previous?.key === next.key ? previous : next
}

export function resolveReadIdentity(
  isAuthResolved: boolean | undefined,
  customerId?: string | null
): ReadIdentity | null {
  if (isAuthResolved === false) return null
  return nextReadIdentity(null, customerId)
}

export function withReadIdentity(
  identity: ReadIdentity | null,
  init: RequestInit = {}
): RequestInit {
  if (!identity?.expectCustomer) return init
  if (typeof Headers === 'function') {
    const headers = new Headers(init.headers)
    headers.set('X-YMI-Expect-Customer', '1')
    return { ...init, headers }
  }
  return {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      'X-YMI-Expect-Customer': '1',
    },
  }
}
