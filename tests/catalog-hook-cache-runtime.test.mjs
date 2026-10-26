import assert from 'node:assert/strict'
import test from 'node:test'
import { loadUi } from './helpers/preview-uiux-harness.mjs'

test('Catalog manual retry uses the canonical ISR URL and preserves loading,error and success states', async () => {
  const states = [], effects = [], requests = []
  let cursor = 0, effectIndex = 0, fail = true
  const react = {
    useState(initial) {
      const i = cursor++
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial
      return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value }]
    },
    useCallback: fn => fn,
    useMemo: fn => fn(),
    useEffect(fn, deps) {
      const i = effectIndex++, old = effects[i]
      if (!old || deps.some((value, n) => value !== old.deps[n])) {
        effects[i] = { fn, deps, cleanup: old?.cleanup, pending: true }
      }
    },
  }
  const catalog = loadUi('components/useBookCatalog.ts', { react }, {
    fetch: async (url, options) => {
      requests.push({ url, credentials: options.credentials })
      return fail ? Response.json({ error: 'Temporary failure' }, { status: 500 })
        : Response.json({ templates: [{ bookID: 'DB_story', price: 51 }] })
    },
  })
  const render = () => {
    cursor = 0; effectIndex = 0
    const view = catalog.useBookCatalog()
    for (const effect of effects) if (effect.pending) {
      effect.pending = false; effect.cleanup?.(); effect.cleanup = effect.fn()
    }
    return view
  }
  const settle = () => new Promise(resolve => setImmediate(resolve))
  catalog.invalidateBookCatalogClientCache()
  assert.equal(render().isLoading, true)
  await settle()
  let view = render()
  assert.equal(view.error, 'Temporary failure')
  assert.equal(view.hasResolved, true)
  fail = false; view.retry()
  assert.equal(render().isLoading, true)
  await settle()
  view = render()
  assert.equal(view.error, null)
  assert.equal(view.isLoading, false)
  assert.equal(view.books[0].price, 51)
  render(); await settle()
  assert.equal(requests.length, 2, 'a normal rerender does not fetch again')
  assert.deepEqual(requests, Array.from({ length: 2 }, () => ({ url: '/api/templates', credentials: 'same-origin' })))
  effects.forEach(effect => effect.cleanup?.())
})
