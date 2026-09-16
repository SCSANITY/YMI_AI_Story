import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
const read=(path)=>readFile(new URL('../'+path,import.meta.url),'utf8')

test('shipping is a supplemental detail, not a new order lifecycle or client provider fetch',async()=>{
  const [tracker,panel,reader]=await Promise.all([read('app/orders/[orderID]/LogisticsTracker.tsx'),read('app/orders/[orderID]/ShippingDetailsPanel.tsx'),read('src/lib/customer-orders-server.ts')])
  assert.match(tracker,/\['shipped','delivered'\]\.includes\(normalizeOrderStatus\(status\)\)/)
  assert.match(tracker,/ShippingDetailsPanel/)
  assert.doesNotMatch(panel,/fetch\(|useEffect|DEALER_SEND|ApiKey/)
  assert.match(reader,/const shippingReads = options.reference/)
  assert.match(reader,/Promise.all\(\[createSignedStorageUrlMap\(finalPdfRequests\), shippingReads\]\)/)
})

test('new admin handlers are private and authenticated before any order or provider operation',async()=>{
  for (const path of ['app/api/admin/orders/[orderId]/shipping/route.ts','app/api/admin/orders/[orderId]/logistics/route.ts']) {
    const source=await read(path)
    assert.match(source,/noStoreJson/);assert.match(source,/requireAdminCustomer/)
    assert.ok(source.indexOf('const admin=')<source.indexOf('const order=') || source.indexOf('const admin =')<source.indexOf('const order ='))
    assert.doesNotMatch(source,/\.from\('orders'\)\.update|sendLogisticsUpdateEmail/)
  }
})

test('logistics save is transactional and reuses Voice readiness and existing notification authority',async()=>{
  const [server,email,sql]=await Promise.all([read('src/lib/order-logistics-server.ts'),read('src/lib/email.tsx'),read('tests/fixtures/external-contracts/sql/20260916_173000_lg_001_shipping_details.sql')])
  assert.match(server,/stampSignatureVoiceShipmentIntegrity/);assert.match(server,/rpc\('lg_001_save_order_logistics'/)
  assert.match(sql,/FOR UPDATE/);assert.match(sql,/UPDATE public.orders/);assert.match(sql,/INSERT INTO public.order_status_events/)
  assert.match(sql,/revision = revision \+ 1/);assert.match(sql,/lease_token = NULL/)
  assert.match(sql,/DO \$lg_001_migration\$/)
  assert.match(sql,/v_status_changed OR v_binding_changed OR v_provider IS NULL THEN v_auto := false/)
  assert.doesNotMatch(sql,/ALTER TYPE|DROP TRIGGER|DISABLE TRIGGER|ALTER TABLE public.orders/)
  assert.match(email,/idempotencyKey: `logistics_update:\$\{params.orderId\}:\$\{params.logisticsEventId\}`,\s*retryFailed: true/)
})

test('sync is service-only, revision guarded, bounded and opt-in, with no guessed delivery',async()=>{
  const [server,sql]=await Promise.all([read('src/lib/order-shipping-server.ts'),read('tests/fixtures/external-contracts/sql/20260916_173000_lg_001_shipping_details.sql')])
  assert.match(server,/import 'server-only'/);assert.match(server,/\.limit\(10\)/);assert.match(server,/40_000/)
  assert.match(server,/eq\('orders.order_status','shipped'\)/)
  assert.match(sql,/v_state.revision <> p_revision/);assert.match(sql,/v_state.auto_delivery AND v_order.order_status::text = 'shipped'/)
  assert.match(sql,/FROM PUBLIC, anon, authenticated/);assert.match(sql,/TO service_role/)
  assert.match(sql,/delivery_notification_pending = CASE WHEN v_delivered THEN true/)
  assert.match(sql,/ON CONFLICT DO NOTHING/);assert.match(sql,/binding_version/)
})

test('cron uses existing constant-time authorization and is disabled before any database IO by default',async()=>{
  const [route,server,config]=await Promise.all([read('app/api/internal/shipping-sync/route.ts'),read('src/lib/order-shipping-server.ts'),read('vercel.json')])
  assert.match(route,/if \(!isInternalRequestAuthorized\(request\)\)/);assert.match(route,/maxDuration=60/)
  const batch=server.slice(server.indexOf('export async function runShippingSyncBatch'))
  assert.ok(batch.indexOf("DEALER_SEND_SYNC_ENABLED !== 'true'")<batch.indexOf(".from('order_shipping_details')"))
  assert.ok(batch.indexOf('retryDeliveryNotification(row.order_id)')<batch.indexOf('if (!dealerSendConfig())'))
  assert.deepEqual(JSON.parse(config).crons.find((cron)=>cron.path==='/api/internal/shipping-sync'),{path:'/api/internal/shipping-sync',schedule:'0 2 * * *'})
})

test('customer DTO allows descriptions/provenance but excludes raw carrier codes and secret configuration',async()=>{
  const [types,server]=await Promise.all([read('src/lib/order-shipping.ts'),read('src/lib/order-shipping-server.ts')])
  const customer=types.slice(0,types.indexOf('export type AdminShippingDetails'))
  assert.doesNotMatch(customer,/apiKey|apiType|carrierId|errorCode|status_code/)
  assert.match(server,/select\('event_id,source,event_time,country_code,description,created_at'\)/)
})

test('admin shipping stays inside the existing row-scoped dialog and blocks conflicting order drafts',async()=>{
  const [card,workspace]=await Promise.all([read('components/admin/sections/orders/OrderManagementCard.tsx'),read('components/admin/sections/orders/OrderShippingWorkspace.tsx')])
  assert.match(card,/OrderShippingWorkspace order=\{savedOrder\} blocked=\{isDirty\|\|saving\}/)
  assert.match(workspace,/expectedRevision:data.revision/);assert.match(workspace,/manual:/)
  assert.match(workspace,/fieldset disabled=\{busy\|\|blocked\}/)
  assert.match(workspace,/current!==intent.current/);assert.match(workspace,/refreshRequired/)
  assert.match(workspace,/shippingDraftDirty/);assert.match(workspace,/min-h-11/)
})
