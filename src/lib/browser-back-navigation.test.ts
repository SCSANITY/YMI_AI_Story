import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveBrowserBackAction } from './browser-back-navigation'

test('ordinary Back uses browser history and falls back to Home for a direct entry', () => {
  assert.deepEqual(resolveBrowserBackAction({ browserTranslated: false, historyLength: 3 }), {
    method: 'history',
  })
  assert.deepEqual(resolveBrowserBackAction({ browserTranslated: false, historyLength: 1 }), {
    method: 'assign',
    href: '/',
  })
})

test('translated Back uses a full navigation when the previous browser entry is visible', () => {
  assert.deepEqual(resolveBrowserBackAction({
    browserTranslated: true,
    historyLength: 3,
    previousHistoryUrl: 'https://www.ymistory.com/books?gender=Girl',
  }), {
    method: 'assign',
    href: 'https://www.ymistory.com/books?gender=Girl',
  })
})

test('translated Back fails safely when browser history does not expose a usable URL', () => {
  assert.deepEqual(resolveBrowserBackAction({
    browserTranslated: true,
    historyLength: 3,
    previousHistoryUrl: 'javascript:alert(1)',
  }), {
    method: 'assign',
    href: '/',
  })
})
