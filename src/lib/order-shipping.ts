export type ShippingEvent = {
  id: string
  source: 'dealer_send' | 'manual'
  time: string | null
  country: string | null
  description: string
  recordedAt: string
}

export type ShippingDetails = {
  lastSyncedAt: string | null
  unavailable: boolean
  events: ShippingEvent[]
}

export type AdminShippingDetails = ShippingDetails & {
  provider: 'dealer_send' | null
  autoDelivery: boolean
  revision: number
  orderStatus: string
  logisticsUpdatedAt: string | null
  configurationReady: boolean
  deliveryMappingsReady: boolean
  errorCode: string | null
  notificationPending: boolean
}

export function shippingFallback(details: ShippingDetails | null | undefined) {
  if (details?.unavailable) return 'Tracking updates are temporarily unavailable. Previously received information is shown below.'
  if (!details?.events.length) return 'No detailed tracking updates are available yet. Updates appear when the carrier provides them.'
  return null
}
