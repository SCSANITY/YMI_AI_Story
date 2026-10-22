import assert from 'node:assert/strict'
import test from 'node:test'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

function harness(file, dependencies = {}) {
  let cursor = 0
  const states = [], effects = []
  const react = {
    useState(initial) {
      const index = cursor++
      if (!(index in states)) states[index] = initial
      return [states[index], value => { states[index] = value }]
    },
    useEffect: fn => effects.push(fn),
  }
  const fixtureModule = { exports: {} }
  const jsx = (type, props) => ({ type, props })
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, {
    module: fixtureModule, exports: fixtureModule.exports, AbortController,
    require(name) {
      if (name === 'react') return react
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx, Fragment: 'fragment' }
      if (name === 'next/dynamic') return () => 'PublishedPolicyDialog'
      if (name === '@/lib/useI18n') return { useI18n: () => ({ t: key => key }) }
      if (name === './PolicyDialog') return { PolicyDialog: 'PolicyDialog' }
      if (name in dependencies) return dependencies[name]
      throw new Error(`Unexpected dependency ${name}`)
    },
  })
  return {
    effects,
    render(name, props) { cursor = 0; return fixtureModule.exports[name](props) },
  }
}

test('a policy reference is an in-page button; opening prevents consent-label activation and closing preserves it', () => {
  const h = harness('components/legal/PolicyReference.tsx')
  const props = { children: 'Privacy Policy' }
  let tree = h.render('PolicyReference', props)
  assert.equal(tree.props.children[0].type, 'button')
  assert.equal(tree.props.children[0].props.type, 'button')
  assert.equal(tree.props.children[0].props.href, undefined)
  assert.equal(tree.props.children[1], null)
  const calls = []
  tree.props.children[0].props.onClick({ preventDefault: () => calls.push('prevent'), stopPropagation: () => calls.push('stop'), currentTarget: { focus: () => calls.push('focus') } })
  tree = h.render('PolicyReference', props)
  assert.deepEqual(calls, ['prevent', 'stop', 'focus'])
  assert.equal(tree.props.children[0].props['aria-expanded'], true)
  assert.equal(tree.props.children[1].props.documentKey, 'privacy')
  tree.props.children[1].props.onClose()
  assert.equal(h.render('PolicyReference', props).props.children[1], null)
})

function loaderHarness() {
  let fulfill, reject, signal, calls = 0
  const promise = new Promise((resolve, fail) => { fulfill = resolve; reject = fail })
  const h = harness('components/legal/PublishedPolicyDialog.tsx', {
    '@/lib/published-legal-content-client': { fetchPublishedLegalContentSnapshot: received => { calls++; signal = received; return promise } },
  })
  const props = { documentKey: 'privacy', onClose() {} }
  return { h, fulfill, reject, render: () => h.render('default', props), count: () => calls, signal: () => signal }
}

test('only mounting the dialog loads the published snapshot; the published title, date and sections are used', async () => {
  const f = loaderHarness()
  assert.equal(f.render().props.isLoading, true)
  assert.equal(f.count(), 0)
  const cleanup = f.h.effects[0]()
  assert.equal(f.count(), 1)
  const sections = [{ title: 'Published privacy', paragraphs: [{ text: 'Published bytes' }] }]
  f.fulfill({ documents: { privacy: { title: 'Privacy Policy', effectiveDate: 'October 22, 2026' } }, footerContent: { privacy: sections } })
  await Promise.resolve(); await Promise.resolve()
  const view = f.render()
  assert.equal(view.props.sections, sections)
  assert.equal(view.props.title, 'Privacy Policy')
  assert.equal(view.props.effectiveDate, 'October 22, 2026')
  assert.equal(view.props.isLoading, false)
  cleanup()
  assert.equal(f.signal().aborted, true)
})

test('closing during loading aborts the read and ignores a late response', async () => {
  const f = loaderHarness()
  f.render()
  const cleanup = f.h.effects[0]()
  cleanup()
  f.fulfill({ documents: { privacy: { title: 'Late result' } }, footerContent: { privacy: [] } })
  await Promise.resolve(); await Promise.resolve()
  assert.equal(f.signal().aborted, true)
  assert.equal(f.render().props.isLoading, true)
})

test('a failed read stays in the closable dialog without substituting stale policy text', async () => {
  const f = loaderHarness()
  f.render()
  const cleanup = f.h.effects[0]()
  f.reject(new Error('Synthetic unavailable'))
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  const view = f.render()
  assert.equal(view.props.isLoading, false)
  assert.ok(view.props.error)
  assert.equal(view.props.sections.length, 0)
  assert.equal(typeof view.props.onClose, 'function')
  cleanup()
})
