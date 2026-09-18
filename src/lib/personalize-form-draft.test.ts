import assert from 'node:assert/strict'
import test from 'node:test'
import {
  readPersonalizeFormDraft,
  writePersonalizeFormDraft,
} from '@/lib/personalize-form-draft'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } as Pick<Storage, 'getItem' | 'setItem'>
}

test('restores the current Customize draft for the same owner and book', () => {
  const storage = createStorage()
  writePersonalizeFormDraft(storage, 'book-1', {
    version: 1,
    ownerKey: 'customer:customer-1',
    step: 'REVIEW',
    name: 'Avery',
    age: '7',
    language: 'English',
    bookType: 'supreme',
    faceAssetId: 'face-1',
    faceStoragePath: 'faces/face-1.webp',
  })

  assert.deepEqual(
    readPersonalizeFormDraft(storage, 'book-1', 'customer:customer-1'),
    {
      version: 1,
      ownerKey: 'customer:customer-1',
      step: 'REVIEW',
      name: 'Avery',
      age: '7',
      language: 'English',
      bookType: 'supreme',
      faceAssetId: 'face-1',
      faceStoragePath: 'faces/face-1.webp',
    }
  )
})

test('does not expose a Customize draft to a different owner', () => {
  const storage = createStorage()
  writePersonalizeFormDraft(storage, 'book-1', {
    version: 1,
    ownerKey: 'anonymous-session',
    step: 'DETAILS',
    name: 'Mia',
    age: '5',
    language: 'English',
    bookType: 'basic',
    faceAssetId: null,
    faceStoragePath: null,
  })

  assert.equal(readPersonalizeFormDraft(storage, 'book-1', 'customer:customer-2'), null)
})

test('normalizes retired package values to the current basic package', () => {
  const storage = createStorage()
  storage.setItem('ymi_personalize_form_draft_book-1', JSON.stringify({
    version: 1,
    ownerKey: 'anonymous-session',
    step: 'REVIEW',
    name: 'Leo',
    age: '8',
    language: 'English',
    bookType: 'premium',
    faceAssetId: null,
    faceStoragePath: null,
  }))

  assert.equal(
    readPersonalizeFormDraft(storage, 'book-1', 'anonymous-session')?.bookType,
    'basic'
  )
})

test('retired digital unpaid drafts retain child details and the prepared photo', () => {
  const storage = createStorage()
  const draft = {
    version: 1,
    ownerKey: 'anonymous-session',
    step: 'REVIEW',
    name: 'Avery',
    age: '7',
    language: 'English',
    bookType: 'digital',
    faceAssetId: 'face-1',
    faceStoragePath: 'faces/face-1.webp',
  }
  storage.setItem('ymi_personalize_form_draft_book-1', JSON.stringify(draft))
  assert.deepEqual(
    readPersonalizeFormDraft(storage, 'book-1', 'anonymous-session'),
    { ...draft, bookType: 'basic' }
  )
})
