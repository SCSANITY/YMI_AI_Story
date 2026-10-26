import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import {loadUi} from './helpers/preview-uiux-harness.mjs'

// Run CartPage itself, preserving hook state across hydration and cart updates.
function harness() {
  let stateIndex = 0
  const states = [], prepared = [], navigations = []
  const context = {
    cart: [], isHydrated: false, displayCurrency: 'USD',
    prepareCheckout: items => prepared.push(items.map(item => item.id)),
  }
  const jsx = (type, props) => ({ type, props })
  const fixtureModule = { exports: {} }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../app/cart/page.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    module: fixtureModule, exports: fixtureModule.exports,
    require(name) {
      if (name === '@/lib/cart-price') return loadUi('src/lib/cart-price.ts')
      if (name === 'react') return {
        useMemo: fn => fn(),
        useState(initial) {
          const index = stateIndex++
          if (!(index in states)) states[index] = initial
          return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value }]
        },
      }
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === 'next/navigation') return { useRouter: () => ({ push: href => navigations.push(href) }) }
      if (name === '@/contexts/GlobalContext') return { useGlobalContext: () => context }
      if (name === '@/lib/useI18n') return { useI18n: () => ({ t: key => key }) }
      if (name === '@/components/useCustomizeNavigation') return { useCustomizeNavigation: () => ({}) }
      if (name === '@/lib/use-dedication-choices') return { useDedicationChoices: () => ({ choices: {} }) }
      return new Proxy({}, { get: (_, key) => key })
    },
  })
  const find = (node, type) => {
    if (!node || typeof node !== 'object') return undefined
    if (node.type === type) return node.props
    return [node.props?.children].flat(Infinity).map(child => find(child, type)).find(Boolean)
  }
  return {
    context, prepared, navigations,
    render() {
      stateIndex = 0
      const tree = fixtureModule.exports.default()
      return { tree, list: find(tree, 'CartItemsList'), summary: find(tree, 'CartSummaryPanel') }
    },
  }
}

const item = (id, price = 39, quantity = 1) => ({ id, book: { price: 1 }, priceAtPurchase: price, quantity })
const ids = view => Array.from(view.list.selectedIds)

test('all items default selected after asynchronous hydration, including later arrivals before manual choice', () => {
  const h = harness()
  assert.equal(h.render().list, undefined)
  h.context.isHydrated = true
  h.context.cart = [item('a'), item('b', 89, 2)]
  let view = h.render()
  assert.deepEqual(ids(view), ['a', 'b'])
  assert.equal(view.list.allSelected, true)
  assert.equal(view.summary.selectedItemsCount, 2)
  assert.equal(view.summary.selectedTotal, 217)
  h.context.cart = [...h.context.cart, item('c')]
  view = h.render()
  assert.deepEqual(ids(view), ['a', 'b', 'c'])
})

test('first individual deselection retains other items and survives cart rerenders', async () => {
  const h = harness()
  h.context.isHydrated = true
  h.context.cart = [item('a'), item('b', 89)]
  h.render().list.onToggleSelection('a')
  h.context.cart = [item('a', 39, 2), item('b', 89)]
  let view = h.render()
  assert.deepEqual(ids(view), ['b'])
  assert.equal(view.list.allSelected, false)
  assert.equal(view.summary.selectedTotal, 89)
  await view.summary.onCheckout()
  assert.deepEqual(Array.from(h.prepared[0]), ['b'])
  assert.equal(h.navigations[0], '/checkout?ids=b')
  view.list.onToggleSelection('a')
  view = h.render()
  assert.equal(view.list.allSelected, true)
  assert.equal(view.summary.selectedTotal, 167)
})

test('unselect all stays empty on refresh and cannot initiate checkout; select all restores it', async () => {
  const h = harness()
  h.context.isHydrated = true
  h.context.cart = [item('a'), item('b')]
  h.render().list.onToggleSelectAll()
  h.context.cart = [...h.context.cart]
  let view = h.render()
  assert.deepEqual(ids(view), [])
  assert.equal(view.summary.selectedTotal, 0)
  assert.equal(await view.summary.onCheckout(), false)
  assert.equal(h.prepared.length, 0)
  assert.equal(h.navigations.length, 0)
  view.list.onToggleSelectAll()
  view = h.render()
  assert.equal(view.list.allSelected, true)
  await view.summary.onCheckout()
  assert.deepEqual(Array.from(h.prepared[0]), ['a', 'b'])
  assert.equal(h.navigations[0], '/checkout?ids=a%2Cb')
})

test('removed items never contribute to selection, total or checkout', async () => {
  const h = harness()
  h.context.isHydrated = true
  h.context.cart = [item('a'), item('b')]
  h.render().list.onToggleSelection('a')
  h.context.cart = [item('a')]
  const view = h.render()
  assert.deepEqual(ids(view), [])
  assert.equal(view.summary.selectedTotal, 0)
  assert.equal(await view.summary.onCheckout(), false)
})

test('a missing selected-edition price shows a load error and no book display-package fallback or checkout',()=>{
 const h=harness();h.context.isHydrated=true
 h.context.cart=[{id:'invalid',book:{price:39},quantity:1}]
 const view=h.render()
 assert.equal(view.list,undefined);assert.equal(view.summary,undefined)
 assert.match(JSON.stringify(view.tree),/current book prices/)
 assert.equal(h.prepared.length,0)
})
