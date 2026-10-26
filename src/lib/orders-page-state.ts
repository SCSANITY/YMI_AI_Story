export type OrdersPageState = 'loading' | 'signed_out' | 'error' | 'empty' | 'ready'

type ResolveOrdersPageStateInput = {
  isHydrated: boolean
  isAuthResolved: boolean
  customerId?: string | null
  loadedCustomerId?: string | null
  isLoading: boolean
  orderCount: number
  hasLoadError?: boolean
}

export function resolveOrdersPageState({
  isHydrated,
  isAuthResolved,
  customerId,
  loadedCustomerId,
  isLoading,
  orderCount,
  hasLoadError = false,
}: ResolveOrdersPageStateInput): OrdersPageState {
  if (!isHydrated || !isAuthResolved) return 'loading'
  if (!customerId) return 'signed_out'
  if (isLoading || loadedCustomerId !== customerId) return 'loading'
  if (hasLoadError) return 'error'
  return orderCount > 0 ? 'ready' : 'empty'
}
