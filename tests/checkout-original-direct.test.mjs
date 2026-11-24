import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { hookHarness, loadUi, uiNodes, uiText } from './helpers/preview-uiux-harness.mjs'

const story = 'Christmasboy_story'
const offers = ['digital', 'basic', 'supreme'].map((format, index) => ({
  format, priceCents: 1234 + index * 100, priceVersion: 2,
  sourceVersion: 'sample-v1', coverPath: 'sample/v1/cover.webp',
}))

function fixture(availableOffers = offers) {
  const orders = [], redirects = [], requests = [], storage = new Map()
  let conflict = false, offline = false, enabled = true
  const orderId = randomUUID()
  const post = loadUi('app/api/orders/original/route.ts', {
    'next/server': { NextResponse: Response, after() {} },
    '@/lib/original-book-offers': { originalCheckoutEnabled: () => enabled },
    '@/lib/checkout-owner': { resolveCheckoutOwner: async () => ({ ownerType: 'anon', anonSessionId: 'server-guest' }), checkoutOwnerErrorResponse: () => null },
    '@/lib/unpaid-reminder-server': { registerUnpaidReminder: async () => null },
    '@/lib/supabaseAdmin': { supabaseAdmin: { async rpc(name, params) {
      assert.equal(name, 'start_original_book_order')
      orders.push(params)
      return conflict ? { error: { code: 'PT409' } } : { data: orderId }
    } } },
  }).POST
  const chooser = hookHarness('app/checkout/original/[story]/OriginalFormatSelection.tsx', 'OriginalFormatSelection', {
    stubs: { 'next/link': { __esModule: true, default: 'a' },
      '@/contexts/GlobalContext': { useGlobalContext: () => ({ displayCurrency: 'USD' }) },
      '@/lib/book-catalog': { templateStorageUrl: key => key ? '/catalog/' + key : '' } },
    globals: { crypto: { randomUUID }, sessionStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
      window: { location: { replace: url => redirects.push(url) } },
      fetch: async (url, init) => {
        requests.push(JSON.parse(init.body))
        const res = await post(new Request('https://example.test' + url, init))
        if (offline) throw Error('Connection lost')
        return res
      } },
  })
  const draw = () => chooser.render({ story, title: 'Sample story', catalogCover: '/catalog/story-cover.png', offers: availableOffers })
  return { draw, post, orders, redirects, requests, storage, orderId,
    conflict: () => { conflict = true }, enabled: value => { enabled = value }, offline: value => { offline = value } }
}
const button = tree => uiNodes(tree).find(n => n.type === 'button')
const radios = tree => uiNodes(tree).filter(n => n.type === 'input' && n.props.type === 'radio')

test('each original format opens the same protected single-order checkout through the real selection component and POST handler', async () => {
  for (const [index, offer] of offers.entries()) {
    const h = fixture()
    const tree = h.draw()
    assert.equal(button(tree).props.disabled, true)
    assert.equal(radios(tree).length, 3)
    assert.match(uiText(tree), /after payment/)
    assert.equal(uiNodes(tree).find(n => n.type === 'img').props.src, '/catalog/' + offer.coverPath)
    radios(tree)[index].props.onChange()
    await button(h.draw()).props.onClick()
    assert.equal(h.orders.length, 1)
    const rpc = h.orders[0]
    assert.equal(rpc.p_owner, 'server-guest')
    assert.equal(rpc.p_format, offer.format)
    assert.equal(rpc.p_story, story)
    assert.equal(rpc.p_price_cents, offer.priceCents)
    assert.equal(rpc.p_source_version, offer.sourceVersion)
    assert.deepEqual(h.redirects, ['/checkout?orderId=' + h.orderId])
  }
})

test('each manual original enters direct checkout with the catalog cover and no bound source', async () => {
  const manual = offers.map(offer => ({ ...offer, coverPath: null, sourceVersion: null }))
  for (const [index, offer] of manual.entries()) {
    const h = fixture(manual)
    const tree = h.draw()
    assert.equal(uiNodes(tree).find(n => n.type === 'img').props.src, '/catalog/story-cover.png')
    radios(tree)[index].props.onChange()
    await button(h.draw()).props.onClick()
    assert.equal(h.orders[0].p_source_version, '')
    assert.equal(h.orders[0].p_format, offer.format)
    assert.deepEqual(h.redirects, ['/checkout?orderId=' + h.orderId])
  }
})

test('a lost response preserves the purchase attempt, a stale offer requires a fresh selection, and disabling the feature rejects new orders', async () => {
  const h = fixture()
  radios(h.draw())[0].props.onChange()
  h.offline(true)
  await button(h.draw()).props.onClick()
  assert.equal(h.redirects.length, 0)
  h.offline(false)
  h.conflict()
  await button(h.draw()).props.onClick()
  assert.equal(h.requests[1].attemptId, h.requests[0].attemptId)
  assert.equal(h.storage.size, 0)
  assert.equal(uiNodes(h.draw()).find(n => n.type === 'fieldset').props.disabled, true)
  assert.match(uiText(h.draw()), /Reload formats/)
  h.enabled(false)
  assert.equal((await h.post(new Request('https://example.test', { method: 'POST', body: '{}' }))).status, 404)
  assert.equal(h.orders.length, 2)
})

test('the basket excludes the unpaid original and an authorized order restore uses its frozen cover without generating a Preview', async () => {
  const original = { cart_item_id: 'original', order_id: 'order', package_type: 'basic', quantity: 1,
    status: 'ordered', price_at_purchase: 12, creations: { customize_snapshot: { edition: 'original' } } }
  const regular = { cart_item_id: 'regular', status: 'cart', package_type: 'basic', creations: { templates: { package_prices: [
    { package_type:'basic', list_price_usd:39, row_version:1 }, { package_type:'supreme', list_price_usd:89, row_version:1 },
  ] } } }
  const owner = { ownerType:'customer', customerId:'member' }
  const scoped = []
  const { GET } = loadUi('app/api/cart/route.ts', {
    'next/server': { NextResponse: Response }, '@/lib/package-pricing-store': {},
    '@/lib/checkout-owner': { resolveCheckoutOwner: async () => owner, ownerFilter: () => ({ owner_type:'customer', value:'member' }),
      getRequestAnonSessionId: () => null, requireCheckoutOrderReadAccess: async (id) => { scoped.push(id); return { readOwner: owner } } },
    '@/lib/book-catalog': { templateStorageUrl: key => '/catalog/' + key },
    '@/lib/storage-signing': { createSignedStorageUrlMap: async list => { assert.equal(list.length,0); return new Map() } },
    '@/lib/supabaseAdmin': { supabaseAdmin: { async rpc(name,args) {
      if (name === 'read_original_book_purchase') {
        assert.deepEqual(scoped,['order'])
        assert.equal(args.p_line,'original')
        return { data: { format:'basic', coverPath:'story/v1/cover.webp' } }
      }
      assert.equal(name,'get_cart_page')
      return { data: { items: args.p_order_id ? [original] : [regular,original],
        linkedOrders:[{order_id:'order',order_status:'unpaid',payment_id:null}] } }
    } } },
  }, { URL })
  const active = await (await GET(new Request('https://example.test/api/cart'))).json()
  assert.deepEqual(active.items.map(i=>i.cart_item_id), ['regular'])
  const restored = await (await GET(new Request('https://example.test/api/cart?orderId=order'))).json()
  assert.equal(restored.originalPdf,false)
  assert.equal(restored.originalEdition,true)
  assert.equal(restored.items[0].preview_cover_url,'/catalog/story/v1/cover.webp')
})

test('paid original Voice opens its own recording panel on both fast confirmation and restored Checkout success',()=>{
  const fixture=hookHarness('app/checkout/success/CheckoutSuccessCard.tsx','CheckoutSuccessCard',{
    stubs:{
      'next/dynamic':{default:()=>props=>({type:'voice-panel',props})},
      '@/lib/useI18n':{useI18n:()=>({t:key=>key})},
      '@/components/orders/OrderMaterialsSummary':{OrderMaterialsSummary:()=>null},
      '@/components/SignatureVoiceEditionNotice':{SignatureVoiceEditionNotice:()=>null},
      '@/components/Button':{Button:()=>null},
      'lucide-react':{CheckCircle2:()=>null,Loader2:()=>null,MailCheck:()=>null},
    },
  })
  for(const evidence of [{originalVoiceLineId:'line'},{materials:{items:[{cart_item_id:'line',edition:'original',package_type:'supreme'}]}}]){
    const render=status=>fixture.render({loading:false,orderId:'order',order:{order_id:'order',order_status:status,...evidence}})
    assert.equal(uiNodes(render('paid')).find(n=>n.type==='voice-panel')?.props.voiceLineId,'line')
    assert.equal(uiNodes(render('unpaid')).some(n=>n.type==='voice-panel'),false)
  }
})
