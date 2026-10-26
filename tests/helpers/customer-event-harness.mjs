import { loadUi } from './preview-uiux-harness.mjs'

// Execute actual component bodies with dependency-scoped effects and a virtual
// browser clock. Fetch is always supplied by each test; no network is available.
export function customerRuntime() {
  const cells = [], effects = [], timers = new Map()
  let cursor = 0, dirty = false, mounted = false, component, props, tree, now = 0, serial = 0, lateWrites = 0
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]))
  const eventTarget = () => {
    const listeners = new Map()
    return {
      addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn) },
      removeEventListener(type, fn) { listeners.get(type)?.delete(fn) },
      dispatch(type, extra = {}) { for (const fn of [...(listeners.get(type) ?? [])]) fn({ type, ...extra }) },
      listenerCount(type) { return listeners.get(type)?.size ?? 0 },
    }
  }
  const addTimer = (fn, delay, interval) => {
    const id = ++serial
    timers.set(id, { fn, at: now + Math.max(1, Number(delay) || 0), interval })
    return id
  }
  const timerApi = {
    setTimeout: (fn, delay) => addTimer(fn, delay, 0),
    clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => addTimer(fn, delay, Math.max(1, Number(delay) || 0)),
    clearInterval: id => timers.delete(id),
  }
  const store = new Map([['ymi_first_visit', '1']])
  const localStorage = { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, String(value)), removeItem: key => store.delete(key) }
  const navigations = []
  const window = { ...eventTarget(), ...timerApi, innerWidth: 393, localStorage,
    location: { pathname: '/', search: '', origin: 'https://fixture.test', assign: url => navigations.push(url), reload() {} } }
  const document = { ...eventTarget(), cookie: '', visibilityState: 'visible', documentElement: { setAttribute() {} } }
  const react = {
    createContext: () => ({ Provider: ({ children }) => children }),
    useState(initial) {
      const i = cursor++
      if (!cells[i]) cells[i] = { value: typeof initial === 'function' ? initial() : initial }
      return [cells[i].value, next => {
        if (!mounted) lateWrites++
        const value = typeof next === 'function' ? next(cells[i].value) : next
        if (!Object.is(value, cells[i].value)) { cells[i].value = value; dirty = true }
      }]
    },
    useRef(initial) { const i = cursor++; return (cells[i] ??= { value: { current: initial } }).value },
    useMemo(fn, deps) {
      const i = cursor++
      if (!cells[i] || !same(cells[i].deps, deps)) cells[i] = { value: fn(), deps }
      return cells[i].value
    },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps) },
    useEffect(fn, deps) {
      const i = cursor++, old = effects[i]
      if (!old || !same(old.deps, deps)) effects[i] = { fn, deps, cleanup: old?.cleanup, pending: true }
    },
  }
  react.useLayoutEffect = react.useEffect
  const render = () => {
    if (!mounted) return tree
    let count = 0
    do {
      dirty = false; cursor = 0; tree = component(props)
      const pending = effects.filter(effect => effect?.pending)
      pending.forEach(effect => { effect.pending = false; effect.cleanup?.() })
      pending.forEach(effect => { effect.cleanup = effect.fn() })
      if (++count > 50) throw Error('Fixture render loop')
    } while (dirty)
    return tree
  }
  return {
    window, document, localStorage, navigations, timers,
    load(file, stubs, globals) {
      return loadUi(file, { react: { __esModule: true, default: react, ...react }, ...stubs }, {
        window, document, localStorage, FormData, URL, URLSearchParams, process: { env: {} },
        Image: class { decode() { return Promise.resolve() } },
        ...timerApi, Date: class extends Date { static now() { return now } }, ...globals,
      })
    },
    react,
    mount(fn, initialProps) { component = fn; props = initialProps; mounted = true; return render() },
    render,
    update(nextProps) { props = nextProps; return render() },
    async flush() { for (let i = 0; i < 8; i++) { await new Promise(resolve => setImmediate(resolve)); render() } return tree },
    advance(ms) {
      const end = now + ms
      let count = 0
      while (true) {
        const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0]
        if (!next) break
        const [id, timer] = next
        now = timer.at
        if (timer.interval) timer.at += timer.interval; else timers.delete(id)
        timer.fn(); render()
        if (++count > 5000) throw Error('Fixture timer loop')
      }
      now = end; return render()
    },
    unmount() { mounted = false; effects.forEach(effect => effect?.cleanup?.()) },
    get tree() { return tree },
    get lateWrites() { return lateWrites },
  }
}

export function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
