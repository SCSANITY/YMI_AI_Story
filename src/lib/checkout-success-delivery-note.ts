import { isPaidLikeOrderStatus } from '@/lib/order-status'

type CheckoutSuccessDeliveryNoteInput = {
  paymentFactsReady: boolean
  orderStatus?: string | null
}

export function shouldShowCheckoutSuccessDeliveryNote({
  paymentFactsReady,
  orderStatus,
}: CheckoutSuccessDeliveryNoteInput): boolean {
  return paymentFactsReady && isPaidLikeOrderStatus(orderStatus)
}
