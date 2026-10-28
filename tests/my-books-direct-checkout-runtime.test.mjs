import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { loadUi, uiNodes, uiText } from './helpers/preview-uiux-harness.mjs'
import { deferred } from './helpers/customer-event-harness.mjs'

// Execute the actual component callbacks, not a duplicate checkout implementation.
function callback(file, name, context) {
  const source = ts.createSourceFile(file, readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let expression
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) {
      const initial = node.initializer
      expression = ts.isCallExpression(initial) ? initial.arguments[0] : initial
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(expression, `${file} defines ${name}`)
  context.module = { exports: {} }
  vm.runInContext(ts.transpileModule(`module.exports = ${expression.getText(source)}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context)
  return context.module.exports
}

function fixture(kind, choice) {
  const requests = [], pushes = [], hydrated = [], pending = [], errors = []
  const gate = deferred()
  let reject = false
  const { startOwnedCreationCheckout } = loadUi('src/lib/owned-creation-checkout-client.ts', {}, {
    URLSearchParams,
    fetch: async (url, options) => {
      requests.push({ url, options })
      if (url === '/api/orders/start') {
        await gate.promise
        return reject ? new Response(null, { status: 503 }) : Response.json({ orderId: 'new-order', cartItemIds: ['new-line'] })
      }
      assert.match(url, /^\/api\/cart\?ids=new-line&customerId=owner$/)
      return Response.json({ items: [{ cart_item_id: 'new-line', quantity: 1 }] })
    },
  })
  const forbidden = () => { throw Error('Purchase must not detour, edit materials, or add to cart') }
  const context = vm.createContext({
    startOwnedCreationCheckout, user: { customerId: 'owner' }, creation: { creationId: 'saved' },
    // Optional data can be absent, pending, failed, undecided or confirmed.
    dedicationChoices: { saved: choice }, pendingAction: null,
    existingCart: [{ creationId: 'saved', quantity: 7 }],
    checkoutInFlightRef: { current: false },
    setNotice: value => errors.push(value), setPendingAction: value => pending.push(value),
    setCheckoutPending: value => pending.push(value), setCheckoutError: value => errors.push(value),
    hydrateCheckoutItems: value => hydrated.push(value), router: { push: href => pushes.push(href) },
    t: key => key, goToPreview: forbidden, addToCart: forbidden, setIsMessageEditorOpen: forbidden,
  })
  const file = kind === 'saved' ? 'app/my-books/page.tsx' : 'app/my-books/[creationId]/OwnedBookReader.tsx'
  const click = callback(file, kind === 'saved' ? 'handleBuyNow' : 'handleBuyAgain', context)
  return { click: () => click({ creation_id: 'saved' }), requests, pushes, hydrated, pending, errors, context,
    release: () => gate.resolve(), fail: () => { reject = true }, recover: () => { reject = false } }
}

for (const choice of [undefined, null, { decision: 'undecided' }, { decision: 'confirmed' }, { decision: 'skipped' }, { previouslyPurchased: true }, { error: true }]) {
  test(`Saved Buy Now bypasses optional material state ${JSON.stringify(choice)}`, async () => {
    const h = fixture('saved', choice)
    const first = h.click(), duplicate = h.click()
    assert.equal(h.requests.length, 1, 'synchronous latch works before a React render')
    assert.equal(h.pushes.length, 0)
    h.release(); await Promise.all([first, duplicate])
    assert.deepEqual(JSON.parse(h.requests[0].options.body), { customerId: 'owner', items: [{ creationId: 'saved', quantity: 1 }] })
    assert.equal(h.requests[0].options.credentials, 'include')
    assert.deepEqual(h.pushes, ['/checkout?ids=new-line&orderId=new-order'])
    assert.equal(h.hydrated[0][0].quantity, 1, 'existing quantity seven is not incremented or reused')
    await h.click(); assert.equal(h.requests.length, 2, 'busy remains through successful navigation: one POST and one hydrate GET')
  })
}

for (const kind of ['saved', 'reader']) {
  test(`${kind} purchase failure unlocks for an explicit retry without automatic replay`, async () => {
    const h = fixture(kind)
    h.fail(); const first = h.click(); await h.click(); h.release(); await first
    assert.equal(h.requests.length, 1); assert.equal(h.pushes.length, 0)
    assert.equal(h.context.checkoutInFlightRef.current, false)
    assert.ok(h.errors.some(value => value === 'myBooks.checkoutFailed' || value?.message === 'myBooks.checkoutFailed'))
    h.recover(); const retry = h.click(); await h.click(); await retry
    assert.equal(h.requests.filter(value => value.url === '/api/orders/start').length, 2)
    assert.deepEqual(h.pushes, ['/checkout?ids=new-line&orderId=new-order'])
    assert.equal(h.context.checkoutInFlightRef.current, true)
  })
}

test('Reader Buy Again is one fresh quantity-one checkout, with no generation or material writes', async () => {
  const h = fixture('reader')
  const first = h.click(); await h.click(); h.release(); await first
  assert.deepEqual(JSON.parse(h.requests[0].options.body).items, [{ creationId: 'saved', quantity: 1 }])
  assert.equal(h.requests.length, 2); assert.equal(h.pushes.length, 1)
  assert.ok(h.requests.every(value => value.url === '/api/orders/start' || value.url.startsWith('/api/cart?')))
})

test('explicit Finish still opens the editor, while normal Preview and Cart keep the fixed library origin', () => {
  const context = vm.createContext({ URLSearchParams })
  const build = callback('app/my-books/page.tsx', 'buildPreviewHref', context)
  const item = { creation_id: '00000000-0000-4000-8000-000000000001', preview_job_id: '00000000-0000-4000-8000-000000000002', template_id: 'Story' }
  const normal = new URL(build(item), 'https://fixture.test')
  const finish = new URL(build(item, { dedication: true }), normal)
  assert.equal(normal.searchParams.get('source'), 'my-books'); assert.equal(normal.searchParams.has('dedication'), false)
  assert.equal(finish.searchParams.get('dedication'), '1'); assert.equal(finish.searchParams.has('purchase'), false)
  const nav = loadUi('src/lib/cart-navigation.ts', {}, { URLSearchParams })
  const cart = new URL(nav.buildPreviewCartHref({ bookId: 'Story', creationId: item.creation_id, committedPreviewJobId: item.preview_job_id, source: normal.searchParams.get('source') }), normal)
  const restored = new URL(nav.resolvePreviewCartReturnPath(cart.search), normal)
  for (const key of ['source', 'creationId', 'jobId']) assert.equal(restored.searchParams.get(key), normal.searchParams.get(key))
})

test('version URL replacement retains only source=my-books and the newly selected identity', () => {
  for (const source of ['my-books', 'my-books-purchased', 'https://evil.example']) {
    let replaced
    const context = vm.createContext({ URLSearchParams, window: { location: { search: `?source=${encodeURIComponent(source)}` } },
      replacePersonalizeUrl: params => { replaced = params } })
    callback('components/PersonalizePage.tsx', 'replacePreviewUrl', context)('selected-creation', 'selected-job')
    assert.equal(replaced.get('creationId'), 'selected-creation'); assert.equal(replaced.get('jobId'), 'selected-job')
    assert.equal(replaced.get('source'), source === 'my-books' ? 'my-books' : null)
  }
})

test('Saved card renders approved optional/purchase copy outside buttons and retains explicit Finish', () => {
  const messages = loadUi('src/lib/i18n-messages.ts')
  // Resolve via the production dictionary accessor rather than duplicating copy in UI fixtures.
  const t = key => messages.getUiMessage(key)
  let finished = 0
  const { MyBooksGrid } = loadUi('app/my-books/MyBooksGrid.tsx', {
    '@/components/Button': { Button: 'button' }, '@/components/BookCardCover': { BookCardCover: 'cover' },
  })
  const item = { creation_id: 'saved', template_id: 'Story', templates: { name: 'A Book' } }
  const tree = MyBooksGrid({ items: [item], dedicationChoices: { saved: { decision: 'undecided' } }, displayCurrency: 'USD',
    t, resolveCover: () => null, resolveTemplatePrice: () => 39, resolveTemplateCompareAtPrice: () => null,
    resolveTemplateDiscountPercent: () => null, buildPreviewHref: () => '/personalize/Story', onFinishDedication: () => finished++ })
  const hint = uiNodes(tree).find(node => node.type === 'p' && uiText(node) === t('myBooks.purchaseMaterialsHint'))
  assert.ok(hint); assert.ok(hint.props.className.includes('leading-5'))
  assert.ok(uiText(tree).includes('Optional message — add it now or after purchase.'))
  const finish = uiNodes(tree).find(node => node.type === 'button' && uiText(node) === 'Finish in Preview')
  finish.props.onClick(); assert.equal(finished, 1)
  assert.ok(uiNodes(tree).filter(node => node.type === 'button').every(node => !uiText(node).includes(t('myBooks.purchaseMaterialsHint'))))
})
