import { isPaidLikeOrderStatus } from '@/lib/order-status'

type CheckoutSuccessAccountPromptInput = {
  isHydrated: boolean
  isAuthResolved: boolean
  customerId?: string | null
  paymentFactsReady: boolean
  orderStatus?: string | null
  orderEmail?: string | null
}

export function resolveCheckoutSuccessAccountPromptEmail({
  isHydrated,
  isAuthResolved,
  customerId,
  paymentFactsReady,
  orderStatus,
  orderEmail,
}: CheckoutSuccessAccountPromptInput) {
  if (
    !isHydrated ||
    !isAuthResolved ||
    customerId ||
    !paymentFactsReady ||
    !isPaidLikeOrderStatus(orderStatus)
  ) {
    return null
  }

  const normalizedEmail = String(orderEmail || '').trim().toLowerCase()
  return normalizedEmail || null
}
