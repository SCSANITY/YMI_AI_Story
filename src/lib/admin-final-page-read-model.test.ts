import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildAdminFinalPageReadModel,
  type AdminFinalPageSource,
} from './admin-final-page-read-model'

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
  const pages: Array<Record<string, unknown>> = [
    {
      page_index: 3,
      output_order: 0,
      role: 'final_back_cover',
      spread_index: 0,
      side: 'left',
      page_number: null,
      storage_path: 'must-not-leak/back-cover.png',
    },
    {
      page_index: 4,
      output_order: 1,
      role: 'final_front_cover',
      spread_index: 0,
      side: 'right',
      page_number: null,
      storage_path: 'must-not-leak/front-cover.png',
    },
  ]
  for (let spreadIndex = 1; spreadIndex <= 15; spreadIndex += 1) {
    const outputOrder = spreadIndex * 2
    pages.push({
      page_index: outputOrder + 3,
      output_order: outputOrder,
      role: 'final_interior',
      spread_index: spreadIndex,
      side: 'left',
      page_number: spreadIndex * 2 - 1,
      storage_path: `must-not-leak/page-${spreadIndex}-left.png`,
    })
    pages.push({
      page_index: outputOrder + 4,
      output_order: outputOrder + 1,
      role: 'final_interior',
      spread_index: spreadIndex,
      side: 'right',
      page_number: spreadIndex * 2,
      storage_path: `must-not-leak/page-${spreadIndex}-right.png`,
    })
  }
  return pages
}

describe('Admin Final page read model', () => {
  it('merges a 32-page V2 job by page_index and exposes only allowlisted identity', () => {
    const metadata = birthdaygirlFinalMetadata()
    const reviewPages = metadata
      .map((page) => sourcePage(Number(page.page_index)))
      .reverse()

    const model = buildAdminFinalPageReadModel({
      outputAssets: {
        schema_version: 2,
        asset_layout: 'single-page',
        pages: metadata,
      },
      totalPages: 32,
      reviewPages,
    })

    assert.deepEqual(model.page_contract, { schema_version: 2, asset_layout: 'single-page' })
    assert.equal(model.pages.length, 32)
    assert.equal(model.pages[0].role, 'final_back_cover')
    assert.equal(model.pages[1].role, 'final_front_cover')
    assert.deepEqual(
      model.pages.slice(2, 4).map((page) => [page.output_order, page.side, page.page_number]),
      [[2, 'left', 1], [3, 'right', 2]]
    )
    assert.equal(model.pages[0].has_ai_output, true)
    assert.equal(Object.hasOwn(model.pages[0], 'ai_output_path'), false)
    assert.equal(Object.hasOwn(model.pages[0], 'storage_path'), false)
    assert.equal(JSON.stringify(model).includes('must-not-leak'), false)
  })

  it('preserves V1 page-index ordering with null presentation metadata', () => {
    const model = buildAdminFinalPageReadModel({
      outputAssets: { pages: [{ page_index: 9, storage_path: 'legacy-private.png' }] },
      totalPages: 2,
      reviewPages: [sourcePage(9), sourcePage(2)],
    })

    assert.deepEqual(model.page_contract, { schema_version: null, asset_layout: null })
    assert.deepEqual(model.pages.map((page) => page.page_index), [2, 9])
    assert.equal(model.pages[0].output_order, null)
    assert.equal(model.pages[0].role, null)
  })

  it('fails closed when a V2 review row has no matching output metadata', () => {
    const metadata = birthdaygirlFinalMetadata().slice(0, -1)
    const reviewPages = birthdaygirlFinalMetadata().map((page) => sourcePage(Number(page.page_index)))

    assert.throws(() => buildAdminFinalPageReadModel({
      outputAssets: {
        schema_version: 2,
        asset_layout: 'single-page',
        pages: metadata,
      },
      totalPages: 32,
      reviewPages,
    }), /output page coverage mismatch/)
  })

  it('does not treat a partial V2 marker as a legacy job', () => {
    assert.throws(() => buildAdminFinalPageReadModel({
      outputAssets: { schema_version: 2 },
      totalPages: 1,
      reviewPages: [sourcePage(0)],
    }), /contract marker/)
  })
})
