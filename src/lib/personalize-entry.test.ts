import assert from 'node:assert/strict'
import test from 'node:test'
import { buildPersonalizeIntroHref, resolvePersonalizeEntryStep } from '@/lib/personalize-entry'
import type { PersonalizeFormDraft } from '@/lib/personalize-form-draft'

const draft: PersonalizeFormDraft = {
  version: 1, ownerKey: 'anonymous-session', step: 'REVIEW', name: 'Avery',
  age: '7', language: 'English', bookType: 'basic', faceAssetId: 'face-1',
  faceStoragePath: 'faces/face-1.webp',
}

test('a new visit without a draft starts at Product Intro, not Photo', () => {
  assert.equal(resolvePersonalizeEntryStep(null), 'INTRO')
})

test('a catalogue entry starts at Intro without clearing the saved inputs', () => {
  assert.equal(resolvePersonalizeEntryStep(draft, true), 'INTRO')
  assert.equal(draft.name, 'Avery')
  assert.equal(draft.faceAssetId, 'face-1')
  assert.equal(buildPersonalizeIntroHref('book / 1'), '/personalize/book%20%2F%201?entry=intro')
})

test('a reload restores each saved step with a confirmed face identifier', () => {
  for (const step of ['PHOTO', 'DETAILS', 'REVIEW'] as const) {
    assert.equal(resolvePersonalizeEntryStep({ ...draft, step }), step)
  }
})

test('a lost local-only photo returns a reload to Photo, but never skips Intro', () => {
  assert.equal(resolvePersonalizeEntryStep({ ...draft, faceAssetId: null }), 'PHOTO')
  assert.equal(resolvePersonalizeEntryStep({ ...draft, faceAssetId: null, step: 'INTRO' }), 'INTRO')
})
