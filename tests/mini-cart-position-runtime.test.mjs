import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Execute the real component with a held animation-frame queue. Layout effects
// may update state, but no frame can hide an incorrect first-paint coordinate.
function harness(viewport = 1440, right = 1320, bottom = 56) {
  let stateIndex = 0, nextFrame = 1, layout, cleanup
  const states = [], frames = new Map(), listeners = new Map()
  const rect = { right, bottom }
  const anchorRef = { current: { getBoundingClientRect: () => rect } }
  const react = {
    memo: component => component,
    useRef: () => ({ current: null }),
    useMemo: fn => fn(),
    useEffect: () => {},
    useLayoutEffect: fn => { layout = fn },
    useState(initial) {
      const index = stateIndex++
      if (!(index in states)) states[index] = initial
      return [states[index], value => { states[index] = value }]
    },
  }
  const window = {
    innerWidth: viewport,
    requestAnimationFrame(fn) { const id = nextFrame++; frames.set(id, fn); return id },
    cancelAnimationFrame(id) { frames.delete(id) },
    addEventListener(name, fn, capture) { listeners.set(name, { fn, capture }) },
    removeEventListener(name, fn, capture) {
      const listener = listeners.get(name)
      if (listener?.fn === fn && listener.capture === capture) listeners.delete(name)
    },
  }
  const jsx = (type, props) => ({ type, props })
  const fixtureModule = { exports: {} }
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../components/cart/MiniCart.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, {
    module: fixtureModule, exports: fixtureModule.exports, window, document: { body: {} },
    require(name) {
      if (name === 'react') return react
      if (name === 'react-dom') return { createPortal: value => value }
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx }
      if (name === '@/lib/useI18n') return { useI18n: () => ({ t: key => key }) }
      if (name === '@/lib/locale-pricing') return { formatDisplayCurrency: value => String(value) }
      return new Proxy({}, { get: (_, key) => key })
    },
  })
  const render = (open = true) => {
    stateIndex = 0
    return fixtureModule.exports.MiniCart({ open, anchorRef, items: [], displayCurrency: 'USD', isHydrated: true })
  }
  const position = () => JSON.parse(JSON.stringify(render().props.style))
  return {
    window, rect, frames, listeners, render, position,
    open() { render(); cleanup = layout(); return position() },
    close() { cleanup?.(); render(false) },
    frame() { const queued = [...frames.values()]; frames.clear(); queued.forEach(fn => fn()) },
  }
}

test('desktop portal is anchored before any animation frame executes', () => {
  const h = harness()
  assert.deepEqual(h.open(), { left: 968, top: 64, width: 352 })
  assert.equal(h.frames.size, 0)
})

test('phone and narrow viewports keep their existing margins and width', () => {
  assert.deepEqual(harness(393, 360).open(), { left: 8, top: 64, width: 352 })
  assert.deepEqual(harness(300, 280).open(), { left: 8, top: 64, width: 284 })
})

test('desktop coordinates remain clamped to both viewport edges', () => {
  assert.equal(harness(1000, 1200).open().left, 640)
  assert.equal(harness(1000, 100).open().left, 8)
})

test('later resize and nested scroll updates still coalesce into one frame', () => {
  const h = harness(); h.open()
  h.window.innerWidth = 1000; h.rect.right = 900; h.rect.bottom = 70
  h.listeners.get('resize').fn(); h.listeners.get('scroll').fn()
  assert.equal(h.listeners.get('scroll').capture, true)
  assert.equal(h.frames.size, 1)
  assert.equal(h.position().left, 968)
  h.frame()
  assert.deepEqual(h.position(), { left: 548, top: 78, width: 352 })
})

test('closing cancels queued positioning and removes both listeners', () => {
  const h = harness(); h.open(); h.listeners.get('resize').fn(); h.close()
  assert.equal(h.frames.size, 0)
  assert.equal(h.listeners.size, 0)
  assert.equal(h.render(false), null)
})

test('reopening after moving the anchor positions immediately again', () => {
  const h = harness(); h.open(); h.close(); h.rect.right = 1000
  assert.deepEqual(h.open(), { left: 648, top: 64, width: 352 })
  assert.equal(h.frames.size, 0)
})
