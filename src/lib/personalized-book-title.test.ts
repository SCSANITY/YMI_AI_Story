import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveCartItemDisplayTitle,
  resolveChildNameFromCustomization,
  resolveFinalJobDisplayTitle,
} from './personalized-book-title'

test('cart item title uses the current personalization name', () => {
  assert.equal(
    resolveCartItemDisplayTitle({
      bookID: 'Food_Story',
      book: { title: 'Food Story' },
      personalization: { childName: 'Mia' },
    }),
    "Mia's Food Story"
  )
})

test('cart item title supports persisted snake-case customization fields', () => {
  assert.equal(
    resolveCartItemDisplayTitle({
      bookID: 'Space_story',
      book: { title: 'Space_story' },
      personalization: {
        text_overrides: { child_name: 'Leo' },
      },
    }),
    "Leo's Space Story"
  )
})

test('cart item title does not add a second name prefix after hydration', () => {
  assert.equal(
    resolveCartItemDisplayTitle({
      bookID: 'Explorer_story',
      book: { title: "Noah's Explorer Story" },
      personalization: { childName: 'Noah' },
    }),
    "Noah's Explorer Story"
  )
})

test('shared child-name resolver accepts direct snapshot names', () => {
  assert.equal(
    resolveChildNameFromCustomization({
      customizeSnapshot: { childName: 'Ava' },
    }),
    'Ava'
  )
})

test('final job title derives the customer-facing name from its creation relation', () => {
  assert.equal(
    resolveFinalJobDisplayTitle({
      template_id: 'Food_Story',
      creations: {
        customize_snapshot: {
          text_overrides: { child_name: 'Mia' },
        },
        templates: { name: 'Food Story' },
      },
    }),
    "Mia's Food Story"
  )
})

test('legacy final jobs without a creation use a cleaned template title', () => {
  assert.equal(
    resolveFinalJobDisplayTitle({
      template_id: 'Birthdaygirl_story',
      creations: null,
    }),
    'Birthdaygirl Story'
  )
})
