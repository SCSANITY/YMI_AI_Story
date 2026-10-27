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
function load(file, dependencies = {}) {
  const fixtureModule = { exports: {} }
  vm.runInNewContext(ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    module: fixtureModule, exports: fixtureModule.exports,
    require: name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name),
  })
  return fixtureModule.exports
}
const { getUiMessage } = load('src/lib/i18n-messages.ts')
const { ProductFaqAnswer } = load('components/personalize/ProductFaqAnswer.tsx')
const source = ts.createSourceFile('page.tsx', read('components/PersonalizePage.tsx'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
let faqExpression
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'bookFaqItems') faqExpression = node.initializer.getText(source)
  ts.forEachChild(node, visit)
}
visit(source)
assert.ok(faqExpression)
const items = vm.runInNewContext(faqExpression, { useMemo: fn => fn(), t: getUiMessage })
const render = answer => renderToStaticMarkup(React.createElement(ProductFaqAnswer, { id: 'answer', text: answer }))

test('shared FAQ keeps the original questions and puts the new Voice question first', () => {
  assert.deepEqual(Array.from(items, item => item.question), [
    'What makes the Voice Edition special?',
    'What is the book format and quality like?',
    'What do I need before generating the preview?',
    'Can I still change details after I see the preview?',
  ])
  const voice = render(items[0].answer)
  assert.equal((voice.match(/<li>/g) ?? []).length, 7)
  assert.match(voice, /<strong[^>]*>plus a personalised voice experience<\/strong>/)
  assert.match(voice, /<strong[^>]*>LIVE Record Button<\/strong>/)
  assert.match(voice, /<strong[^>]*>Your voice\. Your child\. Their story\.<\/strong> ❤️/)
  assert.match(voice, /Update or replace recordings anytime, by connecting the book to a computer with the Type-C cable\./)
  assert.ok(!voice.includes('**'))
})

test('specifications are a six-item list, while the short answers keep their emphasis and paragraphs', () => {
  const format = render(items[1].answer)
  assert.equal((format.match(/<li>/g) ?? []).length, 6)
  for (const value of ['20 × 20 cm', '32–40 pages', 'Approx. 450 g', 'Premium hardcover', 'Matte lamination', 'Vibrant full-colour illustrations', 'Voice Edition:']) {
    assert.ok(format.includes(`>${value}</strong>`), value)
  }
  const prepare = render(items[2].answer)
  assert.equal((prepare.match(/<p>/g) ?? []).length, 2)
  assert.match(prepare, />before you decide to purchase\.<\/strong>/)
  assert.match(render(items[3].answer), />Yes! Feel free to make changes\.<\/strong>/)
  assert.ok(!format.includes('<p><ul'))
  assert.ok(!render('<img src=x onerror=alert(1)>').includes('<img'))
})

test('all four accordion buttons open one correctly labelled answer and can close it again', () => {
  const values = []
  let cursor = 0
  const jsx = (type, props) => ({ type, props })
  const hooks = {
    memo: component => component, useEffect() {}, useId: () => 'faq-fixture', useRef: () => ({ current: null }),
    useState(initial) {
      const index = cursor++
      if (!(index in values)) values[index] = initial
      return [values[index], value => { values[index] = typeof value === 'function' ? value(values[index]) : value }]
    },
  }
  const { PersonalizeProductIntro } = load('components/personalize/PersonalizeProductIntro.tsx', {
    react: hooks, 'react/jsx-runtime': { jsx, jsxs: jsx },
    'lucide-react': new Proxy({}, { get: (_, name) => name }),
    '@/components/Button': { Button: 'Button' }, './product/presentation': {}, './ProductFaqAnswer': { ProductFaqAnswer },
  })
  const props = { eyebrow: 'Personalized', title: 'Story', description: 'Intro', facts: [], fromLabel: 'From', priceLabel: '$39', ctaLabel: 'Personalize', faqHeading: 'About', faqItems: items, onStart() {} }
  const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
  const draw = () => { cursor = 0; return nodes(PersonalizeProductIntro(props)) }
  const buttons = tree => tree.filter(node => node.type === 'button' && node.props['aria-controls']?.startsWith('product-faq-'))
  assert.equal(buttons(draw()).length, 4)
  assert.equal(draw().filter(node => node.type === ProductFaqAnswer).length, 0)
  for (let index = 0; index < 4; index++) {
    buttons(draw())[index].props.onClick()
    const tree = draw()
    assert.equal(buttons(tree).filter(node => node.props['aria-expanded']).length, 1)
    const answers = tree.filter(node => node.type === ProductFaqAnswer)
    assert.equal(answers.length, 1)
    assert.equal(answers[0].props.id, `product-faq-${index}`)
    assert.equal(answers[0].props.text, items[index].answer)
  }
  buttons(draw())[3].props.onClick()
  assert.equal(draw().filter(node => node.type === ProductFaqAnswer).length, 0)
})
