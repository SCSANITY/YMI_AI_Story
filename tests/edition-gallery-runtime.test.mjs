import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import ts from 'typescript'

const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const jsx = (type, props) => ({ type, props })
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
const text = node => node == null ? '' : typeof node !== 'object' ? String(node) : [node.props?.children].flat(Infinity).map(text).join('')
function load(file, react) {
  const mod = { exports: {} }
  vm.runInNewContext(ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    module: mod, exports: mod.exports,
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === 'react') return react
      if (name === 'next/image') return { default: 'img' }
      if (name === 'next/dynamic') return { default: () => 'EditionImageViewer' }
      if (name.endsWith('.module.css')) return { default: new Proxy({}, { get: (_, key) => key }) }
      if (name.startsWith('@/lib/')) return load(`src/lib/${name.split('/').at(-1)}.ts`)
      if (name.startsWith('./')) return load(`components/personalize/product/${name.slice(2)}${name.endsWith('definitions') ? '.ts' : '.tsx'}`, react)
      if (name === 'lucide-react') return new Proxy({}, { get: (_, key) => key })
      throw new Error(`Unexpected dependency: ${name}`)
    },
  })
  return mod.exports
}
const definitions = load('components/personalize/product/edition-definitions.ts')
const { packagePriceRowToModel } = load('src/lib/package-pricing.ts')
const price = (type, list, sale, percent) => packagePriceRowToModel({ package_type: type, list_price_usd: list, sale_price_usd: sale, display_discount_percent: percent, row_version: 1 })

test('shared galleries keep five C images; details may append the single feature comparison', () => {
  for (const edition of definitions.EDITION_DEFINITIONS) {
    assert.equal(edition.gallery.length, 5)
    assert.equal(edition.features.length, 3)
    for (const image of edition.gallery) assert.ok(readFileSync(new URL(`../public${image.src}`, import.meta.url)).length)
    const details = [...edition.gallery, definitions.EDITION_COMPARISON_IMAGE]
    assert.equal(details.length, 6)
    assert.equal(details.at(-1).src, '/customize-product/v2/c-compare-pointform.jpg')
  }
  assert.equal(definitions.EDITION_DEFINITIONS.flatMap(d => d.gallery).filter(i => i.src.includes('/v1/')).length, 9)
})

test('the two published replacements are the frozen owner-approved bytes', () => {
  for (const [name, digest] of [
    ['c-voice-05.jpg', 'b9346e4c27b23650e1d30e448ae191fccd353bccf5412c97c83580d09ed7ccc0'],
    ['c-compare-pointform.jpg', '2ec16a1d2b5cf01fbc72bc574b2f76686b879ef754057b5c4b379d0e7741fe5a'],
  ]) assert.equal(createHash('sha256').update(readFileSync(new URL(`../public/customize-product/v2/${name}`, import.meta.url))).digest('hex'), digest)
})

test('shared price uses Catalog discount override, changes currency, and removes absent sales', () => {
  const { EditionPrice } = load('components/personalize/product/EditionPrice.tsx')
  const sale = EditionPrice({ price: price('supreme', 149, 89, 37), currency: 'USD' })
  assert.ok(text(sale).includes('37%'))
  assert.ok(text(sale).includes('$149.00'))
  assert.ok(text(sale).includes('$89.00'))
  const regular = EditionPrice({ price: price('basic', 55, null), currency: 'JPY' })
  assert.equal(nodes(regular).filter(n => n.type === 's').length, 0)
  assert.ok(!text(regular).includes('%'))
  assert.ok(text(regular).includes(load('src/lib/locale-pricing.ts').formatDisplayCurrency(55, 'JPY')))
})

test('C selection renders new Voice frame five, independently of Hardcover, without adding comparison', () => {
  const states = []; let cursor = 0
  const react = {
    useEffect() {}, useRef: () => ({ current: {} }),
    useState(initial) {
      const index = cursor++
      if (!(index in states)) states[index] = initial
      return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next }]
    },
  }
  const Cards = load('components/personalize/product/EditionCards.tsx', react).default
  const render = () => { cursor = 0; return Cards({ pricing: { basic: price('basic', 49, 39, 20), supreme: price('supreme', 149, 89, 40) }, currency: 'USD' }) }
  const articles = tree => nodes(tree).filter(n => n.type === 'article')
  const initial = render()
  const voice = articles(initial)[1]
  const buttons = nodes(voice).filter(n => n.type === 'button' && n.props['aria-pressed'] !== undefined)
  assert.equal(buttons.length, 5)
  buttons[4].props.onClick()
  const updated = articles(render())
  assert.equal(nodes(updated[1]).find(n => n.props?.fill).props.src, '/customize-product/v2/c-voice-05.jpg')
  assert.equal(nodes(updated[0]).find(n => n.props?.fill).props.src, '/customize-product/v1/c-hardcover-01.jpg')
  assert.ok(!nodes(render()).some(n => n.props?.src === definitions.EDITION_COMPARISON_IMAGE.src))
})
