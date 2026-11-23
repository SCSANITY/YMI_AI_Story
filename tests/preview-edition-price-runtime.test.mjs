import assert from 'node:assert/strict'
import test from 'node:test'

import {loadUi,uiNodes as nodes,uiText as text} from './helpers/preview-uiux-harness.mjs'
const pricing = loadUi('src/lib/package-pricing.ts')
const formatter = loadUi('src/lib/locale-pricing.ts').formatDisplayCurrency
const price = (type, list, sale, percent) => pricing.packagePriceRowToModel({ package_type: type, list_price_usd: list, sale_price_usd: sale, display_discount_percent: percent, row_version: 1 })
const book = () => ({ packagePricing: { basic: price('basic', 49, 39, 20), supreme: price('supreme', 149, 89, 37) } })
function harness() {
  const changes=[]
  let selected='basic'
  const Panel=loadUi('components/personalize/PreviewYourBookPanel.tsx').PreviewYourBookPanel
  return {changes,render(book,currency='USD') {
    const tree=Panel({value:selected,pricing:book.packagePricing,currency,childName:'Mia',voiceReady:false,
      actions:null,onDetails:()=>{},onVoice:()=>{},onMessage:()=>{},onChange:type=>{changes.push(type);selected=type}})
    return {tree,labels:nodes(tree).filter(n=>n.type==='label')}
  }}
}

test('both Preview options retain their full Catalog model, including the display-percent override', () => {
  const b = book(), view = harness().render(b)
  assert.deepEqual(view.labels.map(label => nodes(label).filter(n => n.type === 's').map(text)), [['$49.00'], ['$149.00']])
  assert.ok(text(view.labels[0]).includes('$39.00'))
  assert.ok(text(view.labels[0]).includes('20% OFF'))
  assert.ok(text(view.labels[1]).includes('$89.00'))
  assert.ok(text(view.labels[1]).includes('37% OFF'))
})

test('updated Catalog prices and currency rerender without stale prices or phantom discounts', () => {
  const b = book(), h = harness()
  h.render(b)
  b.packagePricing.basic = price('basic', 55, null)
  b.packagePricing.supreme = price('supreme', 149, 99)
  const view = h.render(b, 'JPY')
  assert.equal(nodes(view.labels[0]).filter(n => n.type === 's').length, 0)
  assert.ok(!text(view.labels[0]).includes('%'))
  assert.ok(text(view.labels[0]).includes(formatter(55, 'JPY')))
  assert.ok(text(view.labels[1]).includes(formatter(99, 'JPY')))
  assert.ok(text(view.labels[1]).includes('34% OFF'))
  assert.ok(!text(view.tree).includes('$39.00'))
})

test('edition selection still calls the existing purchase callback with its type only', () => {
  const b = book(), h = harness(), view = h.render(b)
  nodes(view.labels[1]).find(n => n.type === 'input').props.onChange()
  assert.deepEqual(h.changes, ['supreme'])
  const updated = h.render(b)
  assert.equal(nodes(updated.labels[0]).find(n => n.type === 'input').props.checked, false)
  assert.equal(nodes(updated.labels[1]).find(n => n.type === 'input').props.checked, true)
  assert.ok(text(updated.labels[1]).includes('$89.00'))
})

test('only the approved story and version expose a selectable PDF and its actual sale price', () => {
  const globals = { process: { env: { NEXT_PUBLIC_PERSONALIZED_PDF_OFFERS: 'sample@7' } } }
  const { packagePriceRowsToPricing } = loadUi('src/lib/package-pricing.ts', {}, globals)
  const { activeCartUnitPrice } = loadUi('src/lib/cart-price.ts', {}, globals)
  const rows = [
    { package_type: 'basic', list_price_usd: 39, row_version: 1 },
    { package_type: 'supreme', list_price_usd: 89, row_version: 1 },
    { package_type: 'digital', list_price_usd: 18, sale_price_usd: 12.34, row_version: 7 },
  ]
  assert.equal(packagePriceRowsToPricing(rows, 'another').digital, undefined)
  assert.equal(packagePriceRowsToPricing([...rows.slice(0,2), { ...rows[2], row_version: 6 }], 'sample').digital, undefined)
  const model = { packagePricing: packagePriceRowsToPricing(rows, 'sample') }
  const h = harness()
  const label = h.render(model).labels.find(label => text(label).includes('PDF only'))
  assert.ok(text(label).includes('$12.34'))
  nodes(label).find(n => n.type === 'input').props.onChange()
  assert.deepEqual(h.changes, ['digital'])
  assert.equal(activeCartUnitPrice({ package_type: 'digital', creations: { template_id: 'sample', templates: { package_prices: rows } } }), 12.34)
})
