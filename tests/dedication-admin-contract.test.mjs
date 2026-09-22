import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (relativePath) => readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8')

test('Admin print handoff never substitutes a current creation choice for a missing purchase snapshot', () => {
  const route = read('app/api/admin/final-jobs/[finalJobId]/route.ts')
  const review = read('components/admin/final-review/PrintVersionReview.tsx')

  assert.match(route, /\.from\('cart_item_dedications'\)/)
  assert.match(route, /dedication_snapshot: dedicationSnapshot/)
  assert.doesNotMatch(route, /\.from\('creation_dedications'\)/)
  assert.match(review, /Dedication snapshot missing\. Verify this order line before preparing its print insert\./)
  assert.match(review, /role="alert"/)
  assert.doesNotMatch(review, /Not recorded \(legacy order\)/)
})
