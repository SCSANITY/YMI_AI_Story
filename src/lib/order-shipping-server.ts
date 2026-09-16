import 'server-only'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { readDealerSendConfig } from '@/lib/dealer-send'
import { syncShippingOrder, type ShippingSyncStore } from '@/lib/order-shipping-sync'
import { loadLogisticsOrder, notifyLogisticsUpdate } from '@/lib/order-logistics-server'
import type { AdminShippingDetails, ShippingDetails } from '@/lib/order-shipping'

const SHIPPING_STATE_SELECT = 'provider,tracking_number,binding_version,revision,auto_delivery,last_synced_at,sync_error_code,delivery_notification_pending'
export function dealerSendConfig() { return readDealerSendConfig(process.env) }

type ShippingState={provider:'dealer_send'|null;tracking_number:string|null;binding_version:number;last_synced_at:string|null;sync_error_code:string|null}
async function savedShippingDetails(orderId:string,trackingNumber:string|null,state:ShippingState|null):Promise<ShippingDetails> {
  if (!state || state.tracking_number !== trackingNumber) return { lastSyncedAt: null, unavailable: false, events: [] }
  const { data: events, error: eventError } = await supabaseAdmin.from('order_shipping_events')
    .select('event_id,source,event_time,country_code,description,created_at')
    .eq('order_id',orderId).eq('binding_version',state.binding_version)
    .order('created_at',{ascending:false}).order('event_time',{ascending:false}).limit(100)
  return { provider: state.provider, officialTrackingCoverage: 'unverified',
    lastSyncedAt: state.last_synced_at, unavailable: Boolean(eventError || state.sync_error_code),
    events: (events ?? []).map((event) => ({ id: event.event_id, source: event.source as 'dealer_send' | 'manual',
      time: event.event_time, country: event.country_code, description: event.description, recordedAt: event.created_at })) }
}

export async function readOrderShippingDetails(orderId: string, trackingNumber: string | null): Promise<ShippingDetails> {
  const { data: state, error } = await supabaseAdmin.from('order_shipping_details').select(SHIPPING_STATE_SELECT).eq('order_id',orderId).maybeSingle()
  if (error) return { lastSyncedAt: null, unavailable: true, events: [] }
  return savedShippingDetails(orderId,trackingNumber,state)
}

export async function readAdminShippingDetails(orderId: string): Promise<AdminShippingDetails> {
  const [order,{data:state,error}] = await Promise.all([loadLogisticsOrder(orderId),
    supabaseAdmin.from('order_shipping_details').select(SHIPPING_STATE_SELECT).eq('order_id',orderId).maybeSingle()])
  if (error) throw new Error('Shipping database migration is required')
  const config = dealerSendConfig()
  return { ...await savedShippingDetails(orderId,order.tracking_number,state), provider: state?.provider ?? null,
    autoDelivery: state?.auto_delivery ?? false, revision: Number(state?.revision ?? 0), orderStatus: order.order_status,
    logisticsUpdatedAt: order.logistics_updated_at, configurationReady: Boolean(config),
    deliveryMappingsReady: Boolean(config?.mappings.length), errorCode: state?.sync_error_code ?? null,
    notificationPending: state?.delivery_notification_pending ?? false }
}

const store: ShippingSyncStore = {
  async claim(orderId,force) {
    const { data,error } = await supabaseAdmin.rpc('lg_001_claim_shipping_sync',{p_order_id:orderId,p_force:force})
    if (error) throw new Error('Shipping claim failed')
    return data
  },
  async finish(orderId,lease,events,errorCode,delivery) {
    const { data,error } = await supabaseAdmin.rpc('lg_001_finish_shipping_sync',{
      p_order_id:orderId,p_token:lease.token,p_revision:lease.revision,p_events:events,
      p_error_code:errorCode,p_delivered_key:delivery?.key ?? null,p_mapping_reference:delivery?.reference ?? null,
    })
    if (error) throw new Error('Shipping sync commit failed')
    return data
  },
}

export async function retryDeliveryNotification(orderId: string) {
  const { data: state,error } = await supabaseAdmin.from('order_shipping_details')
    .select('delivery_status_event_id,delivery_notification_pending').eq('order_id',orderId).maybeSingle()
  if (error || !state?.delivery_notification_pending || !state.delivery_status_event_id) return null
  const order = await loadLogisticsOrder(orderId)
  if (order.order_status !== 'delivered') return null
  const result = await notifyLogisticsUpdate(order,state.delivery_status_event_id,{statusChanged:true,trackingDetailsChanged:false})
  if (result.emailStatus !== 'failed') {
    const { error: markerError } = await supabaseAdmin.from('order_shipping_details').update({delivery_notification_pending:false})
      .eq('order_id',orderId).eq('delivery_status_event_id',state.delivery_status_event_id)
    if (markerError) return { emailStatus:'failed',emailError:'Notification marker needs retry' }
  }
  return result
}

export async function syncOrderShipping(orderId: string,force=false) {
  const result = await syncShippingOrder(orderId,force,dealerSendConfig(),store)
  const email = result.delivered ? await retryDeliveryNotification(orderId) : null
  return { ...result, ...email }
}

export async function runShippingSyncBatch() {
  if (process.env.DEALER_SEND_SYNC_ENABLED !== 'true') return { skipped:true,reason:'disabled' }
  const started = Date.now()
  const { data: pending,error: pendingError } = await supabaseAdmin.from('order_shipping_details')
    .select('order_id').eq('delivery_notification_pending',true).order('next_sync_at').limit(5)
  if (pendingError) throw new Error('Shipping database is not ready')
  let failures=0
  let notificationsProcessed=0
  for (const row of pending ?? []) {
    if (Date.now()-started > 40_000) break
    try { await retryDeliveryNotification(row.order_id); notificationsProcessed++ }
    catch { failures++ }
  }
  // Notification retries are independent of provider credentials or delivery mappings.
  if (!dealerSendConfig()) return { skipped:true,reason:'not_configured',notificationsProcessed,failures }
  const { data: due,error } = await supabaseAdmin.from('order_shipping_details')
    .select('order_id,orders!inner(order_status)').eq('provider','dealer_send').eq('orders.order_status','shipped')
    .lte('next_sync_at',new Date().toISOString()).order('next_sync_at').limit(10)
  if (error) throw new Error('Shipping candidates unavailable')
  let processed=0
  for (const row of due ?? []) {
    if (Date.now()-started > 40_000) break
    try { const result=await syncOrderShipping(row.order_id); if (result.errorCode) failures++ }
    catch { failures++ }
    processed++
  }
  return { processed,notificationsProcessed,failures }
}
