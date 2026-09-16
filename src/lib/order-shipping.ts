export type ShippingEvent = {
  id: string
  source: 'dealer_send' | 'manual'
  time: string | null
  country: string | null
  description: string
  recordedAt: string
}

export type ShippingDetails = {
  provider?: 'dealer_send' | null
  // Set to equivalent only after a verified API/public-portal comparison.
  // Saved events, successful polling and delivery status alone are not proof.
  officialTrackingCoverage?: 'unverified' | 'equivalent'
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
