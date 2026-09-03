import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildAdminFinalPageReadModel,
  type AdminFinalPageSource,
} from './admin-final-page-read-model'
import { createFinalV3Metadata } from './final-page-metadata.fixture'

function sourcePage(pageIndex: number, overrides: Partial<AdminFinalPageSource> = {}): AdminFinalPageSource {
  return {
    final_job_page_id: `review-${pageIndex}`,
    page_index: pageIndex,
    status: 'pending_review',
    ai_output_path: `private/ai-${pageIndex}.png`,
    manual_output_path: null,
    approved_output_path: null,
    approved_source: null,
    provider_request_id: null,
    review_note: null,
    reviewed_by: null,
    reviewed_at: null,
    review_intent_id: null,
    review_intent_type: null,
    review_intent_at: null,
    attempt_count: 1,
    error_message: null,
    created_at: '2026-08-04T00:00:00.000Z',
    updated_at: '2026-08-04T00:00:00.000Z',
    ...overrides,
  }
}

function birthdaygirlFinalMetadata() {
  return createFinalV3Metadata((outputOrder) => outputOrder + 3).map((page) => ({
    ...page,
    storage_path: `must-not-leak/${page.page_number ?? 'front-cover'}.png`,
  }))
}

describe('Admin Final page read model', () => {
  it('merges a 31-page V3 job by page_index and exposes only allowlisted identity', () => {
    const metadata = birthdaygirlFinalMetadata()
    const reviewPages = metadata
      .map((page) => sourcePage(Number(page.page_index)))
      .reverse()

    const model = buildAdminFinalPageReadModel({
      outputAssets: {
        schema_version: 3,
        asset_layout: 'single-page',
        pages: metadata,
      },
      totalPages: 31,
      reviewPages,
    })

    assert.deepEqual(model.page_contract, { schema_version: 3, asset_layout: 'single-page' })
    assert.equal(model.pages.length, 31)
    assert.equal(model.pages[0].role, 'final_front_cover')
    assert.deepEqual(
      model.pages.slice(1, 3).map((page) => [page.output_order, page.side, page.page_number]),
      [[1, 'left', 1], [2, 'right', 2]]
    )
    assert.equal(model.pages[0].has_ai_output, true)
    assert.equal(Object.hasOwn(model.pages[0], 'ai_output_path'), false)
    assert.equal(Object.hasOwn(model.pages[0], 'storage_path'), false)
    assert.equal(JSON.stringify(model).includes('must-not-leak'), false)
  })

  it('rejects unversioned output instead of creating a legacy read model', () => {
    assert.throws(() => buildAdminFinalPageReadModel({
      outputAssets: { pages: [{ page_index: 9, storage_path: 'legacy-private.png' }] },
      totalPages: 2,
      reviewPages: [sourcePage(9), sourcePage(2)],
    }), /contract marker/)
  })

  it('fails closed when a V3 review row has no matching output metadata', () => {
    const metadata = birthdaygirlFinalMetadata().slice(0, -1)
    const reviewPages = birthdaygirlFinalMetadata().map((page) => sourcePage(Number(page.page_index)))

    assert.throws(() => buildAdminFinalPageReadModel({
      outputAssets: {
        schema_version: 3,
        asset_layout: 'single-page',
        pages: metadata,
      },
      totalPages: 31,
      reviewPages,
    }), /output page coverage mismatch/)
  })

  it('does not treat a partial V3 marker as an unversioned job', () => {
    assert.throws(() => buildAdminFinalPageReadModel({
      outputAssets: { schema_version: 3 },
      totalPages: 1,
      reviewPages: [sourcePage(0)],
    }), /contract marker/)
  })
})
