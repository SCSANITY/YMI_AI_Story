import assert from 'node:assert/strict'
import test from 'node:test'
import { customerRuntime, deferred } from './helpers/customer-event-harness.mjs'
import { loadUi, uiNodes, uiText } from './helpers/preview-uiux-harness.mjs'

const row = id => ({ template_id: id, name: `Story ${id}`, is_active: true, package_prices: [
  { package_type: 'basic', list_price_usd: 49, sale_price_usd: 39, row_version: 1 },
  { package_type: 'supreme', list_price_usd: 109, sale_price_usd: 87, row_version: 1 },
] })
const book = id => ({ bookID: id, title: `Story ${id}` })

function favoritesFixture() {
  const runtime = customerRuntime(), requests = [], unexpected = [], pendingReads = new Map()
  const owned = new Map([['anon', ['guest']], ['a', ['a-book']], ['b', ['b-book']]])
  let context, customer = null, failWrite = false, pendingWrite = null
  runtime.react.createContext = () => ({ Provider: props => { context = props.value; return props.children } })
  const response = ids => Response.json({ items: ids.map(id => ({ template_id: id, templates: row(id) })) })
  const actions = {
    login: async form => { customer = form.get('email').split('@')[0]; return { user: { id: `auth-${customer}`, email: form.get('email') } } },
    signout: async () => { customer = null },
  }
  const fetch = async (url, options = {}) => {
    const method = options.method ?? 'GET', parsed = new URL(url, 'https://fixture.test')
    requests.push({ path: parsed.pathname, query: parsed.search, method })
    if (parsed.pathname === '/api/favourites') {
      if (method === 'POST') {
        if (pendingWrite) await pendingWrite.promise
        if (failWrite) return Response.json({}, { status: 500 })
        const body = JSON.parse(options.body), owner = body.customerId ?? 'anon', ids = owned.get(owner) ?? []
        owned.set(owner, ids.includes(body.templateId) ? ids.filter(id => id !== body.templateId) : [...ids, body.templateId])
        return Response.json({})
      }
      const expectsCustomer = new Headers(options.headers ?? {}).get('X-YMI-Expect-Customer') === '1'
      const owner = expectsCustomer ? (customer ?? 'anon') : 'anon', ids = [...(owned.get(owner) ?? [])]
      return pendingReads.get(owner)?.promise ?? response(ids)
    }
    if (parsed.pathname === '/api/customer/merge') return Response.json({ customerId: customer })
    if (parsed.pathname === '/api/user/account-profile') return Response.json({ customerId: customer, email: `${customer}@fixture.test`, displayName: customer })
    if (parsed.pathname === '/api/cart') return Response.json({ items: [] })
    if (parsed.pathname === '/api/anon/session') { owned.set('anon', []); return Response.json({}) }
    unexpected.push(url); throw Error(`Unexpected fixture fetch: ${url}`)
  }
  const Provider = runtime.load('contexts/GlobalContext.tsx', { '@/lib/supabase': { supabase: {} }, '@/app/actions/auth': actions }, { fetch }).GlobalProvider
  runtime.mount(Provider, { children: null, suspendAuthSync: true })
  return { runtime, requests, unexpected, pendingReads, response, owned,
    get context() { return context },
    set failWrite(value) { failWrite = value },
    set pendingWrite(value) { pendingWrite = value },
    reads: () => requests.filter(r => r.path === '/api/favourites' && r.method === 'GET'),
    async login(id) { await context.login(`${id}@fixture.test`, 'fixture-password'); await runtime.flush() },
  }
}

test('Favorites loads once on startup; elapsed time and window focus never query it', async () => {
  const h = favoritesFixture(); await h.runtime.flush()
  assert.deepEqual(Array.from(h.context.favorites, b => b.bookID), ['guest'])
  assert.equal(h.reads().length, 1)
  h.runtime.advance(3_600_000); h.runtime.window.dispatch('focus'); await h.runtime.flush()
  assert.equal(h.reads().length, 1)
  assert.equal(h.runtime.window.listenerCount('focus'), 0)
  assert.equal(h.runtime.timers.size, 0)
  h.runtime.unmount(); assert.deepEqual(h.unexpected, [])
})

test('Favorites toggle updates immediately, persists on the existing POST and rolls back a failed write', async () => {
  const h = favoritesFixture(); await h.runtime.flush()
  h.context.toggleFavorite(book('new')); h.runtime.render()
  assert.ok(h.context.favorites.some(b => b.bookID === 'new'), 'visible before response settles')
  await h.runtime.flush(); assert.ok(h.owned.get('anon').includes('new'))
  h.context.toggleFavorite(book('new')); h.runtime.render()
  assert.ok(!h.context.favorites.some(b => b.bookID === 'new'))
  await h.runtime.flush(); assert.ok(!h.owned.get('anon').includes('new'))
  h.failWrite = true; h.context.toggleFavorite(book('rejected')); h.runtime.render()
  assert.ok(h.context.favorites.some(b => b.bookID === 'rejected'))
  await h.runtime.flush(); assert.ok(!h.context.favorites.some(b => b.bookID === 'rejected'))
  assert.equal(h.reads().length, 1)
  assert.equal(h.requests.filter(r => r.method === 'POST' && r.path === '/api/favourites').length, 3)
  h.runtime.unmount(); assert.deepEqual(h.unexpected, [])
})

test('Favorites reload on real login/logout paths and discard a prior identity pending load', async () => {
  const h = favoritesFixture(); await h.runtime.flush()
  const late = deferred(); h.pendingReads.set('a', late)
  await h.login('a'); assert.equal(h.context.user.customerId, 'a')
  await h.login('b'); assert.equal(h.context.user.customerId, 'b')
  assert.deepEqual(Array.from(h.context.favorites, b => b.bookID), ['b-book'])
  late.resolve(h.response(['old-a'])); await h.runtime.flush()
  assert.deepEqual(Array.from(h.context.favorites, b => b.bookID), ['b-book'])
  h.context.logout(); await h.runtime.flush()
  assert.equal(h.context.user, null)
  assert.deepEqual(Array.from(h.context.favorites, b => b.bookID), [])
  assert.equal(h.reads().filter(r => r.query).length, 0)
  assert.equal(h.reads().filter(r => !r.query).length, 4)
  h.runtime.advance(60_000); h.runtime.window.dispatch('focus'); await h.runtime.flush()
  assert.equal(h.reads().length, 4)
  h.runtime.unmount(); assert.deepEqual(h.unexpected, [])
})

test('Favorites pending-toggle protection prevents startup response overwriting an optimistic choice', async () => {
  const h = favoritesFixture(), late = deferred(), write = deferred()
  // A new auth-load is delayed while the customer chooses a favorite.
  h.pendingReads.set('a', late); await h.runtime.flush(); await h.login('a')
  const savedFetchCount = h.reads().length
  h.pendingWrite = write
  h.context.toggleFavorite(book('choice')); h.runtime.render()
  late.resolve(h.response(['stale'])); await Promise.resolve(); h.runtime.render()
  await h.runtime.flush()
  assert.ok(h.context.favorites.some(b => b.bookID === 'choice'))
  assert.equal(h.reads().length, savedFetchCount)
  write.resolve(); await h.runtime.flush()
  h.runtime.unmount()
})

function readerData(ready = false) {
  const pages = loadUi('src/lib/final-page-metadata.fixture.ts').createFinalV3Metadata()
  return { eligible: true, finalReady: ready, latestPackageType: 'basic', schemaVersion: 3, assetLayout: 'single-page',
    creation: { creationId: 'creation', templateId: 'DB_story', template: { name: 'A real book' }, customizeSnapshot: { childName: 'Mia' } },
    pages: ready ? pages.map(p => ({ pageIndex: p.page_index, outputOrder: p.output_order, role: p.role, spreadIndex: p.spread_index, side: p.side, pageNumber: p.page_number, url: `https://fixture.test/${p.output_order}.webp` })) : [],
  }
}
function readerFixture(initial = {}) {
  const runtime = customerRuntime(), requests = []
  const context = { user: { customerId: 'a' }, readIdentity: { key: 'customer:a', expectCustomer: true }, isHydrated: true, isAuthResolved: true, openLoginModal() {} }
  let ready = initial.ready ?? false, status = initial.status ?? 200, delayed = null
  const Reader = runtime.load('app/my-books/[creationId]/OwnedBookReader.tsx', {
    'next/link': { default: 'a', __esModule: true },
    'next/navigation': { useRouter: () => ({ push() {} }) },
    '@/contexts/GlobalContext': { useGlobalContext: () => context },
    '@/lib/useI18n': { useI18n: () => ({ t: key => key }) },
    '@/components/personalize/PreviewBookShell': { PreviewBookShell: props => ({ type: 'book-stage', props: { ...props, children: props.renderPage?.('left', 0) } }) },
    '@/components/personalize/useDecodedPreviewCover': { useDecodedPreviewCover: (_identity, url) => ({ url, isReady: Boolean(url) }) },
    'framer-motion': { useReducedMotion: () => false },
    '@/components/personalize/PreviewBookPageContent': { PreviewBookPageContent: 'book-content' },
    '@/components/SignatureVoiceEditionNotice': { SignatureVoiceEditionNotice: 'voice-notice' },
  }, { fetch: async url => { requests.push(url); return delayed?.promise ?? Response.json(status === 200 ? readerData(ready) : {}, { status }) } }).OwnedBookReader
  runtime.mount(Reader, { creationId: 'creation' })
  return { runtime, requests, context, set ready(value) { ready = value }, set status(value) { status = value }, set delayed(value) { delayed = value } }
}

test('Reader does not poll while Final is pending; a visible tab return loads the newly released book', async () => {
  const h = readerFixture(); await h.runtime.flush()
  assert.match(uiText(h.runtime.tree), /myBooks.readerPreparingTitle/)
  assert.equal(h.requests.length, 1)
  h.runtime.advance(3_600_000); await h.runtime.flush(); assert.equal(h.requests.length, 1)
  h.ready = true; h.runtime.document.visibilityState = 'hidden'; h.runtime.document.dispatch('visibilitychange'); await h.runtime.flush()
  assert.equal(h.requests.length, 1)
  h.runtime.document.visibilityState = 'visible'; h.runtime.document.dispatch('visibilitychange'); await h.runtime.flush()
  assert.equal(h.requests.length, 2)
  assert.match(uiText(h.runtime.tree), /myBooks.readerFullBook/)
  assert.ok(uiNodes(h.runtime.tree).some(n => n.type === 'book-stage'))
  h.runtime.unmount(); assert.equal(h.runtime.window.listenerCount('focus'), 0); assert.equal(h.runtime.document.listenerCount('visibilitychange'), 0)
})

test('Reader keeps one resolved identity stable across a token-refresh rerender', async () => {
  const h = readerFixture(); await h.runtime.flush()
  const count = h.requests.length
  h.runtime.render(); await h.runtime.flush()
  assert.equal(h.requests.length, count)
  h.context.readIdentity = { key: 'customer:b', expectCustomer: true }
  h.runtime.render(); await h.runtime.flush()
  assert.equal(h.requests.length, count + 1)
})

test('Reader reopen and focus/pageshow events still load current Final without interval requests', async () => {
  const first = readerFixture(); await first.runtime.flush(); first.runtime.unmount()
  const h = readerFixture({ ready: true }); await h.runtime.flush()
  h.runtime.window.dispatch('focus'); await h.runtime.flush()
  h.runtime.window.dispatch('pageshow', { persisted: true }); await h.runtime.flush()
  assert.match(uiText(h.runtime.tree), /myBooks.readerFullBook/)
  const count = h.requests.length
  assert.equal(count, 1, 'released Readers skip lifecycle refetches')
  h.runtime.advance(3_600_000); await h.runtime.flush()
  assert.equal(h.requests.length, count)
  h.runtime.unmount()
})

test('Reader coalesces lifecycle bursts and applies a completion cooldown while Final is pending', async () => {
  const h = readerFixture(); await h.runtime.flush()
  h.runtime.window.dispatch('focus')
  h.runtime.window.dispatch('pageshow')
  h.runtime.document.dispatch('visibilitychange')
  await h.runtime.flush()
  assert.equal(h.requests.length, 2, 'one request for the lifecycle burst')

  h.runtime.window.dispatch('focus')
  h.runtime.window.dispatch('pageshow')
  await h.runtime.flush()
  assert.equal(h.requests.length, 2, 'cooldown suppresses a second burst')

  h.runtime.advance(15_000)
  h.runtime.window.dispatch('focus')
  await h.runtime.flush()
  assert.equal(h.requests.length, 3, 'refresh resumes after the cooldown')
  h.runtime.unmount()
})

test('Reader image-error renewal shares the guard even after Final is released', async () => {
  const h = readerFixture({ ready: true }); await h.runtime.flush()
  const pageContent = uiNodes(h.runtime.tree).find(n => n.type === 'book-content')
  assert.ok(pageContent?.props?.onImageError)
  pageContent.props.onImageError('expired-url')
  pageContent.props.onImageError('expired-url-2')
  await h.runtime.flush()
  assert.equal(h.requests.length, 2, 'image errors coalesce into one renewal')
  h.runtime.unmount()
})

test('Reader error state still recovers on a visible lifecycle event', async () => {
  const h = readerFixture({ status: 503 }); await h.runtime.flush()
  h.status = 200; h.ready = true
  h.runtime.window.dispatch('focus'); await h.runtime.flush()
  assert.equal(h.requests.length, 2)
  assert.match(uiText(h.runtime.tree), /myBooks.readerFullBook/)
  h.runtime.unmount()
})

test('Reader retains runId fencing,auth dependency reload,Retry and unmount cancellation', async () => {
  const h = readerFixture(); await h.runtime.flush()
  const late = deferred(); h.delayed = late; h.runtime.window.dispatch('focus'); await h.runtime.flush()
  h.delayed = null; h.ready = true; h.context.user = { customerId: 'b' }; h.context.readIdentity = { key: 'customer:b', expectCustomer: true }; h.runtime.render(); await h.runtime.flush()
  assert.ok(h.requests.at(-1).includes('/reader'))
  assert.doesNotMatch(h.requests.at(-1), /customerId=/)
  assert.match(uiText(h.runtime.tree), /myBooks.readerFullBook/)
  late.resolve(Response.json(readerData(false))); await h.runtime.flush()
  assert.match(uiText(h.runtime.tree), /myBooks.readerFullBook/)
  h.runtime.unmount()
  const error = readerFixture({ status: 503 }); await error.runtime.flush()
  const retry = uiNodes(error.runtime.tree).find(n => n.type === 'button' && uiText(n).includes('myBooks.readerRetry'))
  assert.ok(retry); error.status = 200; error.ready = true; retry.props.onClick(); await error.runtime.flush()
  assert.match(uiText(error.runtime.tree), /myBooks.readerFullBook/)
  const pending = deferred(); error.delayed = pending; error.runtime.window.dispatch('focus'); await error.runtime.flush()
  const count = error.requests.length; error.runtime.unmount(); error.runtime.window.dispatch('focus'); error.runtime.document.dispatch('visibilitychange'); await error.runtime.flush()
  pending.resolve(Response.json(readerData(true))); await error.runtime.flush()
  assert.equal(error.requests.length, count)
  assert.equal(error.runtime.lateWrites, 0)
})

test('Reader unauthorized response remains an access state with no background loop', async () => {
  const h = readerFixture({ status: 401 }); await h.runtime.flush()
  assert.match(uiText(h.runtime.tree), /myBooks.readerIssue.signed_out.title/)
  const count = h.requests.length; h.runtime.advance(3_600_000); await h.runtime.flush()
  assert.equal(h.requests.length, count)
  assert.ok(!uiNodes(h.runtime.tree).some(n => n.type === 'book-stage'))
  h.runtime.unmount()
})
