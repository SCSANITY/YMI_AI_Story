import { DealerSendError, fetchDealerSendTracking, verifiedDelivery, type DealerSendConfig, type DealerSendEvent } from './dealer-send'

export type ShippingLease = { token: string; trackingNumber: string; revision: number; bindingVersion: number }
export type ShippingSyncResult = { stale?: boolean; synced?: boolean; delivered?: boolean; statusEventId?: string | null; skipped?: boolean; errorCode?: string }
export type ShippingSyncStore = {
  claim: (orderId: string, force: boolean) => Promise<ShippingLease | null>
  finish: (orderId: string, lease: ShippingLease, events: DealerSendEvent[], errorCode: string | null,
    delivery: { key: string; reference: string } | null) => Promise<ShippingSyncResult>
}

export async function syncShippingOrder(orderId: string, force: boolean, config: DealerSendConfig | null,
  store: ShippingSyncStore, fetcher: typeof fetch = fetch): Promise<ShippingSyncResult> {
  if (!config) return { skipped: true, errorCode: 'not_configured' }
  const lease = await store.claim(orderId, force)
  if (!lease) return { skipped: true }
  let events: DealerSendEvent[]
  try { events = await fetchDealerSendTracking(config, lease.trackingNumber, fetcher) }
  catch (error) {
    const code = error instanceof DealerSendError ? error.code : 'provider_unavailable'
    await store.finish(orderId, lease, [], code, null)
    return { synced: false, errorCode: code }
  }
  try { return await store.finish(orderId, lease, events, null, verifiedDelivery(events, config.mappings)) }
  catch {
    // A transaction rejected by the existing DB guard must not leave the lease stuck.
    await store.finish(orderId, lease, [], 'database_rejected', null)
    return { synced: false, errorCode: 'database_rejected' }
  }
}
