import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { shippingHarness } from './helpers/shipping-discount-harness.mjs'

const require = createRequire(import.meta.url), h = shippingHarness(), cache = new Map()
function load(file) {
  if (cache.has(file)) return cache.get(file)
  const fixtureModule = { exports: {} }
  cache.set(file, fixtureModule.exports)
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    module: fixtureModule, exports: fixtureModule.exports,
    require(name) {
      if (name === './ShippingPrice') return load('app/checkout/ShippingPrice.tsx')
      if (name.startsWith('@/lib/')) return h.load('src/' + name.slice(2) + '.ts')
      return require(name)
    },
  })
  return fixtureModule.exports
}
const Price = load('app/checkout/ShippingPrice.tsx').ShippingPrice
const Summary = load('app/checkout/CheckoutSummaryPanel.tsx').CheckoutSummaryPanel
const render = (component, props) => renderToStaticMarkup(React.createElement(component, props))

test('shipping promotion renders original/sale/actual savings from the frozen quote', () => {
  const html = render(Price, { amountUsd: 4, snapshot: { originalShippingAmountUsd: 10 }, currency: 'USD' })
  assert.match(html, /<s[^>]*>\$10\.00<\/s>/)
  assert.match(html, />\$4\.00<\/span>/)
  assert.match(html, /60% OFF/)
})

test('no-discount and legacy snapshots have no strike-through or badge', () => {
  for (const snapshot of [null, {}, { originalShippingAmountUsd: 4 }, { originalShippingAmountUsd: 'invalid' }]) {
    const html = render(Price, { amountUsd: 4, snapshot, currency: 'USD' })
    assert.doesNotMatch(html, /<s\b|% OFF/)
    assert.match(html, /\$4\.00/)
  }
})

test('currency formatting applies equally to both prices, including zero-decimal JPY', () => {
  const html = render(Price, { amountUsd: 4, snapshot: { originalShippingAmountUsd: 10 }, currency: 'JPY' })
  assert.match(html, /1,490/)
  assert.match(html, /596/)
  assert.doesNotMatch(html, /596\.00/)
})

test('rounding-equivalent displayed prices do not advertise a saving', () => {
  const html = render(Price, { amountUsd: 0.003, snapshot: { originalShippingAmountUsd: 0.004 }, currency: 'USD' })
  assert.doesNotMatch(html, /<s\b|% OFF/)
})

const props = { hiddenOnPaymentStep: false, isPriceReady: true, showShipping: true, shippingStatus: 'available',
  discountTotalUsd: 0, shippingDiscountTotalUsd: 4, shippingAmountUsd: 4, shippingRateSnapshot: { originalShippingAmountUsd: 10 }, currency: 'USD',
  formattedSubtotal: '$39.00', formattedShipping: '$4.00', formattedNetShipping: '$0.00', formattedDiscount: '$0.00',
  formattedShippingDiscount: '$4.00', formattedTotal: '$39.00', t: key => key }

test('summary uses the same promotional price while keeping the free-shipping deduction and final total', () => {
  const html = render(Summary, props)
  assert.match(html, /<s[^>]*>\$10\.00<\/s>/)
  assert.match(html, /60% OFF/)
  assert.match(html, />\$0\.00<\/span>/)
  assert.match(html, /-\$4\.00/)
  assert.match(html, /\$39\.00/)
})

test('loading/unavailable shipping and hidden shipping never expose a stale sale', () => {
  for (const overrides of [{ shippingStatus: 'loading' }, { shippingStatus: 'unavailable' }, { showShipping: false }]) {
    const html = render(Summary, { ...props, ...overrides })
    assert.doesNotMatch(html, /<s\b|% OFF/)
  }
})
