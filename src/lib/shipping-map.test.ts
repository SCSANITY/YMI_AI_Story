import assert from 'node:assert/strict'
import test from 'node:test'
import { latestCarrierRegion } from './shipping-map'
import { SHIPPING_COUNTRY_ANCHORS, SHIPPING_WORLD_LAND_PATH } from './shipping-world-map'
import { shippingTrackingEntry } from './dealer-send-public-tracking'
import type { ShippingDetails, ShippingEvent } from './order-shipping'

const scan = (country: string | null, recordedAt: string, source: ShippingEvent['source'] = 'dealer_send'): ShippingEvent => ({
  id: country ?? source, country, recordedAt, source, time: '2026-09-16T09:00:00', description: 'Synthetic scan',
})
const details = (extra: Partial<ShippingDetails> = {}): ShippingDetails => ({
  provider: 'dealer_send', officialTrackingCoverage: 'unverified', lastSyncedAt: '2026-09-16T10:00:00Z',
  unavailable: false, events: [scan('GB', '2026-09-16T10:00:00Z')], ...extra,
})

test('map uses the latest saved carrier region, not manual notes or carrier local time', () => {
  const region = latestCarrierRegion([
    scan('US', '2026-09-16T12:00:00Z', 'manual'),
    { ...scan('HK', '2026-09-15T10:00:00Z'), time: '2099-01-01T12:00:00' },
    scan('gb', '2026-09-16T10:00:00Z'),
  ])
  assert.equal(region?.country, 'GB')
  assert.equal(region?.name, 'United Kingdom')
  assert.deepEqual(region?.anchor, SHIPPING_COUNTRY_ANCHORS.GB)
})

test('missing, manual-only and unknown regions never invent a parcel position', () => {
  assert.equal(latestCarrierRegion([]), null)
  assert.equal(latestCarrierRegion([scan(null, '2026-09-16T10:00:00Z')]), null)
  assert.equal(latestCarrierRegion([scan('GB', '2026-09-16T10:00:00Z', 'manual')]), null)
  assert.equal(latestCarrierRegion([scan('London', '2026-09-16T10:00:00Z')]), null)
  const unknown = latestCarrierRegion([scan('GB', '2026-09-15T10:00:00Z'), scan('ZZ', '2026-09-16T10:00:00Z')])
  assert.equal(unknown?.country, 'ZZ')
  assert.equal(unknown?.anchor, null)
})

test('map assets are bounded geographic outlines and label anchors', () => {
  assert.ok(SHIPPING_WORLD_LAND_PATH.length < 50_000)
  assert.match(SHIPPING_WORLD_LAND_PATH, /^M/)
  assert.ok(Object.keys(SHIPPING_COUNTRY_ANCHORS).length > 200)
  for (const [country, anchor] of Object.entries(SHIPPING_COUNTRY_ANCHORS)) {
    assert.match(country, /^[A-Z]{2}$/)
    assert.ok(anchor.x >= 0 && anchor.x <= 720 && anchor.y >= 0 && anchor.y <= 320)
  }
  assert.ok(SHIPPING_COUNTRY_ANCHORS.HK.x > SHIPPING_COUNTRY_ANCHORS.GB.x)
})

test('verified provider binding gets a default public entry without DB backfill', () => {
  const entry = shippingTrackingEntry({ details: details(), trackingNumber: 'SYNTHETIC' })
  assert.deepEqual(entry, { url: 'https://apiv2.dealer-send.com/en/Tracking', generic: true })
  assert.equal(shippingTrackingEntry({ details: details({ provider: null }), trackingNumber: 'SYNTHETIC' }), null)
  assert.equal(shippingTrackingEntry({ details: details(), trackingNumber: '' }), null)
  assert.equal(shippingTrackingEntry({ trackingNumber: 'SYNTHETIC' }), null)
  assert.equal(shippingTrackingEntry({ trackingNumber: 'SYNTHETIC', trackingCarrier: 'Dealer Send' })?.generic, true)
  assert.equal(shippingTrackingEntry({ trackingNumber: 'SYNTHETIC', trackingCarrier: 'Other carrier via Dealer Send' }), null)
})

test('equivalence must be explicit, with successful carrier history; outage restores the entry', () => {
  const options = { trackingNumber: 'SYNTHETIC', trackingUrl: 'https://apiv2.dealer-send.com/en/Tracking' }
  assert.ok(shippingTrackingEntry({ ...options, details: details() }))
  assert.equal(shippingTrackingEntry({ ...options, details: details({ officialTrackingCoverage: 'equivalent' }) }), null)
  assert.ok(shippingTrackingEntry({ ...options, trackingUrl: 'https://carrier.example/track?id=SYNTHETIC', details: details({ officialTrackingCoverage: 'equivalent' }) }))
  for (const extra of [{ unavailable: true }, { events: [] }, { lastSyncedAt: null }, { events: [scan('GB', '2026-09-16T10:00:00Z', 'manual')] }]) {
    assert.ok(shippingTrackingEntry({ ...options, details: details({ officialTrackingCoverage: 'equivalent', ...extra }) }))
  }
})

test('customer URLs are HTTPS public pages, not credentials or API endpoints', () => {
  const safe = 'https://carrier.example/track?id=SYNTHETIC'
  assert.equal(shippingTrackingEntry({ trackingUrl: safe })?.url, safe)
  for (const url of ['javascript:alert(1)', 'http://carrier.example/track', 'https://user:password@carrier.example/',
    'https://apiv2.dealer-send.com/api/Portalapi/GetTrackingDetails?ApiKey=REDACTED', 'https://carrier.example/track?token=REDACTED']) {
    assert.equal(shippingTrackingEntry({ trackingUrl: url }), null)
    assert.equal(shippingTrackingEntry({ details: details(), trackingNumber: 'SYNTHETIC', trackingUrl: url })?.generic, true)
  }
})
