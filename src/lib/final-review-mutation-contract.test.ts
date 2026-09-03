import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildFinalReviewMutationPlan,
  canUploadIntoEmptyFinalPage,
  getFinalReplacementClaimablePageStatuses,
  getFinalPageManualRevisionPath,
  resolveFinalReviewMutationPage,
} from './final-review-mutation-contract'
import { createFinalV3Metadata } from './final-page-metadata.fixture'

function v3Pages() {
  return createFinalV3Metadata((outputOrder) => outputOrder === 0 ? 40 : 100 + outputOrder * 3)
}

describe('Final Review mutation contract', () => {
  it('uses explicit V3 output_order rather than sorted page_index for storage paths', () => {
    const metadata = v3Pages()
    const plan = buildFinalReviewMutationPlan({
      outputAssets: { schema_version: 3, asset_layout: 'single-page', pages: metadata },
      totalPages: 31,
      reviewPageIndices: metadata.map((page) => Number(page.page_index)).reverse(),
    })

    assert.equal(resolveFinalReviewMutationPage(plan, 40).storage_page_number, 1)
    assert.equal(resolveFinalReviewMutationPage(plan, 103).storage_page_number, 2)
    assert.equal(resolveFinalReviewMutationPage(plan, 106).storage_page_number, 3)
  })

  it('rejects unversioned mutation plans', () => {
    assert.throws(() => buildFinalReviewMutationPlan({
      outputAssets: { pages: [] },
      totalPages: 3,
      reviewPageIndices: [9, 2, 5],
    }), /contract marker/)
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

  it('allows empty-slot uploads only after automatic Final processing has stopped', () => {
    for (const status of ['failed', 'needs_fix', 'review_pending']) {
      assert.equal(canUploadIntoEmptyFinalPage(status), true)
      assert.deepEqual(
        getFinalReplacementClaimablePageStatuses(status).slice(-2),
        ['queued', 'failed']
      )
    }

    for (const status of ['queued', 'processing', 'releasing', 'completed']) {
      assert.equal(canUploadIntoEmptyFinalPage(status), false)
      assert.equal(getFinalReplacementClaimablePageStatuses(status).includes('queued'), false)
      assert.equal(getFinalReplacementClaimablePageStatuses(status).includes('failed'), false)
    }
  })
})
