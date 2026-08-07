import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ApprovedSourceExportError,
  buildApprovedSourceExportPlan,
  type ApprovedSourceReviewPage,
} from './admin-approved-source-export'

function fixture() {
  const metadata = [
    { page_index: 30, output_order: 0, role: 'final_back_cover', spread_index: 0, side: 'left', page_number: null },
    { page_index: 7, output_order: 1, role: 'final_front_cover', spread_index: 0, side: 'right', page_number: null },
    { page_index: 22, output_order: 2, role: 'final_interior', spread_index: 1, side: 'left', page_number: 1 },
    { page_index: 4, output_order: 3, role: 'final_interior', spread_index: 1, side: 'right', page_number: 2 },
  ]
  const reviewPages: ApprovedSourceReviewPage[] = metadata.map((page) => ({
    page_index: page.page_index,
    status: 'approved',
    approved_output_path: `private/random-${page.page_index}.png`,
    approved_source: 'ai',
    reviewed_at: '2026-08-05T00:00:00.000Z',
  }))
  return { metadata, reviewPages }
}

test('orders V2 exports by metadata and names entries without source filename inference', () => {
  const { metadata, reviewPages } = fixture()
  const plan = buildApprovedSourceExportPlan({
    finalJobId: 'final-job',
    displayTitle: "Mia's Birthday Story",
    generatedAt: '2026-08-05T01:00:00.000Z',
    outputAssets: { schema_version: 2, asset_layout: 'single-page', pages: metadata },
    totalPages: 4,
    reviewPages,
    selectedPageIndices: [4, 30, 22],
  })

  assert.equal(plan.archive_name, "Mia's Birthday Story Approved Sources.zip")
  assert.deepEqual(
    plan.files.map((file) => [file.page_index, file.entry_base_name]),
    [
      [30, '01_cover_back'],
      [22, '03_spread_01_left_page_01'],
      [4, '04_spread_01_right_page_02'],
    ]
  )
  assert.equal(JSON.stringify(plan.manifest).includes('private/'), false)
})

test('fails closed for stale, duplicate, unknown, or unapproved selections', () => {
  const { metadata, reviewPages } = fixture()
  const base = {
    finalJobId: 'final-job',
    displayTitle: 'Story',
    generatedAt: '2026-08-05T01:00:00.000Z',
    outputAssets: { schema_version: 2, asset_layout: 'single-page', pages: metadata },
    totalPages: 4,
    reviewPages,
  }
  assert.throws(
    () => buildApprovedSourceExportPlan({ ...base, selectedPageIndices: [4, 4] }),
    ApprovedSourceExportError
  )
  assert.throws(
    () => buildApprovedSourceExportPlan({ ...base, selectedPageIndices: [99] }),
    /outside this job/
  )
  assert.throws(
    () => buildApprovedSourceExportPlan({
      ...base,
      reviewPages: reviewPages.map((page) => page.page_index === 4
        ? { ...page, status: 'needs_fix', approved_output_path: null }
        : page),
      selectedPageIndices: [4],
    }),
    /not currently approved/
  )
})

test('keeps the legacy export positional and metadata-free', () => {
  const reviewPages: ApprovedSourceReviewPage[] = [9, 2].map((pageIndex) => ({
    page_index: pageIndex,
    status: 'approved',
    approved_output_path: `private/${pageIndex}.png`,
    approved_source: 'manual',
    reviewed_at: null,
  }))
  const plan = buildApprovedSourceExportPlan({
    finalJobId: 'legacy-job',
    displayTitle: 'Legacy Story',
    generatedAt: '2026-08-05T01:00:00.000Z',
    outputAssets: {},
    totalPages: 2,
    reviewPages,
    selectedPageIndices: [9, 2],
  })
  assert.deepEqual(plan.files.map((file) => file.entry_base_name), ['01_page_01', '02_page_02'])
  assert.deepEqual(plan.files.map((file) => file.page_index), [2, 9])

  const single = buildApprovedSourceExportPlan({
    finalJobId: 'legacy-job',
    displayTitle: 'Legacy Story',
    generatedAt: '2026-08-05T01:00:00.000Z',
    outputAssets: {},
    totalPages: 2,
    reviewPages,
    selectedPageIndices: [9],
  })
  assert.equal(single.files[0].entry_base_name, '02_page_02')
})
