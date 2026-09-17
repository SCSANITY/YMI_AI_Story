import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { fileURLToPath } from 'node:url'
const read=(path)=>readFile(new URL('../'+path,import.meta.url),'utf8')

test('actual private check handler rejects unauthorized/enabled requests and returns only safe no-store summaries',async()=>{
  // Bundle only the actual handler/adapter in memory. server-only is a Next build
  // guard; its isolated-test stub does not replace auth or runtime assertions.
  const require = createRequire(import.meta.url)
  const { build } = require('esbuild') // provided by the existing tsx toolchain
  const result = await build({
    entryPoints: [fileURLToPath(new URL('../app/api/internal/shipping-sync/check/route.ts', import.meta.url))],
    bundle: true, write: false, platform: 'node', format: 'cjs',
    alias: { '@/lib': fileURLToPath(new URL('../src/lib', import.meta.url)) },
    external: ['server-only', 'next/server', 'node:crypto'],
  })
  const secret = 'fixture-internal-secret'
  const apiKey = 'x'.repeat(32)
  const env = { INTERNAL_API_SECRET: secret, CRON_SECRET: 'fixture-cron-secret',
    DEALER_SEND_SYNC_ENABLED: 'false', DEALER_SEND_API_BASE_URL: 'https://fixture.dealer-send.com',
    DEALER_SEND_API_KEY: apiKey, DEALER_SEND_DELIVERED_CODES_JSON: '[]' }
  let calls = 0
  let fail = false
  const runtimeModule = { exports: {} }
  runInNewContext(result.outputFiles[0].text, {
    module: runtimeModule, exports: runtimeModule.exports, process: { env }, URL, AbortSignal, TextDecoder, Buffer,
    require: name => {
      if (name === 'server-only') return {}
      assert.ok(['next/server', 'node:crypto'].includes(name), 'No business/DB module may load')
      return require(name)
    },
    fetch: async () => {
      calls++
      if (fail) throw new Error(`https://fixture.dealer-send.com/?ApiKey=${apiKey}`)
      return Response.json({ Response: { Code: 200, Message: apiKey }, Countrys: [
        { ID: 1, CountryFullName: 'United Kingdom', CountryCode: 'GB', ExtraSecret: apiKey },
      ] })
    },
  })
  const post = headers => runtimeModule.exports.POST(new Request('https://fixture.test/api/internal/shipping-sync/check', { method: 'POST', headers }))
  for (const headers of [{}, { 'x-internal-secret': 'wrong' }, { authorization: 'Bearer wrong' }]) {
    const response = await post(headers)
    assert.equal(response.status, 403)
    assert.match(response.headers.get('cache-control'), /private, no-store/)
    assert.deepEqual(await response.json(), { error: 'Forbidden' })
  }
  assert.equal(calls, 0)
  for (const flag of ['true', undefined]) {
    env.DEALER_SEND_SYNC_ENABLED = flag
    const response = await post({ 'x-internal-secret': secret })
    assert.equal(response.status, 409)
    assert.equal((await response.json()).errorCode, 'sync_not_disabled')
  }
  assert.equal(calls, 0)
  env.DEALER_SEND_SYNC_ENABLED = 'false'
  env.DEALER_SEND_API_KEY = undefined
  const missing = await post({ 'x-internal-secret': secret })
  assert.equal(missing.status, 503)
  assert.equal((await missing.json()).errorCode, 'not_configured')
  assert.equal(calls, 0)
  env.DEALER_SEND_API_KEY = apiKey
  for (const headers of [{ 'x-internal-secret': secret }, { authorization: 'Bearer fixture-cron-secret' }]) {
    const response = await post(headers)
    assert.equal(response.status, 200)
    assert.match(response.headers.get('cache-control'), /private, no-store/)
    assert.deepEqual(await response.json(), { verified: true, syncEnabled: false, syncExplicitlyDisabled: true, countryCount: 1, ukListed: true })
  }
  fail = true
  const failure = await post({ 'x-internal-secret': secret })
  assert.equal(failure.status, 503)
  assert.deepEqual(await failure.json(), { verified: false, syncEnabled: false, syncExplicitlyDisabled: true, errorCode: 'provider_unavailable' })
  assert.equal(env.DEALER_SEND_SYNC_ENABLED, 'false')
  assert.equal(calls, 3)
})

test('private authentication POST is authorized and explicitly disabled before credential/provider work, with no business IO',async()=>{
  const source = await read('app/api/internal/shipping-sync/check/route.ts')
  assert.match(source, /export async function POST\(request: Request\)/)
  assert.doesNotMatch(source, /export async function GET|request\.(json|text)|console\.|supabase|order-shipping-server|runShippingSyncBatch/)
  const handler = source.slice(source.indexOf('export async function POST'))
  assert.ok(handler.indexOf('isInternalRequestAuthorized(request)') < handler.indexOf('process.env.'))
  assert.ok(handler.indexOf("DEALER_SEND_SYNC_ENABLED !== 'false'") < handler.indexOf('readDealerSendCredentials(process.env)'))
  assert.ok(handler.indexOf('readDealerSendCredentials(process.env)') < handler.indexOf('await fetchDealerSendCountries(credentials)'))
  assert.match(source, /syncExplicitlyDisabled: true/)
  assert.match(source, /maxDuration = 20/)
  assert.match(source, /noStoreJson/)
  assert.doesNotMatch(source, /error\.message|\.apiKey|Response\.Message/)
})

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

test('the actual order page preserves saved shipping details through its response mapper',async()=>{
  const [page,model]=await Promise.all([read('app/orders/[orderID]/page.tsx'),read('app/orders/[orderID]/orderDetailModel.ts')])
  assert.match(page,/order: createOrderDetailReadModel\(order\)/)
  assert.match(model,/shipping_details: order.shipping_details \?\? null/)
  assert.match(page,/shippingDetails=\{order.shipping_details\}/)
  assert.match(page,/loadResult\?\.requestKey === requestKey/)
})

test('geography is lazy, local, static and not coupled to customer addresses or carrier requests',async()=>{
  const [panel,map,region]=await Promise.all([read('app/orders/[orderID]/ShippingDetailsPanel.tsx'),read('app/orders/[orderID]/ShippingLocationMap.tsx'),read('src/lib/shipping-map.ts')])
  assert.match(panel,/lazy\(\(\) => import\('\.\/ShippingLocationMap'\)/)
  assert.match(panel,/expanded && details\?\.events/)
  assert.doesNotMatch(panel,/shipping-world-map|SHIPPING_WORLD_LAND_PATH/)
  assert.doesNotMatch(map+region,/fetch\(|setInterval|geolocation|shipping_address|mapbox|google\.maps/)
  assert.match(region,/event\.source === 'dealer_send'/)
  assert.match(map,/not live GPS or a delivery estimate/)
})
