import assert from 'node:assert/strict'
import test from 'node:test'
import { loadUi, uiText, uiNodes } from './helpers/preview-uiux-harness.mjs'

function harness({ admin = true, writeError = false } = {}) {
  const invalidations = [], updates = [], cachedPages = new Map()
  const rows = new Map(['Story_A', 'Story_B'].map(id => [id, [
    { package_type: 'basic', list_price_usd: 49, sale_price_usd: 39, display_discount_percent: 20, row_version: 1 },
    { package_type: 'supreme', list_price_usd: 109, sale_price_usd: 87, display_discount_percent: 20, row_version: 1 },
  ]]))
  const react = { useState: value => [typeof value === 'function' ? value() : value, () => {}], useEffect() {}, useRef: () => ({ current: null }), useId: () => 'synthetic-dialog' }
  const globals = { process: { env: {} }, document: { body: {} } }
  const injections = {
    react, 'react-dom': { createPortal: node => node },
    'next/server': { NextResponse: { json: Response.json } },
    'next/cache': { revalidatePath(path, type) {
      invalidations.push([path, type])
      // Model the shared static route boundary, not a second price resolver.
      if (path === '/personalize/[bookID]' && type === 'page') cachedPages.clear()
    } },
    '@/lib/adminAuth': { requireAdminCustomer: async () => admin ? { customer_id: 'admin-a' } : null },
    '@/lib/supabaseAdmin': { supabaseAdmin: { from(table) {
      assert.equal(table, 'template_package_prices')
      const filters = {}, query = {
        update(value) { updates.push(value); return query },
        eq(key, value) { filters[key] = value; return query }, select() { return query },
        async maybeSingle() {
          if (writeError) return { data: null, error: { message: 'synthetic write failure' } }
          const row = rows.get(filters.template_id)?.find(row => row.package_type === filters.package_type && row.row_version === filters.row_version)
          if (!row) return { data: null, error: null }
          Object.assign(row, updates.at(-1))
          return { data: { ...row }, error: null }
        },
      }
      return query
    } } },
  }
  const load = path => loadUi(path, injections, globals)
  const { templateRowToBook } = load('src/lib/book-catalog.ts')
  const { PATCH } = load('app/api/admin/catalog/pricing/route.ts')
  const Panel = load('components/personalize/PreviewYourBookPanel.tsx').PreviewYourBookPanel
  const Cards = load('components/personalize/product/EditionCards.tsx').default
  const Details = load('components/personalize/EditionDetailsDialog.tsx').EditionDetailsDialog
  const noop = () => {}
  function visit(id, currency = 'USD') {
    if (!cachedPages.has(id)) cachedPages.set(id, templateRowToBook({ template_id: id, name: id, package_prices: rows.get(id) }))
    const book = cachedPages.get(id), pricing = book.packagePricing
    return {
      panel: Panel({ value: 'basic', pricing, currency, childName: 'Mia', voiceReady: false, actions: null, onChange: noop, onDetails: noop, onVoice: noop, onMessage: noop }),
      cards: Cards({ pricing, currency }),
      details: Details({ edition: 'supreme', selected: 'basic', price: pricing.supreme, currency, onChoose: noop, onClose: noop }),
    }
  }
  const save = body => PATCH(new Request('https://example.test/api/admin/catalog/pricing', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ templateId: 'Story_A', packageType: 'basic', expectedVersion: 1, ...body }) }))
  return { visit, save, invalidations, updates }
}

test('Admin price save refreshes cached Customize C, Preview options and details from the same story Catalog', async () => {
  const h = harness()
  assert.ok(uiText(h.visit('Story_A').cards).includes('$39.00'))
  assert.ok(uiText(h.visit('Story_B').panel).includes('$87.00'))
  assert.equal((await h.save({ listPriceUsd: 65, salePriceUsd: 51, displayDiscountPercent: 17 })).status, 200)
  assert.equal((await h.save({ packageType: 'supreme', listPriceUsd: 155, salePriceUsd: 123, displayDiscountPercent: 21 })).status, 200)
  const updated = h.visit('Story_A')
  for (const tree of [updated.panel, updated.cards]) {
    assert.match(uiText(tree), /\$51\.00/)
    assert.match(uiText(tree), /\$123\.00/)
    assert.match(uiText(tree), /17% OFF/)
    assert.match(uiText(tree), /21% OFF/)
    assert.doesNotMatch(uiText(tree), /\$39\.00|\$87\.00/)
  }
  assert.match(uiText(updated.details), /\$155\.00.*\$123\.00/)
  assert.match(uiText(h.visit('Story_B').cards), /\$39\.00.*\$87\.00/)
  assert.ok(h.invalidations.some(([path, type]) => path === '/personalize/[bookID]' && type === 'page'))
  for (const path of ['/', '/books', '/api/templates']) assert.ok(h.invalidations.some(call => call[0] === path))
})

test('removing a sale refreshes both editions without a stale discount and retains selected currency formatting', async () => {
  const h = harness()
  h.visit('Story_A')
  for (const packageType of ['basic', 'supreme']) assert.equal((await h.save({ packageType, listPriceUsd: packageType === 'basic' ? 60 : 140, salePriceUsd: null, displayDiscountPercent: null })).status, 200)
  const format = loadUi('src/lib/locale-pricing.ts').formatDisplayCurrency
  const updated = h.visit('Story_A', 'JPY')
  for (const tree of [updated.panel, updated.cards]) {
    assert.ok(uiText(tree).includes(format(60, 'JPY')))
    assert.ok(uiText(tree).includes(format(140, 'JPY')))
    assert.equal(uiNodes(tree).filter(node => node.type === 's').length, 0)
    assert.doesNotMatch(uiText(tree), /% OFF|\$/)
  }
  assert.ok(uiText(updated.details).includes(format(140, 'JPY')))
})

test('unauthorized, invalid, stale-version and failed saves never invalidate the customer page cache', async () => {
  for (const [options, body, status] of [
    [{ admin: false }, { listPriceUsd: 60 }, 403],
    [{}, { listPriceUsd: 60, salePriceUsd: 70 }, 400],
    [{}, { expectedVersion: 9, listPriceUsd: 60 }, 409],
    [{ writeError: true }, { listPriceUsd: 60 }, 500],
  ]) {
    const h = harness(options)
    h.visit('Story_A')
    assert.equal((await h.save(body)).status, status)
    assert.equal(h.invalidations.length, 0)
    assert.match(uiText(h.visit('Story_A').panel), /\$39\.00/)
  }
})
