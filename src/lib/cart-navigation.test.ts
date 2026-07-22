import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildPreviewCartHref,
  resolveCartBackNavigation,
  resolvePreviewCartReturnPath,
} from './cart-navigation'

const creationId = '00000000-0000-4000-8000-000000000001'
const committedPreviewJobId = '00000000-0000-4000-8000-000000000002'
const validCartHref = buildPreviewCartHref({
  bookId: 'Explorer_story',
  creationId,
  committedPreviewJobId,
})
const validSearch = validCartHref.slice(validCartHref.indexOf('?'))
const expectedPreviewPath =
  `/personalize/Explorer_story?view=preview&creationId=${creationId}&jobId=${committedPreviewJobId}`

test('builder emits structured Preview origin fields', () => {
  assert.equal(
    validCartHref,
    `/cart?from=preview&bookId=Explorer_story&creationId=${creationId}&jobId=${committedPreviewJobId}`
  )
})

test('builder falls back to direct Cart when the committed origin is incomplete', () => {
  assert.equal(
    buildPreviewCartHref({
      bookId: 'Explorer_story',
      creationId,
      committedPreviewJobId: 'not-a-job-id',
    }),
    '/cart'
  )
})

test('resolver rebuilds the Preview path from validated fields after reload or copy', () => {
  assert.equal(resolvePreviewCartReturnPath(validSearch), expectedPreviewPath)
  assert.equal(resolvePreviewCartReturnPath(new URLSearchParams(validSearch)), expectedPreviewPath)
})

test('direct Cart and incomplete Preview origins fall back safely', () => {
  assert.equal(resolvePreviewCartReturnPath(''), null)
  assert.equal(resolvePreviewCartReturnPath('?from=preview'), null)
  assert.deepEqual(resolveCartBackNavigation('', false), { href: '/', method: 'push' })
})

test('resolver rejects malformed, duplicated and path-shaped fields', () => {
  const malformed = [
    `?from=preview&bookId=..%2Fadmin&creationId=${creationId}&jobId=${committedPreviewJobId}`,
    `?from=preview&bookId=https%3A%2F%2Fevil.example&creationId=${creationId}&jobId=${committedPreviewJobId}`,
    `?from=preview&bookId=Explorer_story&creationId=bad&jobId=${committedPreviewJobId}`,
    `${validSearch}&jobId=00000000-0000-4000-8000-000000000003`,
  ]
  malformed.forEach((search) => assert.equal(resolvePreviewCartReturnPath(search), null))
})

test('normal Preview Back replaces Cart while translated Back performs a full navigation', () => {
  assert.deepEqual(resolveCartBackNavigation(validSearch, false), {
    href: expectedPreviewPath,
    method: 'replace',
  })
  assert.deepEqual(resolveCartBackNavigation(validSearch, true), {
    href: expectedPreviewPath,
    method: 'assign',
  })
})

test('translated direct Cart fallback also avoids SPA navigation', () => {
  assert.deepEqual(resolveCartBackNavigation('', true), { href: '/', method: 'assign' })
})
