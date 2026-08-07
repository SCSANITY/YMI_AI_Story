import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildFinalReviewWorkspace } from './admin-final-review-workspace'
import type { FinalJobPageRow } from './finalReview'

function page(overrides: Partial<FinalJobPageRow> & Pick<FinalJobPageRow, 'final_job_page_id' | 'page_index'>): FinalJobPageRow {
  return {
    output_order: null,
    role: null,
    spread_index: null,
    side: null,
    page_number: null,
    status: 'pending_review',
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
    has_ai_output: true,
    has_manual_output: false,
    has_approved_output: false,
    ...overrides,
  }
}

function v2Pages() {
  const pages = [
    page({ final_job_page_id: 'back', page_index: 3, output_order: 0, role: 'final_back_cover', spread_index: 0, side: 'left' }),
    page({ final_job_page_id: 'front', page_index: 4, output_order: 1, role: 'final_front_cover', spread_index: 0, side: 'right' }),
  ]
  for (let spreadIndex = 1; spreadIndex <= 15; spreadIndex += 1) {
    pages.push(page({
      final_job_page_id: `left-${spreadIndex}`,
      page_index: spreadIndex * 2 + 3,
      output_order: spreadIndex * 2,
      role: 'final_interior',
      spread_index: spreadIndex,
      side: 'left',
      page_number: spreadIndex * 2 - 1,
    }))
    pages.push(page({
      final_job_page_id: `right-${spreadIndex}`,
      page_index: spreadIndex * 2 + 4,
      output_order: spreadIndex * 2 + 1,
      role: 'final_interior',
      spread_index: spreadIndex,
      side: 'right',
      page_number: spreadIndex * 2,
    }))
  }
  return pages
}

describe('Admin Final Review workspace', () => {
  it('groups 32 V2 pages into one cover pair and 15 independent spreads', () => {
    const workspace = buildFinalReviewWorkspace({
      pages: v2Pages(),
      pageContract: { schema_version: 2, asset_layout: 'single-page' },
    })

    assert.equal(workspace.isV2, true)
    assert.equal(workspace.items.length, 32)
    assert.equal(workspace.groups.length, 16)
    assert.deepEqual(workspace.groups[0].items.map((item) => item.primaryLabel), ['Back cover', 'Front cover'])
    assert.deepEqual(workspace.groups[1].items.map((item) => item.shortLabel), ['L · 01', 'R · 02'])
    assert.equal(workspace.groups[15].label, 'Spread 15')
  })

  it('keeps V1 pages as a flat positional workspace', () => {
    const workspace = buildFinalReviewWorkspace({
      pages: [
        page({ final_job_page_id: 'legacy-0', page_index: 0 }),
        page({ final_job_page_id: 'legacy-1', page_index: 1 }),
      ],
      pageContract: { schema_version: null, asset_layout: null },
    })

    assert.equal(workspace.isV2, false)
    assert.deepEqual(workspace.items.map((item) => item.primaryLabel), ['Page 01', 'Page 02'])
    assert.equal(workspace.groups.every((group) => group.kind === 'legacy'), true)
  })
})
