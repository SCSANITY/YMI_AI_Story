import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildFinalReviewMutationPlan,
  getFinalPageManualRevisionPath,
  resolveFinalReviewMutationPage,
} from './final-review-mutation-contract'

function v2Pages() {
  const pages: Array<Record<string, unknown>> = [
    { page_index: 40, output_order: 0, role: 'final_back_cover', spread_index: 0, side: 'left', page_number: null },
    { page_index: 8, output_order: 1, role: 'final_front_cover', spread_index: 0, side: 'right', page_number: null },
  ]
  for (let spreadIndex = 1; spreadIndex <= 15; spreadIndex += 1) {
    pages.push({ page_index: 100 + spreadIndex * 2, output_order: spreadIndex * 2, role: 'final_interior', spread_index: spreadIndex, side: 'left', page_number: spreadIndex * 2 - 1 })
    pages.push({ page_index: 99 + spreadIndex * 2, output_order: spreadIndex * 2 + 1, role: 'final_interior', spread_index: spreadIndex, side: 'right', page_number: spreadIndex * 2 })
  }
  return pages
}

describe('Final Review mutation contract', () => {
  it('uses explicit V2 output_order rather than sorted page_index for storage paths', () => {
    const metadata = v2Pages()
    const plan = buildFinalReviewMutationPlan({
      outputAssets: { schema_version: 2, asset_layout: 'single-page', pages: metadata },
      totalPages: 32,
      reviewPageIndices: metadata.map((page) => Number(page.page_index)).reverse(),
    })

    assert.equal(resolveFinalReviewMutationPage(plan, 40).storage_page_number, 1)
    assert.equal(resolveFinalReviewMutationPage(plan, 8).storage_page_number, 2)
    assert.equal(resolveFinalReviewMutationPage(plan, 102).storage_page_number, 3)
    assert.equal(resolveFinalReviewMutationPage(plan, 101).storage_page_number, 4)
  })

  it('keeps the V1 sorted-page-index fallback', () => {
    const plan = buildFinalReviewMutationPlan({
      outputAssets: { pages: [] },
      totalPages: 3,
      reviewPageIndices: [9, 2, 5],
    })
    assert.deepEqual(plan.pages.map((page) => [page.page_index, page.storage_page_number]), [[2, 1], [5, 2], [9, 3]])
  })

  it('requires exact review-row coverage before any mutation plan is built', () => {
    assert.throws(() => buildFinalReviewMutationPlan({
      outputAssets: {},
      totalPages: 32,
      reviewPageIndices: [1, 2],
    }), /coverage mismatch/)
  })

  it('creates an intent-scoped manual replacement path', () => {
    assert.equal(
      getFinalPageManualRevisionPath('order-1', 4, 'A0000000-0000-4000-8000-000000000001'),
      'orders/order-1/final/pages/manual/page_04_a0000000-0000-4000-8000-000000000001.png'
    )
  })
})
