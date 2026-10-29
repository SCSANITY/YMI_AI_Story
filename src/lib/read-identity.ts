export type ReadIdentity = {
  key: string
  expectCustomer: boolean
}

export function resolveReadIdentity(
  isAuthResolved: boolean | undefined,
  customerId?: string | null
): ReadIdentity | null {
  if (isAuthResolved === false) return null
  const normalizedCustomerId = String(customerId ?? '').trim()
  return normalizedCustomerId
    ? { key: `customer:${normalizedCustomerId}`, expectCustomer: true }
    : { key: 'anon', expectCustomer: false }
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
