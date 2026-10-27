import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const css = new Proxy({}, { get: (_, key) => String(key) })
function load(file, dependencies = {}, globals = {}, append = '') {
  const mod = { exports: {} }
  vm.runInNewContext(ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText + append, {
    module: mod, exports: mod.exports, ...globals,
    require: name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name),
  })
  return mod.exports
}
const messages = load('src/lib/i18n-messages.ts')
const { default: Comparison } = load('components/personalize/product/EditionComparison.tsx', {
  '@/lib/i18n-messages': messages, './EditionComparison.module.css': { default: css },
})
const expectedRows = [
  'Personalised child character', 'Exquisite full-color illustrations', 'Premium hardcover binding',
  'Protective matte lamination', 'Optional personal message', 'Signature Voice narration',
  'Audio on every page', 'Full book reading', 'LIVE Record Button', 'Special for You Button',
  'Built-in speaker &amp; microphone', 'Update recordings via Type-C',
]

test('native comparison renders the exact approved content and inclusion matrix', () => {
  const html = renderToStaticMarkup(React.createElement(Comparison))
  assert.equal((html.match(/<table /g) ?? []).length, 1)
  assert.equal((html.match(/<colgroup>/g) ?? []).length, 1)
  assert.equal((html.match(/<thead>/g) ?? []).length, 1)
  assert.equal((html.match(/<tbody>/g) ?? []).length, 2)
  assert.equal((html.match(/scope="col"/g) ?? []).length, 3)
  assert.equal((html.match(/scope="rowgroup"/g) ?? []).length, 2)
  const labels = Array.from(html.matchAll(/<th scope="row"[^>]*>(.*?)<\/th>/g), m => m[1])
  assert.deepEqual(labels, expectedRows)
  assert.equal((html.match(/>Included<\/span>/g) ?? []).length, 17)
  assert.equal((html.match(/>Not included<\/span>/g) ?? []).length, 7)
  const bodies = html.match(/<tbody>[\s\S]*?<\/tbody>/g)
  assert.equal((bodies[0].match(/>Not included<\/span>/g) ?? []).length, 0)
  assert.equal((bodies[1].match(/>Not included<\/span>/g) ?? []).length, 7)
  assert.match(html, /What&#x27;s inside <em>each edition\.<\/em>/)
  assert.match(html, /Hardcover <em>\+ Voice<\/em>/)
  assert.doesNotMatch(html, /<button|<input|<a\b|<img|<audio|<video|<canvas|role="table"/)
})

test('headers stay associated with each value, and multiple instances have unique IDs', () => {
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
    React.createElement(Comparison), React.createElement(Comparison)))
  const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), m => m[1])
  assert.equal(new Set(ids).size, ids.length)
  for (const match of html.matchAll(/\b(?:aria-labelledby|headers)="([^"]+)"/g)) {
    for (const id of match[1].split(' ')) assert.ok(ids.includes(id), id)
  }
  assert.equal((html.match(/class="pillar" aria-hidden="true"/g) ?? []).length, 2)
  assert.equal((html.match(/<td headers="[^"]+"/g) ?? []).length, 48)
})

const jsx = (type, props) => ({ type, props })
const nodeList = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodeList)]

test('the new comparison owns one lazy slot between editions and ending, with the same boundary', () => {
  const state = []
  let cursor = 0
  let observer
  let effect
  let disconnected = 0
  const hooks = {
    useRef: () => ({ current: {} }),
    useState: initial => { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], v => { state[i] = v }] },
    useEffect: fn => { effect = fn },
  }
  class IntersectionObserver {
    constructor(callback, options) { observer = { callback, options }; }
    observe() {}
    disconnect() { disconnected++ }
  }
  const boundary = 'ProductSectionBoundary'
  const { default: Sections, NearViewport } = load('components/personalize/product/ProductSections.tsx', {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/dynamic': { default: loader => loader.toString().match(/\.\/(\w+)/)[1] },
    'next/font/google': { Playfair_Display: () => ({ variable: 'font-italic' }) },
    './ProductSections.module.css': { default: css }, './ProductSectionBoundary': { ProductSectionBoundary: boundary },
  }, { IntersectionObserver }, '\nmodule.exports.NearViewport = NearViewport;')
  const tree = Sections({ pricing: {}, currency: 'USD', onStart() {} })
  const slots = nodeList(tree).filter(n => n.type === NearViewport)
  assert.deepEqual(Array.from(slots, n => n.props.children.type), ['HowItWorks', 'SignatureVoiceDemo', 'EditionCards', 'EditionComparison', 'ProductEnding'])
  const comparison = slots[3]
  assert.equal(comparison.props.className, 'comparisonSlot')
  const draw = () => { cursor = 0; return NearViewport(comparison.props) }
  let result = draw()
  assert.equal(result.props.children.type, boundary)
  assert.equal(result.props.children.props.children, null)
  const cleanup = effect()
  assert.equal(observer.options.rootMargin, '600px 0px')
  observer.callback([{ isIntersecting: true }])
  result = draw()
  assert.equal(result.props.children.props.children.type, 'EditionComparison')
  assert.equal(disconnected, 1)
  cleanup()
  assert.equal(disconnected, 2)
})
