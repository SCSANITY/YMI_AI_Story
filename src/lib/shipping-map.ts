import type { ShippingEvent } from './order-shipping'
import { SHIPPING_COUNTRY_ANCHORS } from './shipping-world-map'

// Choose the latest SAVED carrier region. Carrier local times have no guaranteed
// timezone/chronology. Manual notes and the customer's address are not telemetry.
export function latestCarrierRegion(events: ShippingEvent[]) {
  const candidates = events.filter(event => event.source === 'dealer_send' && /^[a-z]{2}$/i.test(event.country?.trim() ?? ''))
  const latest = candidates.reduce<ShippingEvent | null>((selected, event) => {
    if (!selected) return event
    const next = Date.parse(event.recordedAt)
    const previous = Date.parse(selected.recordedAt)
    return Number.isFinite(next) && (!Number.isFinite(previous) || next > previous) ? event : selected
  }, null)
  if (!latest) return null
  const country = latest.country!.trim().toUpperCase()
  const anchor = SHIPPING_COUNTRY_ANCHORS[country] ?? null
  return { country, name: anchor?.name ?? country, anchor, event: latest }
}
