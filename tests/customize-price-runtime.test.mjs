import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
function load(file) {
  const fixtureModule = { exports: {} }
  const jsx = (type, props) => ({ type, props })
  vm.runInNewContext(ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    module: fixtureModule, exports: fixtureModule.exports,
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === 'react') return {
        memo: component => component, useEffect: () => {}, useId: () => 'fixture-id',
        useRef: () => ({ current: null }), useState: initial => [initial, () => {}],
      }
      return new Proxy({}, { get: (_, key) => key })
    },
  })
  return fixtureModule.exports
}
const intro = load('components/personalize/PersonalizeProductIntro.tsx').PersonalizeProductIntro
const pricing = load('src/lib/package-pricing.ts')
const props = { eyebrow: 'Personalized', title: 'Story', description: 'A story', facts: [], fromLabel: 'From', ctaLabel: 'Personalize', faqHeading: 'About', faqItems: [], onStart() {} }
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
const text = node => node == null ? '' : typeof node !== 'object' ? String(node) : [node.props?.children].flat(Infinity).map(text).join('')

test('discounted intro shows sale, crossed-out original and Admin display percentage', () => {
  const tree = intro({ ...props, priceLabel: '$39', compareAtPriceLabel: '$49', discountPercent: 20 })
  assert.deepEqual(nodes(tree).filter(n => n.type === 's').map(text), ['$49'])
  assert.equal(nodes(tree).filter(n => n.type === 'p' && text(n) === '$39').length, 1)
  assert.equal(nodes(tree).filter(n => n.type === 'span' && text(n) === '-20%').length, 1)
})

test('no-discount intro has one normal price and no original or discount badge', () => {
  const tree = intro({ ...props, priceLabel: 'JPY 5,811', discountPercent: 20 })
  assert.equal(nodes(tree).filter(n => n.type === 's').length, 0)
  assert.equal(nodes(tree).filter(n => n.type === 'p' && text(n) === 'JPY 5,811').length, 1)
  assert.equal(nodes(tree).filter(n => n.type === 'span' && text(n).includes('%')).length, 0)
})

test('starting price retains one complete edition, including original and override, across price orderings', () => {
  const page = ts.createSourceFile('page.tsx', read('components/PersonalizePage.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let expression
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(page) === 'fromPackagePrice') expression = node.initializer.getText(page)
    ts.forEachChild(node, visit)
  }
  visit(page)
  assert.ok(expression)
  const price = (type, list, sale, display) => pricing.packagePriceRowToModel({ package_type: type, list_price_usd: list, sale_price_usd: sale, display_discount_percent: display, row_version: 1 })
  for (const [basic, supreme, expected] of [
    [price('basic', 49, 39, 20), price('supreme', 149, 89), 'basic'],
    [price('basic', 49, null), price('supreme', 149, 35, 75), 'supreme'],
    [price('basic', 49, null), price('supreme', 149, null), 'basic'],
    [price('basic', 49, 39), price('supreme', 149, 39), 'basic'],
  ]) {
    const book = { packagePricing: { basic, supreme } }
    const result = vm.runInNewContext(expression, { book, getBookPackagePrice: pricing.getBookPackagePrice })
    assert.equal(result, book.packagePricing[expected])
  }
})
