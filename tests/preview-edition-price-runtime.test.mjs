import assert from 'node:assert/strict'
import test from 'node:test'

import {hookHarness,loadUi,uiNodes as nodes,uiText as text} from './helpers/preview-uiux-harness.mjs'
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

test('personalized PDF catalog rollouts may track later saved prices without enabling other stories or retired revisions', () => {
  const env = {NEXT_PUBLIC_PERSONALIZED_PDF_OFFERS:'sample@4+,pinned@2'}
  const { personalizedPdfOfferEnabled: enabled, purchasedLineEdition: edition } = loadUi('src/lib/package-pricing.ts', {}, {process:{env}})
  for (const [story, rev, expected] of [['sample',3,false],['sample',4,true],['sample',5,true],['pinned',2,true],['pinned',3,false],['other',4,false]]) {
    assert.equal(enabled(story,rev),expected)
  }
  assert.equal(edition('ebook','digital'),'digital')
  assert.equal(edition('physical','digital'),null)
  assert.equal(edition('ebook','supreme'),null)
})

test('fresh personalized book features Voice and the waiting gallery keeps an explicit selection', () => {
  const form = hookHarness('components/personalize/usePersonalizeState.ts', 'usePersonalizeState')
  const gallery = loadUi('components/personalize/PreviewWaitingPages.tsx').PreviewWaitingPages
  const options = { ...book().packagePricing, digital: { effectivePriceUsd: 9.9 } }
  const render = () => {
    const { bookType, setBookType } = form.render()
    const tree = gallery({ name:'Mia', value:bookType, pricing:options, currency:'USD',
      progress:{step:0, interact(){}}, onChange:setBookType })
    const group = nodes(tree).find(n => n.props?.['aria-label'] === 'Book formats')
    return nodes(group).filter(n => n.type === 'button')
  }
  assert.match(text(render().find(b => b.props['aria-pressed'])), /Hardcover \+ Voice/)
  render().find(b => text(b).includes('PDF only')).props.onClick()
  assert.equal(form.render().bookType,'digital')
  assert.match(text(render().find(b => b.props['aria-pressed'])), /PDF only/)
})

test('only the selected Voice edition explains post-payment recording and the purchase panel has no material editor',()=>{
  const Panel=loadUi('components/personalize/PreviewYourBookPanel.tsx').PreviewYourBookPanel
  for (const value of ['basic','supreme','digital']) {
    const tree=Panel({value,pricing:{...book().packagePricing,digital:pricing.catalogPriceModel({list_price_usd:9.9,row_version:1},'digital')},currency:'USD'})
    assert.equal(text(tree).includes('You can add your voice recording after purchase.'),value==='supreme')
    assert.doesNotMatch(text(tree),/Write|A message for|Record now/)
  }
})
