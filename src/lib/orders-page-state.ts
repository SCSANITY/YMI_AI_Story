export type OrdersPageState = 'loading' | 'signed_out' | 'empty' | 'ready'

type ResolveOrdersPageStateInput = {
  isHydrated: boolean
  isAuthResolved: boolean
  customerId?: string | null
  loadedCustomerId?: string | null
  isLoading: boolean
  orderCount: number
}

export function resolveOrdersPageState({
  isHydrated,
  isAuthResolved,
  customerId,
  loadedCustomerId,
  isLoading,
  orderCount,
}: ResolveOrdersPageStateInput): OrdersPageState {
  if (!isHydrated || !isAuthResolved) return 'loading'
  if (!customerId) return 'signed_out'
  if (isLoading || loadedCustomerId !== customerId) return 'loading'
  return orderCount > 0 ? 'ready' : 'empty'
}
