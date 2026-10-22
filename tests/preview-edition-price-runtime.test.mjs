import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const cache = new Map()
function load(file, react) {
  if (!react && cache.has(file)) return cache.get(file)
  const fixtureModule = { exports: {} }
  const jsx = (type, props) => ({ type, props })
  vm.runInNewContext(ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    module: fixtureModule, exports: fixtureModule.exports,
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === 'react') return react
      if (['@/lib/locale-pricing', '@/lib/i18n-config', '@/lib/i18n-messages'].includes(name)) return load(`src/lib/${name.split('/').at(-1)}.ts`)
      return new Proxy({}, { get: (_, key) => key })
    },
  })
  if (!react) cache.set(file, fixtureModule.exports)
  return fixtureModule.exports
}
const pricing = load('src/lib/package-pricing.ts')
const formatter = load('src/lib/locale-pricing.ts').formatDisplayCurrency
const page = ts.createSourceFile('page.tsx', read('components/PersonalizePage.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let optionsExpression
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(page) === 'editionOptions') optionsExpression = node.initializer.getText(page)
  ts.forEachChild(node, visit)
}
visit(page)
optionsExpression = ts.transpileModule(`(${optionsExpression})`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText
const price = (type, list, sale, percent) => pricing.packagePriceRowToModel({ package_type: type, list_price_usd: list, sale_price_usd: sale, display_discount_percent: percent, row_version: 1 })
const book = () => ({ packagePricing: { basic: price('basic', 49, 39, 20), supreme: price('supreme', 149, 89, 37) } })
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
const text = node => node == null ? '' : typeof node !== 'object' ? String(node) : [node.props?.children].flat(Infinity).map(text).join('')

function harness() {
  const states = [], changes = []
  let cursor = 0
  const Panel = load('components/personalize/PreviewPurchasePanel.tsx', {
    memo: component => component, useCallback: fn => fn, startTransition: fn => fn(),
    useState(initial) {
      const index = cursor++
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
      return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next }]
    },
  }).PreviewPurchasePanel
  return {
    changes,
    render(book, currency = 'USD') {
      cursor = 0
      const options = vm.runInNewContext(optionsExpression, { book, getBookPackagePrice: pricing.getBookPackagePrice, t: key => key })
      const tree = Panel({ value: 'basic', options, currency, title: 'Book Type', editionError: null, isSavingEdition: false, actions: null, onChange: async type => { changes.push(type) } })
      return { options, tree, labels: nodes(tree).filter(n => n.type === 'label') }
    },
  }
}

test('both Preview options retain their full Catalog model, including the display-percent override', () => {
  const b = book(), view = harness().render(b)
  assert.equal(view.options[0].price, b.packagePricing.basic)
  assert.equal(view.options[1].price, b.packagePricing.supreme)
  assert.deepEqual(view.labels.map(label => nodes(label).filter(n => n.type === 's').map(text)), [['$49.00'], ['$149.00']])
  assert.ok(text(view.labels[0]).includes('$39.00'))
  assert.ok(text(view.labels[0]).includes('-20%'))
  assert.ok(text(view.labels[1]).includes('$89.00'))
  assert.ok(text(view.labels[1]).includes('-37%'))
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
  assert.ok(text(view.labels[1]).includes('-34%'))
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
