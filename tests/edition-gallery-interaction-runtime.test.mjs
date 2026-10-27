import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const read = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const jsx = (type, props) => ({ type, props })
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
function compile(file, dependencies, globals = {}) {
  const mod = { exports: {} }
  vm.runInNewContext(ts.transpileModule(read(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { module: mod, exports: mod.exports, require: name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name), ...globals })
  return mod.exports
}
const definitions = compile('components/personalize/product/edition-definitions.ts', {
  'lucide-react': new Proxy({}, { get: (_, name) => name }),
})
const messages = compile('src/lib/i18n-messages.ts', {})

function fixture() {
  let now = 0, nextId = 1, cursor = 0, dirty = false, currentObserver, tree
  const hooks = [], effects = [], timers = new Map(), listeners = new Map(), cards = new Map()
  const media = { reduced: { matches: false, addEventListener() {}, removeEventListener() {} }, hover: { matches: false } }
  const document = { hidden: false, activeElement: null, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) }
  const react = {
    useState(initial) {
      const i = cursor++
      if (!hooks[i]) hooks[i] = { value: initial }
      return [hooks[i].value, value => { hooks[i].value = typeof value === 'function' ? value(hooks[i].value) : value; dirty = true }]
    },
    useRef(initial) { const i = cursor++; return hooks[i] ??= { current: initial } },
    useEffect(fn, deps) {
      const i = cursor++, old = hooks[i]
      if (!old || deps.some((value, j) => value !== old.deps[j])) effects.push(() => { old?.cleanup?.(); hooks[i] = { deps, cleanup: fn() } })
    },
  }
  class Observer {
    entries = []
    constructor(callback) { this.callback = callback; currentObserver = { callback, entries: this.entries } }
    observe(card) { this.entries.push({ target: card, isIntersecting: true }) }
    disconnect() {}
  }
  const Cards = compile('components/personalize/product/EditionCards.tsx', {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx }, 'next/image': { default: 'img' },
    'next/dynamic': { default: () => 'EditionImageViewer' },
    'lucide-react': { ZoomIn: 'ZoomIn' }, '@/lib/i18n-messages': messages,
    './edition-definitions': definitions, './EditionPrice': { EditionPrice: 'EditionPrice' },
    './ProductSections.module.css': { default: new Proxy({}, { get: (_, key) => key }) },
  }, {
    Date: class extends Date { static now() { return now } }, document,
    window: { matchMedia: query => query.includes('reduced') ? media.reduced : media.hover },
    IntersectionObserver: Observer,
    setTimeout: (fn, ms) => { const id = nextId++; timers.set(id, { at: now + ms, fn }); return id },
    clearTimeout: id => timers.delete(id),
  }).default
  function render() {
    cursor = 0; dirty = false
    tree = Cards({ pricing: { basic: {}, supreme: {} }, currency: 'USD' })
    for (const article of nodes(tree).filter(n => n.type === 'article')) {
      const type = article.props['data-edition']
      if (!cards.has(type)) cards.set(type, {
        hover: false, getAttribute: () => type, getClientRects: () => [1],
        matches() { return this.hover }, contains(element) { return element === this },
      })
      article.props.ref(cards.get(type))
    }
    for (const effect of effects.splice(0)) { effect(); currentObserver.callback(currentObserver.entries) }
  }
  function advance(ms) {
    const end = now + ms
    let steps = 0
    for (;;) {
      const due = [...timers.entries()].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
      if (!due) break
      assert.ok(++steps < 1000, 'timer must not spin')
      now = due[1].at; timers.delete(due[0]); due[1].fn()
      if (dirty) render()
      assert.ok(timers.size <= 1, 'one shared timer only')
    }
    now = end
  }
  const article = type => nodes(tree).find(n => n.type === 'article' && n.props['data-edition'] === type)
  const image = type => nodes(article(type)).find(n => n.type === 'img' && n.props.fill).props.src
  const select = (type, index) => { nodes(article(type)).filter(n => n.type === 'button' && n.props['aria-pressed'] !== undefined)[index].props.onClick(); render() }
  const open = type => { nodes(article(type)).find(n => n.type === 'button' && n.props['aria-haspopup'] === 'dialog').props.onClick(); render() }
  const viewer = () => nodes(tree).find(n => n.type === 'EditionImageViewer')
  render()
  return { advance, image, select, open, viewer, render, timers, cards, media, document,
    dispose() { for (const cell of hooks) cell?.cleanup?.() },
    listenerCount: () => listeners.size,
    visibility(hidden) { document.hidden = hidden; listeners.get('visibilitychange')() },
    visible(value) { currentObserver.callback([...cards.values()].map(target => ({ target, isIntersecting: value }))) },
  }
}

test('manual selection owns a full ten seconds; repeated selection resets it, then four-second autoplay resumes', () => {
  const f = fixture()
  f.advance(4000)
  assert.match(f.image('supreme'), /c-voice-02/)
  f.select('supreme', 4)
  f.advance(9000)
  assert.match(f.image('supreme'), /c-voice-05/)
  f.select('supreme', 2)
  f.advance(9999)
  assert.match(f.image('supreme'), /c-voice-03/)
  f.advance(1)
  assert.match(f.image('supreme'), /c-voice-04/)
  f.advance(3999)
  assert.match(f.image('supreme'), /c-voice-04/)
  f.advance(1)
  assert.match(f.image('supreme'), /c-voice-05/)
})

test('manual hold is per edition, with no extra scheduler', () => {
  const f = fixture()
  f.select('supreme', 4)
  f.advance(4000)
  assert.match(f.image('basic'), /c-hardcover-02/)
  assert.match(f.image('supreme'), /c-voice-05/)
  assert.equal(f.timers.size, 1)
})

test('enlarged viewer freezes both galleries; close preserves the final image and starts a fresh ten seconds', () => {
  const f = fixture()
  assert.equal(f.viewer(), undefined)
  f.select('supreme', 3); f.open('supreme')
  assert.equal(f.viewer().props.index, 3)
  assert.equal(f.timers.size, 0)
  f.advance(60000)
  assert.match(f.image('basic'), /c-hardcover-01/)
  assert.match(f.image('supreme'), /c-voice-04/)
  f.viewer().props.onSelect(1); f.render()
  f.viewer().props.onClose(); f.render()
  assert.equal(f.viewer(), undefined)
  f.advance(9999)
  assert.match(f.image('supreme'), /c-voice-02/)
  f.advance(1)
  assert.match(f.image('supreme'), /c-voice-03/)
})

test('background/offscreen/reduced-motion stop the timer; return does not burst through missed frames', () => {
  const f = fixture()
  f.visibility(true); assert.equal(f.timers.size, 0)
  f.advance(60000); f.visibility(false); f.advance(3999)
  assert.match(f.image('basic'), /c-hardcover-01/)
  f.advance(1); assert.match(f.image('basic'), /c-hardcover-02/)
  f.visible(false); assert.equal(f.timers.size, 0)
  f.advance(60000); f.visible(true); f.advance(4000)
  assert.match(f.image('basic'), /c-hardcover-03/)
  f.media.reduced.matches = true; f.visibility(false)
  assert.equal(f.timers.size, 0)
})

test('existing fine-pointer hover and keyboard focus still pause their card', () => {
  const f = fixture()
  f.media.hover.matches = true; f.cards.get('basic').hover = true
  f.advance(4000)
  assert.match(f.image('basic'), /c-hardcover-01/)
  assert.match(f.image('supreme'), /c-voice-02/)
  f.cards.get('basic').hover = false
  const focus = f.cards.get('supreme'); focus.matches = () => true
  f.document.activeElement = focus
  f.advance(4000)
  assert.match(f.image('basic'), /c-hardcover-02/)
  assert.match(f.image('supreme'), /c-voice-02/)
})

test('leaving the section clears its timer and visibility subscription', () => {
  const f = fixture()
  assert.equal(f.timers.size, 1)
  assert.equal(f.listenerCount(), 1)
  f.dispose()
  assert.equal(f.timers.size, 0)
  assert.equal(f.listenerCount(), 0)
})
