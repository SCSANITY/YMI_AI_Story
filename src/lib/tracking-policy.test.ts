import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PageViewDeduper,
  buildSafePageView,
  buildTrackingCookieDeletionStrings,
  countTrackingItems,
  createLocalNavigationKey,
  createTransactionSurrogate,
  redactTrackingPath,
  resolveTrackingFormat,
  resolveTrackingActivation,
  sanitizeTrackingEvent,
} from './tracking-policy'

test('redacts every known dynamic route and strips complete query strings', () => {
  assert.equal(redactTrackingPath('/my-books/creation-secret?view=reader'), '/my-books')
  assert.equal(redactTrackingPath('/orders/order-secret?session_id=secret'), '/orders')
  assert.equal(redactTrackingPath('/support/order-secret?email=secret'), '/support')
  assert.equal(redactTrackingPath('/share/preview/token-secret?x=1'), '/share/preview')
  assert.equal(redactTrackingPath('/invite/invite-secret'), '/invite')
  assert.equal(redactTrackingPath('/personalize/Food_story?child=Mia'), '/personalize')
  assert.equal(redactTrackingPath('/share/preview'), '/share/preview')
  assert.equal(redactTrackingPath('/invite'), '/invite')
  assert.equal(redactTrackingPath('/personalize'), '/personalize')
  assert.equal(
    redactTrackingPath('https://www.ymistory.com/checkout/success?orderId=secret&session_id=secret'),
    '/checkout/success',
  )
  assert.equal(redactTrackingPath('/unknown/private/value?email=secret'), '/other')
})

test('builds page-view metadata without raw paths, query strings, titles, or referrers', () => {
  assert.deepEqual(
    buildSafePageView('/orders/order-secret?session_id=secret', 'https://preview.example.com/path'),
    {
      page_path: '/orders',
      page_location: 'https://preview.example.com/orders',
      page_title: 'Orders',
      page_referrer: '',
    },
  )
})

test('allows only coarse event names and tightly constrained payload keys', () => {
  assert.deepEqual(
    sanitizeTrackingEvent('begin_checkout', {
      format: 'physical',
      item_count: 2,
      currency: 'usd',
      value: 49.999,
    }),
    {
      name: 'begin_checkout',
      payload: {
        format: 'physical',
        item_count: 2,
        currency: 'USD',
        value: 50,
      },
    },
  )
  assert.equal(sanitizeTrackingEvent('begin_checkout', { orderId: 'secret' }), null)
  assert.equal(sanitizeTrackingEvent('purchase', { transaction_id: 'raw-order-id' }), null)
  assert.equal(sanitizeTrackingEvent('child_photo_uploaded', {}), null)
})

test('keeps every vendor denied while consent is unresolved or not granted', () => {
  const configured = { ga4: true, googleAds: true, meta: true }

  assert.deepEqual(resolveTrackingActivation(null, configured), {
    googleAnalytics: false,
    googleAds: false,
    meta: false,
  })
  assert.deepEqual(
    resolveTrackingActivation({ analytics: false, marketing: false }, configured),
    {
      googleAnalytics: false,
      googleAds: false,
      meta: false,
    },
  )
  assert.deepEqual(
    resolveTrackingActivation({ analytics: true, marketing: false }, configured),
    {
      googleAnalytics: true,
      googleAds: false,
      meta: false,
    },
  )
})

test('creates a deterministic non-reversible transaction surrogate', async () => {
  const first = await createTransactionSurrogate('raw-order-id')
  const second = await createTransactionSurrogate('raw-order-id')

  assert.match(first ?? '', /^ymi_[a-f0-9]{32}$/)
  assert.equal(first, second)
  assert.notEqual(first, 'raw-order-id')
})

test('derives only coarse commerce facts from cart items', () => {
  assert.equal(countTrackingItems([{ quantity: 2 }, { quantity: 1 }]), 3)
  assert.equal(countTrackingItems([{ quantity: 0 }]), undefined)
  assert.equal(resolveTrackingFormat([{ bookType: 'digital' }]), 'pdf')
  assert.equal(resolveTrackingFormat([{ bookType: 'basic' }, { bookType: 'supreme' }]), 'physical')
  assert.equal(resolveTrackingFormat([{ bookType: 'digital' }, { bookType: 'basic' }]), undefined)
})

test('deduplicates StrictMode repeats while allowing a new committed navigation', () => {
  const deduper = new PageViewDeduper()
  const first = createLocalNavigationKey('/books')
  const second = createLocalNavigationKey('/orders/order-a', 'view=detail')

  assert.equal(deduper.shouldEmit('google-analytics', first), true)
  assert.equal(deduper.shouldEmit('google-analytics', first), false)
  assert.equal(deduper.shouldEmit('google-analytics', second), true)
  assert.equal(deduper.shouldEmit('meta', second), true)
  deduper.reset('meta')
  assert.equal(deduper.shouldEmit('meta', second), true)
})

test('builds removal directives for all reachable tracking cookies', () => {
  const directives = buildTrackingCookieDeletionStrings(
    '_ga=1; _ga_ABC=2; _fbp=3; _fbc=4; _gcl_au=5; session=keep',
    'www.ymistory.com',
  )

  assert.ok(directives.some((value) => value.startsWith('_ga=') && !value.includes('Domain=')))
  assert.ok(directives.some((value) => value.startsWith('_ga_ABC=') && value.includes('Domain=.ymistory.com')))
  assert.ok(directives.some((value) => value.startsWith('_fbp=')))
  assert.ok(directives.some((value) => value.startsWith('_fbc=')))
  assert.ok(directives.some((value) => value.startsWith('_gcl_au=')))
  assert.ok(directives.every((value) => !value.startsWith('session=')))

  const analyticsOnly = buildTrackingCookieDeletionStrings(
    '_ga=1; _fbp=2; _gcl_au=3',
    'www.ymistory.com',
    'analytics',
  )
  assert.ok(analyticsOnly.some((value) => value.startsWith('_ga=')))
  assert.ok(analyticsOnly.every((value) => !value.startsWith('_fbp=') && !value.startsWith('_gcl_au=')))
})
