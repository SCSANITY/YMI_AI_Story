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
const isReadOnlyRequest = call => call.method === 'GET' ||
  (call.method === 'POST' && ['/api/checkout/quote', '/api/checkout/shipping-quote'].includes(call.path))

function checkoutFixture({ delayed = false, status = 200, itemsStatus = 200, rejectItems = false, deferItems = false, signedIn = true, authResolved = true, withItem = true, search = '?orderId=order-1&step=payment&source=cart#resume', draft, mergeFailed = false, healOnRetry = true, onPayment, onQuote, onQuantity, onShipping, onAddressSave } = {}) {
  const runtime = customerRuntime(), calls = [], pending = deferred(), retryCalls = [], quantityCalls = []
  let currentOrder = order(), responseStatus = status
  runtime.react.Suspense = ({ children }) => children
  runtime.window.location = { ...runtime.window.location, href: 'https://fixture.test/checkout' + search, pathname: '/checkout', search: new URL('https://fixture.test/checkout' + search).search, hash: new URL('https://fixture.test/checkout' + search).hash }
  runtime.window.history = { state: {}, replaceState(_state, _unused, url) {
    const next = new URL(url, 'https://fixture.test'); Object.assign(runtime.window.location, { href: next.href, search: next.search, hash: next.hash })
  } }
  if (draft !== null) {
    runtime.localStorage.setItem('ymi_checkout_form', typeof draft === 'string' ? draft : JSON.stringify(draft ?? { ...empty, country: 'US', addressLine1: 'Wrong browser draft' }))
  }
  runtime.localStorage.setItem('ymi_discount_code', 'LAST_CACHED_CODE')
  const context = {
    user: signedIn ? { customerId: 'customer-1', email: address.email } : null,
    cart: [], checkoutItems: withItem ? [item] : [], checkoutLoadError: null, checkoutEmail: '', isAuthResolved: authResolved, displayCurrency: 'USD',
    setCheckoutEmail(value) { context.checkoutEmail = value },
    hydrateCheckoutItems(rows) { context.checkoutItems = rows; context.checkoutLoadError = null },
    reconcileCartItemPrices() {}, prepareCheckout() {}, addToCheckout() {}, removeFromCheckout() {},
    openLoginModal() {}, updateCheckoutQuantity(...args) { quantityCalls.push(args); return onQuantity?.(...args) ?? Promise.resolve(true) }, setDisplayCurrency(currency) { context.displayCurrency = currency },
    customerMergeFailed: mergeFailed,
    retryCustomerMerge: async () => { retryCalls.push('retry'); if (healOnRetry) context.customerMergeFailed = false; return context.customerMergeFailed !== true },
  }
  const fetch = async (url, options = {}) => {
    const path = String(url); calls.push({ path, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : null, keepalive: options.keepalive })
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
    if (path.startsWith('/api/cart?ids=')) return Response.json({ items: [item] })
    if (path === '/api/checkout/vouchers') return Response.json({ active: [] })
    if (path === '/api/user/addresses') return onAddressSave?.() ?? Response.json({ saved: true })
    if (path === '/api/checkout/shipping-quote') {
      return onShipping?.(JSON.parse(options.body).shippingAddress) ?? shippingResponse(currentOrder.shipping_amount_usd)
    }
    if (path === '/api/checkout/quote') {
      const body = JSON.parse(options.body)
      return onQuote?.(body) ?? Response.json({ quote: { currency: body.currency, totalMinor: 3900, subtotalUsd: 39,
        productDiscountUsd: 5, shippingDiscountUsd: Math.min(3, currentOrder.shipping_amount_usd), multiBookDiscountUsd: 0, shippingAmountUsd: currentOrder.shipping_amount_usd } })
    }
    if (path === '/api/checkout/session') return onPayment?.(JSON.parse(options.body)) ?? Response.json({ url: 'https://checkout.example.test/session' })
    if (path.startsWith('/api/checkout/apply-')) return Response.json({ ok: true, code: options.body ? JSON.parse(options.body).code : undefined, ...summary })
    throw Error('Unexpected fixture request: ' + path)
  }
  const shipping = runtime.load('app/checkout/useCheckoutShippingQuote.ts', {}, { fetch })
  const Page = runtime.load('app/checkout/page.tsx', {
    'next/navigation': { useRouter: () => ({ push() {} }), useSearchParams: () => new URLSearchParams(runtime.window.location.search) },
    'next/dynamic': { __esModule: true, default: () => component('dynamic') },
    '@/contexts/GlobalContext': { useGlobalContext: () => context },
    '@/lib/useI18n': { useI18n: () => ({ t: translate }) },
    './useCheckoutShippingQuote': shipping,
    './AddressFormSection': { AddressFormSection: component('address-form') },
    './CheckoutContactSection': { CheckoutContactSection: component('contact-form') },
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
  return { runtime, calls, context, pending, retryCalls, quantityCalls, node: type => uiNodes(runtime.tree).find(n => n.type === type),
    set order(value) { currentOrder = value }, set status(value) { responseStatus = value } }
}
function translate(key) { return key }
function shippingResponse(amountUsd = 8) {
  return Response.json({ available: true, selectedMethod: 'speedy', options: [{ methodCode: 'speedy', methodName: 'Speedy', amountUsd, snapshot }] })
}
async function settleCheckout(h) {
  await h.runtime.flush()
  h.runtime.advance(500); await h.runtime.flush()
  h.runtime.advance(250); await h.runtime.flush()
}

test('Stripe cancel/full reload waits for complete order,items,quote and both discount slots without writes', async () => {
  const h = checkoutFixture({ delayed: true }); await h.runtime.flush()
  assert.ok(uiNodes(h.runtime.tree).some(n => n.props?.['data-checkout-loading-shell']))
  assert.equal(h.node('address-form'), undefined); assert.equal(h.node('discount'), undefined)
  h.pending.resolve(); await settleCheckout(h)
  const discounts = h.node('discount').props
  assert.equal(discounts.appliedProductCode, 'BOOK5'); assert.equal(discounts.appliedShippingCode, 'SHIP3')
  assert.equal(discounts.discountTotalUsd, 5); assert.equal(discounts.shippingDiscountTotalUsd, 3)
  assert.equal(discounts.allowAutoApply, false)
  assert.equal(h.node('summary').props.shippingAmountUsd, 8)
  assert.equal(h.node('summary').props.formattedTotal, '$39.00') // 39 - 5 + 8 - 3
  const back = uiNodes(h.runtime.tree).find(n => n.type === 'button' && uiText(n) === 'checkout.backToAddress')
  back.props.onClick(); await h.runtime.flush()
  assert.equal(h.node('address-form').props.form.addressLine1, address.addressLine1)
  assert.equal(h.node('address-form').props.shippingQuote.selectedMethod, 'speedy')
  assert.equal(h.runtime.window.location.search, '?orderId=order-1&source=cart')
  assert.equal(h.runtime.window.location.hash, '#resume')
  assert.ok(h.calls.every(isReadOnlyRequest))
  h.runtime.unmount()
})

test('guest return preserves the same saved state without applying a cached code', async () => {
  const h = checkoutFixture({ signedIn: false }); await h.runtime.flush()
  assert.equal(h.node('discount').props.appliedProductCode, 'BOOK5')
  assert.equal(h.node('discount').props.appliedShippingCode, 'SHIP3')
  assert.equal(h.node('payment').props.contactEmail, 'reader@example.test')
  assert.equal(h.node('payment').props.isSignedIn, false)
  assert.ok(h.calls.every(isReadOnlyRequest)); h.runtime.unmount()
})

test('fresh checkout shows contact, delivery and summary together and quotes only after the details are valid', async () => {
  const h = checkoutFixture({ search: '', draft: null }); await h.runtime.flush()
  assert.ok(h.node('contact-form')); assert.ok(h.node('address-form')); assert.ok(h.node('summary'))
  assert.equal(h.node('payment').props.canPay, false)
  h.node('contact-form').props.onFormChange({ email: address.email })
  await settleCheckout(h)
  assert.equal(h.calls.filter(call => call.path === '/api/checkout/quote').length, 0)
  const { email, ...delivery } = address
  h.node('address-form').props.onFormChange(delivery)
  await settleCheckout(h)
  assert.equal(h.node('contact-form').props.form.email, email)
  assert.equal(h.node('address-form').props.form.addressLine1, address.addressLine1)
  assert.equal(h.node('address-form').props.shippingQuote.selectedMethod, 'speedy')
  assert.equal(h.node('discount').props.allowAutoApply, true)
  assert.equal(h.node('discount').props.canApply, true)
  assert.equal(h.calls.filter(call => call.path === '/api/orders/start').length, 1)
  assert.equal(h.calls.filter(call => call.path === '/api/checkout/session').length, 0)
  h.runtime.unmount()
})

test('failed restore stays an explicit error; only user Retry reloads and exposes payment', async () => {
  const h = checkoutFixture({ status: 503 }); await h.runtime.flush()
  assert.match(uiText(h.runtime.tree), /Unable to restore checkout/)
  assert.equal(h.node('payment'), undefined); assert.equal(h.node('address-form'), undefined)
  const count = h.calls.length; h.runtime.advance(300000); await h.runtime.flush(); assert.equal(h.calls.length, count)
  h.status = 200
  uiNodes(h.runtime.tree).find(n => n.type === 'button' && uiText(n) === 'common.retry').props.onClick()
  await h.runtime.flush(); assert.ok(h.node('payment')); assert.ok(h.calls.every(isReadOnlyRequest))
  h.runtime.unmount()
})

test('paid,production,shipped and delivered returns show the order link without Retry,even if ordered-item transport fails', async () => {
  for (const state of ['paid', 'production', 'shipped', 'delivered']) {
    const h = checkoutFixture({ delayed: true, rejectItems: true })
    h.order = { order_id: 'order-1', order_status: state } // no unpaid-only discounts or quote
    h.pending.resolve(); await h.runtime.flush()
    assert.match(uiText(h.runtime.tree), /This order has been paid\./)
    assert.ok(uiNodes(h.runtime.tree).some(n => n.type === 'a' && n.props.href === '/orders/order-1'))
    assert.ok(!uiNodes(h.runtime.tree).some(n => n.type === 'button' && uiText(n) === 'common.retry'))
    assert.equal(h.node('address-form'), undefined); assert.equal(h.node('payment'), undefined)
    assert.ok(h.calls.every(isReadOnlyRequest))
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
    assert.ok(h.calls.every(isReadOnlyRequest)); h.runtime.unmount()
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

test('bfcache return clears redirect busy state and performs one read-only recovery; normal pageshow does nothing', async () => {
  const h = checkoutFixture(); await settleCheckout(h)
  h.node('payment').props.onPlaceOrder(); await h.runtime.flush()
  assert.equal(h.runtime.navigations.length, 1)
  assert.match(h.runtime.window.location.search, /orderId=order-1/)
  const writes = h.calls.filter(call => !isReadOnlyRequest(call)).length
  const reads = h.calls.filter(call => call.path.startsWith('/api/orders/')).length
  h.runtime.window.dispatch('pageshow', { persisted: false }); await h.runtime.flush()
  assert.equal(h.calls.filter(call => call.path.startsWith('/api/orders/')).length, reads)
  h.runtime.window.dispatch('pageshow', { persisted: true }); await h.runtime.flush()
  assert.equal(h.node('payment').props.isPlacingOrder, false)
  assert.equal(h.calls.filter(call => call.path.startsWith('/api/orders/')).length, reads + 1)
  assert.equal(h.calls.filter(call => !isReadOnlyRequest(call)).length, writes)
  h.runtime.unmount()
})

test('zero-priced saved shipping is restored; incomplete quotes return to address without a promo write', async () => {
  const h = checkoutFixture({ delayed: true }); h.order = { ...order(), shipping_amount_usd: 0 }
  h.pending.resolve(); await h.runtime.flush(); assert.equal(h.node('summary').props.shippingAmountUsd, 0); assert.ok(h.node('payment'))
  h.runtime.unmount()
  const missing = checkoutFixture({ delayed: true }); missing.order = { ...order(), shipping_method: null, shipping_rate_snapshot: null }
  missing.pending.resolve(); await missing.runtime.flush(); assert.ok(missing.node('address-form')); assert.equal(missing.node('payment').props.canPay, false)
  assert.ok(missing.calls.every(isReadOnlyRequest)); missing.runtime.unmount()
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
  uiNodes(h.runtime.tree).find(n => n.type === 'button' && uiText(n) === 'checkout.backToAddress').props.onClick()
  await h.runtime.flush(); assert.equal(h.node('address-form').props.form.addressLine1, '2 Other Street')
  h.runtime.unmount()
})

test('the page is the single draft owner: a fresh checkout hydrates a valid browser draft, and blocked or malformed storage is tolerated', async () => {
  for (const draft of [JSON.stringify(address), '{broken', 'blocked']) {
    const h = checkoutFixture({ search: '', draft })
    if (draft === 'blocked') h.runtime.localStorage.getItem = () => { throw Error('Storage blocked') }
    await h.runtime.flush()
    assert.equal(h.node('contact-form').props.form.addressLine1, draft.startsWith('{"') ? '1 Example Street' : '')
    h.runtime.unmount()
  }
})

test('the first passive commit cannot overwrite a saved address draft before hydration renders', async () => {
  const h = checkoutFixture({ search: '', draft: JSON.stringify(address) })
  await h.runtime.flush()
  const saved = JSON.parse(h.runtime.localStorage.getItem('ymi_checkout_form'))
  assert.equal(saved.country, 'HK')
  assert.equal(saved.addressLine1, '1 Example Street')
  h.runtime.unmount()
})

test('a restored order wins over a stale browser draft, and tax identifiers are not persisted', async () => {
  const h = checkoutFixture({ delayed: true })
  h.order = { ...order(), shipping_address: { ...address, vatNumber: 'private-id' } }
  h.pending.resolve(); await h.runtime.flush()
  assert.equal(h.node('payment').props.contactEmail, 'reader@example.test')
  const saved = JSON.parse(h.runtime.localStorage.getItem('ymi_checkout_form'))
  assert.equal(saved.country, 'HK')
  assert.equal(saved.addressLine1, '1 Example Street')
  assert.equal(saved.vatNumber, '')
  h.runtime.unmount()
})

test('a pending or failed order restore never overwrites the saved browser draft', async () => {
  const pendingRestore = checkoutFixture({ delayed: true, draft: JSON.stringify(address) })
  await pendingRestore.runtime.flush()
  assert.equal(JSON.parse(pendingRestore.runtime.localStorage.getItem('ymi_checkout_form')).addressLine1, '1 Example Street')
  pendingRestore.runtime.unmount()
  const failedRestore = checkoutFixture({ status: 503, draft: JSON.stringify(address) })
  await failedRestore.runtime.flush()
  assert.match(uiText(failedRestore.runtime.tree), /Unable to restore checkout/)
  assert.equal(JSON.parse(failedRestore.runtime.localStorage.getItem('ymi_checkout_form')).addressLine1, '1 Example Street')
  failedRestore.runtime.unmount()
})

test('restore fills order-empty fields from the browser draft while order data and tax-field exclusion win', async () => {
  const draft = JSON.stringify({ ...empty, firstName: 'Drafty', addressLine1: 'Wrong browser draft', vatNumber: 'DRAFT-VAT' })
  const h = checkoutFixture({ delayed: true, draft })
  h.order = { ...order(), shipping_address: { ...address, firstName: '', vatNumber: '' } }
  h.pending.resolve(); await h.runtime.flush()
  const saved = JSON.parse(h.runtime.localStorage.getItem('ymi_checkout_form'))
  assert.equal(saved.firstName, 'Drafty') // order left it empty; draft refills
  assert.equal(saved.addressLine1, '1 Example Street') // order data wins over the draft
  assert.equal(saved.country, 'HK')
  assert.equal(saved.vatNumber, '') // tax identifiers are never re-injected
  h.runtime.unmount()
})

test('a restore retry re-captures the current browser draft instead of the first attempt', async () => {
  const h = checkoutFixture({ status: 503, draft: JSON.stringify({ ...empty, firstName: 'DraftA' }) })
  await h.runtime.flush()
  assert.match(uiText(h.runtime.tree), /Unable to restore checkout/)
  h.runtime.localStorage.setItem('ymi_checkout_form', JSON.stringify({ ...empty, firstName: 'DraftB' }))
  h.status = 200
  h.order = { ...order(), shipping_address: { ...address, firstName: '' } }
  uiNodes(h.runtime.tree).find(n => n.type === 'button' && uiText(n) === 'common.retry').props.onClick()
  await h.runtime.flush()
  const saved = JSON.parse(h.runtime.localStorage.getItem('ymi_checkout_form'))
  assert.equal(saved.firstName, 'DraftB')
  h.runtime.unmount()
})

test('mergeRestoredFormWithDraft keeps order values, fills only empty fields and blocks tax identifiers', async () => {
  const { mergeRestoredFormWithDraft } = loadUi('src/lib/checkout-restoration.ts', {})
  const orderForm = { ...empty, firstName: ' Order ', addressLine1: '1 Example Street', country: 'HK' }
  const draft = { firstName: 'Drafty', lastName: '  Draft Last  ', vatNumber: 'DRAFT-VAT', eoriNumber: 'DRAFT-EORI', iossNumber: 'DRAFT-IOSS', country: 'US' }
  const merged = mergeRestoredFormWithDraft(orderForm, draft)
  assert.equal(merged.firstName, ' Order ') // non-empty order value kept verbatim
  assert.equal(merged.addressLine1, '1 Example Street')
  assert.equal(merged.country, 'HK')
  assert.equal(merged.lastName, 'Draft Last') // trimmed draft fills an empty field
  assert.equal(merged.vatNumber, '')
  assert.equal(merged.eoriNumber, '')
  assert.equal(merged.iossNumber, '')
  assert.equal(mergeRestoredFormWithDraft(orderForm, null), orderForm)
  assert.equal(mergeRestoredFormWithDraft(orderForm, { lastName: '   ' }).lastName, '') // whitespace-only draft ignored
})

test('an unresolved cached session stays guest until Supabase resolves it', async () => {
  const walkToPayment = async (h, expectedCustomerId) => {
    await h.runtime.flush()
    assert.equal(h.node('contact-form').props.userCustomerId, expectedCustomerId)
    h.node('contact-form').props.onFormChange({ email: address.email }); await h.runtime.flush()
    assert.equal(h.node('address-form').props.userCustomerId, expectedCustomerId)
    h.node('address-form').props.onFormChange(address); await settleCheckout(h)
  }
  const unresolved = checkoutFixture({ search: '', authResolved: false })
  await walkToPayment(unresolved, null)
  assert.equal(unresolved.node('payment').props.isSignedIn, false)
  assert.equal(unresolved.node('payment').props.accountEmail, null)
  assert.equal(unresolved.node('discount').props.isSignedIn, false)
  // Every checkout action sends guest ownership while the session is unresolved.
  assert.equal(await unresolved.node('discount').props.onApplyDiscountCode('BOOK5'), true)
  assert.equal(unresolved.calls.find(call => call.path === '/api/checkout/apply-promo-code').body.customerId, null)
  // The voucher guard refuses account-only discounts without a resolved session.
  assert.equal(await unresolved.node('discount').props.onApplyRewardVoucher('voucher-1'), false)
  assert.ok(!unresolved.calls.some(call => call.path === '/api/checkout/apply-voucher'))
  unresolved.node('payment').props.onPlaceOrder(); await unresolved.runtime.flush()
  const guestSession = unresolved.calls.find(call => call.path === '/api/checkout/session')
  assert.equal(guestSession.body.isGuest, true)
  assert.equal(guestSession.body.customerId, null)
  assert.equal(unresolved.calls.find(call => call.path === '/api/orders/start').body.customerId, null)
  unresolved.runtime.unmount()

  const resolved = checkoutFixture({ search: '', authResolved: true })
  await walkToPayment(resolved, 'customer-1')
  assert.equal(resolved.node('payment').props.isSignedIn, true)
  assert.equal(resolved.node('payment').props.accountEmail, 'reader@example.test')
  assert.equal(await resolved.node('discount').props.onApplyDiscountCode('BOOK5'), true)
  assert.equal(resolved.calls.find(call => call.path === '/api/checkout/apply-promo-code').body.customerId, 'customer-1')
  assert.equal(await resolved.node('discount').props.onApplyRewardVoucher('voucher-1'), true)
  assert.ok(resolved.calls.some(call => call.path === '/api/checkout/apply-voucher'))
  resolved.node('payment').props.onPlaceOrder(); await resolved.runtime.flush()
  const authSession = resolved.calls.find(call => call.path === '/api/checkout/session')
  assert.equal(authSession.body.isGuest, false)
  assert.equal(authSession.body.customerId, 'customer-1')
  assert.equal(resolved.calls.find(call => call.path === '/api/orders/start').body.customerId, 'customer-1')
  resolved.runtime.unmount()

  // Item removal carries the resolved ownership too (cancel ends the order, so it runs on its own fixtures).
  for (const [authResolved, expectedCustomerId] of [[false, null], [true, 'customer-1']]) {
    const h = checkoutFixture({ search: '', authResolved })
    await walkToPayment(h, expectedCustomerId)
    assert.equal(await h.node('items').props.onRemoveItem('line-1'), true)
    assert.equal(h.calls.find(call => call.path === '/api/orders/cancel').body.customerId, expectedCustomerId)
    h.runtime.unmount()
  }
})

test('selected-id cart prefetch carries no stale identity before the session resolves', async () => {
  const unresolved = checkoutFixture({ search: '?ids=line-1', withItem: false, authResolved: false })
  await unresolved.runtime.flush()
  const guestPrefetch = unresolved.calls.find(call => call.path.startsWith('/api/cart?ids='))
  assert.ok(guestPrefetch)
  assert.equal(guestPrefetch.path.includes('customerId'), false)
  unresolved.runtime.unmount()

  const resolved = checkoutFixture({ search: '?ids=line-1', withItem: false, authResolved: true })
  await resolved.runtime.flush()
  const authPrefetch = resolved.calls.find(call => call.path.startsWith('/api/cart?ids='))
  assert.ok(authPrefetch)
  assert.ok(authPrefetch.path.includes('customerId=customer-1'))
  resolved.runtime.unmount()
})

test('editing a rated address blocks payment immediately and ignores an out-of-order shipping response', async () => {
  const first = deferred(), middle = deferred()
  const h = checkoutFixture({ onShipping: input => input.zip === '999077' ? middle.promise :
    input.zip === '000000' ? first.promise : shippingResponse() })
  await settleCheckout(h)
  assert.equal(h.node('payment').props.canPay, true)
  h.node('address-form').props.onFormChange({ zip: '999077' })
  await h.runtime.flush()
  assert.equal(h.node('address-form').props.shippingQuote.status, 'loading')
  assert.equal(h.node('payment').props.canPay, false)
  await settleCheckout(h)
  h.node('address-form').props.onFormChange({ zip: '222222' })
  await settleCheckout(h)
  assert.equal(h.node('payment').props.canPay, true)
  first.resolve(shippingResponse(77)); middle.resolve(shippingResponse(99))
  await h.runtime.flush()
  assert.equal(h.node('address-form').props.shippingQuote.options[0].amountUsd, 8)
  assert.equal(h.calls.filter(call => call.path === '/api/checkout/quote').at(-1).body.shippingAddress.zip, '222222')
  h.runtime.unmount()
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

test('an incomplete customer merge pauses ownership writes behind a banner while retries fail', async () => {
  const h = checkoutFixture({ mergeFailed: true, healOnRetry: false }); await h.runtime.flush()
  const banner = () => uiNodes(h.runtime.tree).find(n => n.props?.role === 'alert' && uiText(n).includes('checkout.accountLinkPaused'))
  assert.ok(banner(), 'merge banner is visible')
  const posts = () => h.calls.filter(c => c.method === 'POST').length
  const before = posts()
  await h.node('discount').props.onApplyDiscountCode('NEWCODE'); await h.runtime.flush()
  assert.equal(posts(), before, 'discount apply is gated while the merge is incomplete')
  const bannerRetry = uiNodes(banner()).find(n => n.type === 'button')
  await bannerRetry.props.onClick(); await h.runtime.flush()
  assert.equal(h.retryCalls.length, 1, 'banner retry runs the shared merge retry')
  assert.ok(banner(), 'banner stays while the retry keeps failing')
  await h.node('payment').props.onPlaceOrder(); await h.runtime.flush()
  assert.equal(h.retryCalls.length, 2, 'payment triggers the inline merge retry instead of charging')
  assert.ok(!h.calls.some(c => c.path === '/api/checkout/session' && c.method === 'POST'), 'no Stripe session while the merge is incomplete')
  h.runtime.unmount()
})

test('a focus-return retry heals the merge: banner clears, writes reopen and no payment fires without intent', async () => {
  const h = checkoutFixture({ mergeFailed: true }); await h.runtime.flush()
  const banner = () => uiNodes(h.runtime.tree).find(n => n.props?.role === 'alert' && uiText(n).includes('checkout.accountLinkPaused'))
  assert.ok(banner(), 'merge banner is visible before focus')
  h.runtime.window.dispatch('focus'); await h.runtime.flush()
  assert.equal(h.retryCalls.length, 1, 'focus return runs the merge retry once')
  assert.ok(!banner(), 'banner clears after a successful retry')
  assert.ok(!h.calls.some(c => c.path === '/api/checkout/session' && c.method === 'POST'), 'a bare focus heal never starts payment on its own')
  const before = h.calls.filter(c => c.method === 'POST').length
  await h.node('discount').props.onApplyDiscountCode('NEWCODE'); await h.runtime.flush()
  assert.ok(h.calls.filter(c => c.method === 'POST').length > before, 'writes reopen after the merge heals')
  h.runtime.unmount()
})

test('quantity changes are gated too: zero requests and zero local mutation while the merge is incomplete', async () => {
  const h = checkoutFixture({ mergeFailed: true, healOnRetry: false }); await h.runtime.flush()
  const before = h.calls.filter(c => c.method !== 'GET').length
  h.node('items').props.onQuantityChange('line-1', 3); await h.runtime.flush()
  assert.equal(h.quantityCalls.length, 0, 'no local quantity mutation while gated')
  assert.equal(h.calls.filter(c => c.method !== 'GET').length, before, 'no quantity PATCH while gated')
  h.context.customerMergeFailed = false; h.runtime.render(); await h.runtime.flush()
  h.node('items').props.onQuantityChange('line-1', 3); await h.runtime.flush()
  assert.equal(h.quantityCalls.length, 1, 'quantity changes resume after the merge heals')
  h.runtime.unmount()
})


test('payment updates both visible totals after a price change and waits for a second click', async () => {
  const h = checkoutFixture({ onPayment: body => body.expectedTotalMinor === 3900
    ? Response.json({ code: 'checkout_quote_changed', quote: { currency: 'USD', totalMinor: 4100,
      subtotalUsd: 39, productDiscountUsd: 5, shippingDiscountUsd: 3, multiBookDiscountUsd: 0, shippingAmountUsd: 10 } }, { status: 409 })
    : Response.json({ url: 'https://checkout.example.test/session' }) })
  await settleCheckout(h)
  assert.equal(h.node('summary').props.formattedTotal, '$39.00')
  h.node('payment').props.onPlaceOrder()
  await h.runtime.flush()
  assert.equal(h.runtime.navigations.length, 0)
  assert.match(uiText(h.runtime.tree), /checkout.quoteChanged/)
  assert.equal(h.node('summary').props.formattedTotal, '$41.00')
  assert.equal(h.node('mobile-payment').props.totalLabel, '$41.00')
  assert.equal(h.calls.filter(call => call.path === '/api/checkout/session').length, 1)

  h.node('payment').props.onPlaceOrder()
  await h.runtime.flush()
  assert.deepEqual(h.calls.filter(call => call.path === '/api/checkout/session').map(call => call.body.expectedTotalMinor), [3900, 4100])
  assert.equal(h.runtime.navigations.length, 1)
  h.runtime.unmount()
})

test('switching currency ignores a late quote and disables payment until the new quote arrives', async () => {
  const usd = deferred(), hkd = deferred()
  const h = checkoutFixture({ onQuote: body => body.currency === 'USD' ? usd.promise : hkd.promise })
  await settleCheckout(h)
  h.context.displayCurrency = 'HKD'
  h.runtime.render()
  await settleCheckout(h)
  usd.resolve(Response.json({ quote: { currency: 'USD', totalMinor: 3900 } }))
  await h.runtime.flush()
  assert.equal(h.node('payment').props.canPay, false)
  assert.equal(h.node('mobile-payment').props.isPriceReady, false)

  hkd.resolve(Response.json({ quote: { currency: 'HKD', totalMinor: 30420,
    subtotalUsd: 39, productDiscountUsd: 5, shippingDiscountUsd: 3, multiBookDiscountUsd: 0, shippingAmountUsd: 8 } }))
  await h.runtime.flush()
  assert.equal(h.node('payment').props.canPay, true)
  assert.match(h.node('mobile-payment').props.totalLabel, /304\.20/)
  h.runtime.unmount()
})

test('changing a quantity clears the payable total until the save is acknowledged and a new quote arrives', async () => {
  const saved = deferred()
  const h = checkoutFixture({ onQuantity: () => saved.promise })
  await settleCheckout(h)
  const quoteCount = () => h.calls.filter(call => call.path === '/api/checkout/quote').length
  const initialQuotes = quoteCount()
  assert.equal(h.node('payment').props.canPay, true)
  h.node('items').props.onQuantityChange('line-1', 2)
  await h.runtime.flush()
  assert.equal(quoteCount(), initialQuotes)
  assert.equal(h.node('payment').props.canPay, false)
  h.node('payment').props.onPlaceOrder()
  assert.equal(h.calls.filter(call => call.path === '/api/checkout/session').length, 0)
  saved.resolve(true)
  await settleCheckout(h)
  assert.equal(quoteCount(), initialQuotes + 1)
  assert.equal(h.node('payment').props.canPay, true)
  h.runtime.unmount()
})

test('mobile review jumps to the summary without starting Stripe', async () => {
  const h = checkoutFixture(); await settleCheckout(h)
  const actions = []
  h.runtime.document.getElementById = id => ({
    scrollIntoView: options => actions.push([id, options.block]),
    focus: options => actions.push([id, options.preventScroll]),
  })
  h.node('mobile-payment').props.onClick()
  assert.deepEqual(actions, [['checkout-order-summary', 'start'], ['checkout-order-summary', true]])
  assert.equal(h.calls.filter(call => call.path === '/api/checkout/session').length, 0)
  h.runtime.unmount()
})

test('an opted-in address save runs only after a successful session and cannot prevent redirect', async () => {
  const session = deferred()
  const h = checkoutFixture({ onPayment: () => session.promise, onAddressSave: () => Promise.reject(Error('offline')) })
  await settleCheckout(h)
  h.node('address-form').props.onSaveAddressChange(true)
  await h.runtime.flush()
  assert.equal(h.node('address-form').props.saveAddress, true)
  h.node('payment').props.onPlaceOrder(); await h.runtime.flush()
  assert.equal(h.calls.filter(call => call.path === '/api/user/addresses').length, 0)
  session.resolve(Response.json({ url: 'https://checkout.example.test/session' }))
  await h.runtime.flush()
  const save = h.calls.find(call => call.path === '/api/user/addresses')
  assert.equal(save.keepalive, true)
  assert.deepEqual(save.body.address, h.calls.find(call => call.path === '/api/checkout/session').body.shippingAddress)
  assert.deepEqual(h.runtime.navigations, ['https://checkout.example.test/session'])
  h.runtime.unmount()
})
