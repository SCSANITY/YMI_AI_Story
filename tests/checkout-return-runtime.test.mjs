import assert from 'node:assert/strict'
import test from 'node:test'
import { customerRuntime, deferred } from './helpers/customer-event-harness.mjs'
import { loadUi, uiNodes, uiText } from './helpers/preview-uiux-harness.mjs'

const fields = ['firstName','lastName','email','country','shippingRegionKey','shippingDestinationLabel','region','city','addressLine1','addressLine2','addressLine3','zip','phone','company','recipientEmail','vatNumber','eoriNumber','iossNumber']
const empty = Object.fromEntries(fields.map(key => [key, '']))
const address = { ...empty, firstName: 'Test', lastName: 'Reader', email: 'reader@example.test', country: 'HK', region: 'Hong Kong', city: 'Hong Kong', addressLine1: '1 Example Street', zip: '000000', phone: '+85212345678' }
const snapshot = { zoneCode: 'HK', methodCode: 'speedy', methodName: 'Speedy', originalShippingAmountUsd: 20, shippingDiscountPercent: 60 }
const summary = {
  productDiscountInstrumentId: 'product', shippingDiscountInstrumentId: 'shipping',
  productDiscountAmountUsd: 5, shippingDiscountAmountUsd: 3,
  productDiscount: { instrumentId: 'product', instrumentType: 'promo_code', code: 'BOOK5', label: 'BOOK5' },
  shippingDiscount: { instrumentId: 'shipping', instrumentType: 'promo_code', code: 'SHIP3', label: 'SHIP3' },
}
const order = () => ({ order_id: 'order-1', order_status: 'unpaid', shipping_address: address, email: address.email,
  shipping_amount_usd: 8, shipping_method: 'speedy', shipping_rate_snapshot: snapshot,
  applied_product_discount_instrument_id: 'product', applied_shipping_discount_instrument_id: 'shipping', checkout_discounts: summary })
const item = { id: 'line-1', bookID: 'Birthdayboy_story', priceAtPurchase: 39, quantity: 1, book: { price: 999 }, personalization: {} }
const component = type => props => ({ type, props })

function checkoutFixture({ delayed = false, status = 200, itemsStatus = 200, rejectItems = false, deferItems = false, signedIn = true, search = '?orderId=order-1&step=payment' } = {}) {
  const runtime = customerRuntime(), calls = [], pending = deferred()
  let currentOrder = order(), responseStatus = status
  runtime.react.Suspense = ({ children }) => children
  runtime.window.location = { ...runtime.window.location, href: 'https://fixture.test/checkout' + search, pathname: '/checkout', search, hash: '' }
  runtime.window.history = { state: {}, replaceState(_state, _unused, url) {
    const next = new URL(url, 'https://fixture.test'); Object.assign(runtime.window.location, { href: next.href, search: next.search, hash: next.hash })
  } }
  runtime.localStorage.setItem('ymi_checkout_form', JSON.stringify({ ...empty, country: 'US', addressLine1: 'Wrong browser draft' }))
  runtime.localStorage.setItem('ymi_discount_code', 'LAST_CACHED_CODE')
  const context = {
    user: signedIn ? { customerId: 'customer-1', email: address.email } : null,
    cart: [], checkoutItems: [item], checkoutLoadError: null, checkoutEmail: '', isAuthResolved: true, displayCurrency: 'USD',
    setCheckoutEmail(value) { context.checkoutEmail = value },
    hydrateCheckoutItems(rows) { context.checkoutItems = rows; context.checkoutLoadError = null },
    reconcileCartItemPrices() {}, prepareCheckout() {}, addToCheckout() {}, removeFromCheckout() {},
    openLoginModal() {}, updateCheckoutQuantity() {}, setDisplayCurrency() {},
  }
  const fetch = async (url, options = {}) => {
    const path = String(url); calls.push({ path, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : null })
    if (path === '/api/orders/start') return Response.json({ orderId: 'order-1', items: [] })
    if (path.startsWith('/api/orders/')) {
      if (delayed) await pending.promise
      return Response.json(responseStatus === 200 ? { order: currentOrder } : { error: 'unavailable' }, { status: responseStatus })
    }
    if (path.startsWith('/api/cart?orderId=')) {
      if (rejectItems) throw Error('Cart transport unavailable')
      if (deferItems) await new Promise(() => {})
      return Response.json({ items: itemsStatus === 200 ? [item] : [] }, { status: itemsStatus })
    }
    if (path === '/api/checkout/vouchers') return Response.json({ active: [] })
    if (path === '/api/checkout/session') return Response.json({ url: 'https://checkout.example.test/session' })
    if (path.startsWith('/api/checkout/apply-')) return Response.json({ ok: true, code: options.body ? JSON.parse(options.body).code : undefined, ...summary })
    throw Error('Unexpected fixture request: ' + path)
  }
  const Page = runtime.load('app/checkout/page.tsx', {
    'next/navigation': { useRouter: () => ({ push() {} }), useSearchParams: () => new URLSearchParams(runtime.window.location.search) },
    'next/dynamic': { __esModule: true, default: () => component('dynamic') },
    '@/contexts/GlobalContext': { useGlobalContext: () => context },
    '@/lib/useI18n': { useI18n: () => ({ t: translate }) },
    './AddressFormSection': { AddressFormSection: component('address-form') },
    './CheckoutItemsSection': { CheckoutItemsSection: component('items') },
    './CheckoutSummaryPanel': { CheckoutSummaryPanel: component('summary') },
    './CurrencyPicker': { CurrencyPicker: component('currency') },
    './DiscountSection': { DiscountSection: component('discount') },
    './PaymentActions': { PaymentActions: component('payment'), MobilePaymentBar: component('mobile-payment') },
    '@/lib/published-legal-content-client': { fetchPublishedLegalContentSnapshot() { throw Error('Unexpected policy fetch') } },
    '@/lib/customize-access-client': { canEnterCustomize: async () => true },
    '@/lib/tracking-policy': { countTrackingItems: () => 1, resolveTrackingFormat: () => 'voice', emitYmiTrackingEvent() {} },
  }, { fetch, process: { env: { NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'fixture-public-key' } } }).default
  runtime.mount(Page, {})
  return { runtime, calls, context, pending, node: type => uiNodes(runtime.tree).find(n => n.type === type),
    set order(value) { currentOrder = value }, set status(value) { responseStatus = value } }
}
function translate(key) { return key }

test('Stripe cancel/full reload waits for complete order,items,quote and both discount slots; GET-only', async () => {
  const h = checkoutFixture({ delayed: true }); await h.runtime.flush()
  assert.ok(uiNodes(h.runtime.tree).some(n => n.props?.['data-checkout-loading-shell']))
  assert.equal(h.node('address-form'), undefined); assert.equal(h.node('discount'), undefined)
  h.pending.resolve(); await h.runtime.flush()
  const discounts = h.node('discount').props
  assert.equal(discounts.appliedProductCode, 'BOOK5'); assert.equal(discounts.appliedShippingCode, 'SHIP3')
  assert.equal(discounts.discountTotalUsd, 5); assert.equal(discounts.shippingDiscountTotalUsd, 3)
  assert.equal(discounts.allowAutoApply, false)
  assert.equal(h.node('summary').props.shippingAmountUsd, 8)
  assert.equal(h.node('summary').props.formattedTotal, '$39.00') // 39 - 5 + 8 - 3
  const back = uiNodes(h.runtime.tree).find(n => n.type === 'button' && uiText(n) === 'checkout.backPrevious')
  back.props.onClick(); await h.runtime.flush()
  assert.equal(h.node('address-form').props.initialForm.addressLine1, address.addressLine1)
  assert.equal(h.node('address-form').props.initialFormIsAuthoritative, true)
  assert.equal(h.node('address-form').props.initialShippingQuote.selectedMethod, 'speedy')
  assert.ok(!h.runtime.window.location.search.includes('step=payment'))
  assert.ok(h.calls.every(call => call.method === 'GET'))
  h.runtime.unmount()
})

test('guest return preserves the same saved state without acquiring a new identity or applying a cached code', async () => {
  const h = checkoutFixture({ signedIn: false }); await h.runtime.flush()
  assert.equal(h.node('discount').props.appliedProductCode, 'BOOK5')
  assert.equal(h.node('discount').props.appliedShippingCode, 'SHIP3')
  assert.equal(h.node('payment').props.identityVerified, false)
  assert.ok(h.calls.every(call => call.method === 'GET')); h.runtime.unmount()
})

test('fresh checkout still starts normally and carries the completed address/method back from payment', async () => {
  const h = checkoutFixture({ search: '' }); await h.runtime.flush()
  const quote = { status: 'available', options: [{ methodCode: 'speedy', methodName: 'Speedy', amountUsd: 8, snapshot }], selectedMethod: 'speedy', message: null }
  h.node('address-form').props.onComplete({ form: address, shippingQuote: quote }); await h.runtime.flush()
  assert.equal(h.node('discount').props.allowAutoApply, true)
  assert.equal(h.node('discount').props.canApply, true)
  uiNodes(h.runtime.tree).find(n => n.type === 'button' && uiText(n) === 'checkout.backPrevious').props.onClick(); await h.runtime.flush()
  assert.equal(h.node('address-form').props.initialFormIsAuthoritative, true)
  assert.equal(h.node('address-form').props.initialShippingQuote.selectedMethod, 'speedy')
  assert.equal(h.calls.filter(call => call.path === '/api/orders/start').length, 1)
  h.runtime.unmount()
})

test('failed restore stays an explicit error; only user Retry reloads and exposes payment', async () => {
  const h = checkoutFixture({ status: 503 }); await h.runtime.flush()
  assert.match(uiText(h.runtime.tree), /Unable to restore checkout/)
  assert.equal(h.node('payment'), undefined); assert.equal(h.node('address-form'), undefined)
  const count = h.calls.length; h.runtime.advance(300000); await h.runtime.flush(); assert.equal(h.calls.length, count)
  h.status = 200
  uiNodes(h.runtime.tree).find(n => n.type === 'button' && uiText(n) === 'common.retry').props.onClick()
  await h.runtime.flush(); assert.ok(h.node('payment')); assert.ok(h.calls.every(call => call.method === 'GET'))
  h.runtime.unmount()
})

test('paid and production returns show the order link without Retry,even if ordered-item transport fails', async () => {
  for (const state of ['paid', 'production']) {
    const h = checkoutFixture({ delayed: true, rejectItems: true })
    h.order = { order_id: 'order-1', order_status: state } // no unpaid-only discounts or quote
    h.pending.resolve(); await h.runtime.flush()
    assert.match(uiText(h.runtime.tree), /This order has been paid\./)
    assert.ok(uiNodes(h.runtime.tree).some(n => n.type === 'a' && n.props.href === '/orders/order-1'))
    assert.ok(!uiNodes(h.runtime.tree).some(n => n.type === 'button' && uiText(n) === 'common.retry'))
    assert.equal(h.node('address-form'), undefined); assert.equal(h.node('payment'), undefined)
    assert.ok(h.calls.every(call => call.method === 'GET'))
    assert.equal(h.calls.filter(call => call.path.startsWith('/api/orders/')).length, 1)
    h.runtime.unmount()
  }
})

test('a known paid return does not wait for an unrelated ordered-cart read to finish', async () => {
  const h = checkoutFixture({ delayed: true, deferItems: true })
  h.order = { order_id: 'order-1', order_status: 'paid' }
  h.pending.resolve(); await h.runtime.flush()
  assert.match(uiText(h.runtime.tree), /This order has been paid\./)
  assert.ok(!uiNodes(h.runtime.tree).some(n => n.props?.['data-checkout-loading-shell']))
  h.runtime.unmount()
})

test('cancelled,expired and other closed returns show cart link without Retry or payment actions', async () => {
  for (const state of ['cancelled', 'expired', 'refunded']) {
    const h = checkoutFixture({ delayed: true, itemsStatus: 503 })
    h.order = { order_id: 'order-1', order_status: state }
    h.pending.resolve(); await h.runtime.flush()
    assert.match(uiText(h.runtime.tree), /This checkout is closed\./)
    assert.ok(uiNodes(h.runtime.tree).some(n => n.type === 'a' && n.props.href === '/cart'))
    assert.ok(!uiNodes(h.runtime.tree).some(n => n.type === 'button' && uiText(n) === 'common.retry'))
    assert.equal(h.node('payment'), undefined); assert.equal(h.node('discount'), undefined)
    assert.ok(h.calls.every(call => call.method === 'GET')); h.runtime.unmount()
  }
})

test('an unpaid cart-read failure or unreadable order status remains a real read error with user Retry', async () => {
  for (const malformedOrder of [false, true]) {
    const h = checkoutFixture({ delayed: true, itemsStatus: malformedOrder ? 200 : 503 })
    if (malformedOrder) h.order = { order_id: 'order-1' }
    h.pending.resolve(); await h.runtime.flush()
    assert.match(uiText(h.runtime.tree), /Unable to restore checkout/)
    assert.ok(uiNodes(h.runtime.tree).some(n => n.type === 'button' && uiText(n) === 'common.retry'))
    assert.ok(!uiNodes(h.runtime.tree).some(n => n.type === 'a'))
    h.runtime.unmount()
  }
})

test('bfcache return clears redirect busy state and performs one GET-only recovery; normal pageshow does nothing', async () => {
  const h = checkoutFixture(); await h.runtime.flush()
  h.node('payment').props.onPlaceOrder(); await h.runtime.flush()
  assert.equal(h.runtime.navigations.length, 1)
  assert.match(h.runtime.window.location.search, /orderId=order-1/)
  const writes = h.calls.filter(call => call.method === 'POST').length
  const reads = h.calls.filter(call => call.path.startsWith('/api/orders/')).length
  h.runtime.window.dispatch('pageshow', { persisted: false }); await h.runtime.flush()
  assert.equal(h.calls.filter(call => call.path.startsWith('/api/orders/')).length, reads)
  h.runtime.window.dispatch('pageshow', { persisted: true }); await h.runtime.flush()
  assert.equal(h.node('payment').props.isPlacingOrder, false)
  assert.equal(h.calls.filter(call => call.path.startsWith('/api/orders/')).length, reads + 1)
  assert.equal(h.calls.filter(call => call.method === 'POST').length, writes)
  h.runtime.unmount()
})

test('zero-priced saved shipping is restored; incomplete quotes return to address without a promo write', async () => {
  const h = checkoutFixture({ delayed: true }); h.order = { ...order(), shipping_amount_usd: 0 }
  h.pending.resolve(); await h.runtime.flush(); assert.equal(h.node('summary').props.shippingAmountUsd, 0); assert.ok(h.node('payment'))
  h.runtime.unmount()
  const missing = checkoutFixture({ delayed: true }); missing.order = { ...order(), shipping_method: null, shipping_rate_snapshot: null }
  missing.pending.resolve(); await missing.runtime.flush(); assert.ok(missing.node('address-form')); assert.equal(missing.node('payment'), undefined)
  assert.ok(missing.calls.every(call => call.method === 'GET')); missing.runtime.unmount()
})

test('an abandoned restore cannot update checkout after unmount', async () => {
  const h = checkoutFixture({ delayed: true }); await h.runtime.flush(); h.runtime.unmount()
  h.pending.resolve(); await h.runtime.flush(); assert.equal(h.runtime.lateWrites, 0)
})

test('changing the order during a delayed restore discards the previous response', async () => {
  const h = checkoutFixture({ delayed: true }); await h.runtime.flush()
  h.order = { ...order(), order_id: 'order-2', shipping_address: { ...address, addressLine1: '2 Other Street' } }
  h.runtime.window.location.search = '?orderId=order-2&step=payment'
  h.runtime.render(); h.pending.resolve(); await h.runtime.flush()
  assert.equal(h.node('discount').props.orderId, 'order-2')
  uiNodes(h.runtime.tree).find(n => n.type === 'button' && uiText(n) === 'checkout.backPrevious').props.onClick()
  await h.runtime.flush(); assert.equal(h.node('address-form').props.initialForm.addressLine1, '2 Other Street')
  h.runtime.unmount()
})

const addressStubs = { 'react-dom': { createPortal: node => node }, '@/components/Button': { Button: 'button' },
  './CheckoutEmailOwnershipHint': { CheckoutEmailOwnershipHint: 'hint' }, './ShippingPrice': { ShippingPrice: 'price' } }
const addressProps = { initialForm: empty, checkoutEmail: '', selectedCurrency: 'USD', isAuthResolved: true, t: translate, onComplete() {} }
test('a transient first passive commit cannot overwrite a saved address draft before hydration renders', () => {
  let cursor = 0; const cells = [], effects = [], writes = [], store = new Map([['ymi_checkout_form', JSON.stringify(address)]])
  const localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => { writes.push(key); store.set(key, value) } }
  const react = { memo: fn => fn, useMemo: fn => fn(), useCallback: fn => fn,
    useState(initial) { const i = cursor++; cells[i] ??= { value: typeof initial === 'function' ? initial() : initial }; return [cells[i].value, next => { cells[i].value = typeof next === 'function' ? next(cells[i].value) : next }] },
    useRef(initial) { const i = cursor++; cells[i] ??= { value: { current: initial } }; return cells[i].value }, useEffect: fn => effects.push(fn) }
  const dom = { addEventListener() {}, removeEventListener() {}, body: { style: {} } }
  const Component = loadUi('app/checkout/AddressFormSection.tsx', { ...addressStubs, react: { ...react, default: react, __esModule: true } },
    { window: { localStorage, ...dom, setTimeout: () => 1, clearTimeout() {} }, document: dom, fetch: async () => Response.json({ addresses: [], destinations: [] }) }).AddressFormSection
  Component(addressProps)
  const cleanups = effects.map(fn => fn()) // parent unmounts before the queued hydration render
  assert.equal(JSON.parse(store.get('ymi_checkout_form')).country, 'HK')
  assert.ok(!writes.includes('ymi_checkout_form'))
  cleanups.forEach(fn => typeof fn === 'function' && fn())
})

test('restored or completed address wins over a blank or different global draft;tax identifiers are not persisted', async () => {
  for (const draft of [empty, { ...address, addressLine1: 'Wrong draft' }]) {
    const runtime = customerRuntime(); runtime.react.memo = fn => fn
    runtime.document.body = { style: {} }; runtime.localStorage.setItem('ymi_checkout_form', JSON.stringify(draft))
    const Component = runtime.load('app/checkout/AddressFormSection.tsx', addressStubs,
      { fetch: async () => Response.json({ addresses: [], destinations: [] }) }).AddressFormSection
    runtime.mount(Component, { ...addressProps, initialForm: { ...address, vatNumber: 'private-id' }, initialFormIsAuthoritative: true })
    await runtime.flush()
    assert.ok(uiNodes(runtime.tree).some(node => node.type === 'input' && node.props.value === '1 Example Street'))
    const saved = JSON.parse(runtime.localStorage.getItem('ymi_checkout_form'))
    assert.equal(saved.country, 'HK'); assert.equal(saved.vatNumber, '')
    runtime.unmount()
  }
})

test('a fresh checkout still hydrates a valid browser draft,and blocked/malformed storage is tolerated', async () => {
  for (const draft of [JSON.stringify(address), '{broken', 'blocked']) {
    const runtime = customerRuntime(); runtime.react.memo = fn => fn; runtime.document.body = { style: {} }
    runtime.localStorage.setItem('ymi_checkout_form', draft)
    if (draft === 'blocked') runtime.localStorage.getItem = () => { throw Error('Storage blocked') }
    const Component = runtime.load('app/checkout/AddressFormSection.tsx', addressStubs,
      { fetch: async () => Response.json({ addresses: [], destinations: [] }) }).AddressFormSection
    runtime.mount(Component, addressProps); await runtime.flush()
    assert.equal(uiNodes(runtime.tree).some(node => node.type === 'input' && node.props.value === '1 Example Street'), draft.startsWith('{"'))
    runtime.unmount()
  }
})

function discountFixture(overrides = {}) {
  const runtime = customerRuntime(); runtime.react.memo = fn => fn
  runtime.localStorage.setItem('ymi_discount_code', 'LAST_CODE')
  const calls = []
  const props = { isOpen: true, onToggleOpen() {}, t: translate, isSignedIn: false, orderId: 'order-1',
    canApply: true, allowAutoApply: false, incomingDiscountCode: '', appliedDiscountCode: null,
    selectedRewardVoucherId: null, selectedRewardVoucherName: null, appliedProductDiscountInstrumentId: null,
    appliedShippingDiscountInstrumentId: null, appliedProductCode: null, appliedShippingCode: null,
    discountTotalUsd: 0, shippingDiscountTotalUsd: 0, formattedDiscount: '$5.00', formattedShippingDiscount: '$3.00',
    discountSummaryLabel: '', isApplyingDiscount: false, discountError: '', setDiscountError() {}, rewardVouchers: [],
    isRewardVouchersLoading: false, onApplyDiscountCode: async code => { calls.push(code); return true },
    onApplyRewardVoucher: async () => true, onClearAppliedDiscount: async () => true, ...overrides }
  const Component = runtime.load('app/checkout/DiscountSection.tsx', { '@/components/Button': { Button: 'button' } }).DiscountSection
  runtime.mount(Component, props); return { runtime, calls, props }
}

test('returning order never autoapplies the single cached code,even when both slots are empty', async () => {
  const h = discountFixture(); await h.runtime.flush(); assert.deepEqual(h.calls, []); h.runtime.unmount()
})
test('new checkout keeps cached-code autoapply,once,and only after shipping is available', async () => {
  const h = discountFixture({ allowAutoApply: true, canApply: false }); await h.runtime.flush(); assert.deepEqual(h.calls, [])
  h.runtime.update({ ...h.props, canApply: true }); await h.runtime.flush(); assert.deepEqual(h.calls, ['LAST_CODE'])
  h.runtime.render(); await h.runtime.flush(); assert.equal(h.calls.length, 1); h.runtime.unmount()
})
test('both restored discount chips show their own code and own amount', async () => {
  const h = discountFixture({ appliedProductCode: 'BOOK5', appliedShippingCode: 'SHIP3', discountTotalUsd: 5, shippingDiscountTotalUsd: 3 })
  await h.runtime.flush()
  const text = uiText(h.runtime.tree); assert.match(text, /BOOK5.*-\$5.00/); assert.match(text, /SHIP3.*-\$3.00/)
  assert.deepEqual(h.calls, []); h.runtime.unmount()
})

test('a shipping voucher beside a product code uses its own amount in the voucher summary', async () => {
  const h = discountFixture({ isSignedIn: true, appliedProductCode: 'BOOK5', appliedShippingCode: 'Shipping reward',
    appliedProductDiscountInstrumentId: 'product', appliedShippingDiscountInstrumentId: 'shipping',
    selectedRewardVoucherId: 'shipping', selectedRewardVoucherName: 'Shipping reward', rewardVouchers: [{ instrumentId: 'shipping', name: 'Shipping reward', label: '' }],
    discountTotalUsd: 5, shippingDiscountTotalUsd: 3 })
  await h.runtime.flush()
  const text = uiText(h.runtime.tree); assert.match(text, /Shipping reward.*-\$3.00/)
  assert.equal(text.match(/-\$5.00/g)?.length, 1); h.runtime.unmount()
})

test('successful manual promo save stays successful when optional browser caching is blocked', async () => {
  const h = checkoutFixture(); await h.runtime.flush()
  h.runtime.localStorage.setItem = () => { throw Error('Storage blocked') }
  assert.equal(await h.node('discount').props.onApplyDiscountCode('BOOK5'), true)
  await h.runtime.flush(); assert.equal(h.node('discount').props.appliedShippingCode, 'SHIP3')
  h.runtime.unmount()
})

test('server rejects an unhydrated shipping tuple before any update;valid zero quotes and DB errors remain distinct', async () => {
  const writes = []; let fail = false
  const helper = loadUi('src/lib/checkout-shipping-context.ts', { 'server-only': {}, '@/lib/supabaseAdmin': { supabaseAdmin: {
    from() { const query = { update(value) { writes.push(value); return query }, eq() { return query }, then(resolve) { return Promise.resolve({ error: fail ? { message: 'fixture' } : null }).then(resolve) } }; return query },
  } } })
  await assert.rejects(helper.updateUnpaidOrderShippingContext('order-1', { shippingAmountUsd: 0, shippingMethod: null, shippingRateSnapshot: null, shippingZoneCode: '' }), /complete your shipping/)
  assert.equal(writes.length, 0)
  await helper.updateUnpaidOrderShippingContext('order-1', {}) // existing context unchanged
  assert.equal(writes.length, 0)
  const valid = { shippingAmountUsd: 0, shippingMethod: 'speedy', shippingRateSnapshot: snapshot, shippingZoneCode: 'HK' }
  await helper.updateUnpaidOrderShippingContext('order-1', valid); assert.equal(writes[0].shipping_amount_usd, 0)
  fail = true; await assert.rejects(helper.updateUnpaidOrderShippingContext('order-1', valid), /Failed to save/)
})
