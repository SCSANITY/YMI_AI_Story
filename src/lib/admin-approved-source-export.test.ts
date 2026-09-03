import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ApprovedSourceExportError,
  buildApprovedSourceExportPlan,
  type ApprovedSourceReviewPage,
} from './admin-approved-source-export'
import { createFinalV3Metadata } from './final-page-metadata.fixture'

function fixture() {
  const metadata = createFinalV3Metadata((outputOrder) => outputOrder === 0 ? 30 : 100 + outputOrder * 3)
  const reviewPages: ApprovedSourceReviewPage[] = metadata.map((page) => ({
    page_index: page.page_index,
    status: 'approved',
    approved_output_path: `private/random-${page.page_index}.png`,
    approved_source: 'ai',
    reviewed_at: '2026-08-05T00:00:00.000Z',
  }))
  return { metadata, reviewPages }
}

test('orders V3 exports by metadata and names entries without source filename inference', () => {
  const { metadata, reviewPages } = fixture()
  const plan = buildApprovedSourceExportPlan({
    finalJobId: 'final-job',
    displayTitle: "Mia's Birthday Story",
    generatedAt: '2026-08-05T01:00:00.000Z',
    outputAssets: { schema_version: 3, asset_layout: 'single-page', pages: metadata },
    totalPages: 31,
    reviewPages,
    selectedPageIndices: [106, 30, 103],
  })

  assert.equal(plan.archive_name, "Mia's Birthday Story Approved Sources.zip")
  assert.deepEqual(
    plan.files.map((file) => [file.page_index, file.entry_base_name]),
    [
      [30, '01_cover_front'],
      [103, '02_spread_01_left_page_01'],
      [106, '03_spread_01_right_page_02'],
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
    outputAssets: { schema_version: 3, asset_layout: 'single-page', pages: metadata },
    totalPages: 31,
    reviewPages,
  }
  assert.throws(
    () => buildApprovedSourceExportPlan({ ...base, selectedPageIndices: [106, 106] }),
    ApprovedSourceExportError
  )
  assert.throws(
    () => buildApprovedSourceExportPlan({ ...base, selectedPageIndices: [99] }),
    /outside this job/
  )
  assert.throws(
    () => buildApprovedSourceExportPlan({
      ...base,
      reviewPages: reviewPages.map((page) => page.page_index === 106
        ? { ...page, status: 'needs_fix', approved_output_path: null }
        : page),
      selectedPageIndices: [106],
    }),
    /not currently approved/
  )
})

test('rejects unversioned exports', () => {
  const reviewPages: ApprovedSourceReviewPage[] = [9, 2].map((pageIndex) => ({
    page_index: pageIndex,
    status: 'approved',
    approved_output_path: `private/${pageIndex}.png`,
    approved_source: 'manual',
    reviewed_at: null,
  }))
  assert.throws(() => buildApprovedSourceExportPlan({
    finalJobId: 'legacy-job',
    displayTitle: 'Legacy Story',
    generatedAt: '2026-08-05T01:00:00.000Z',
    outputAssets: {},
    totalPages: 2,
    reviewPages,
    selectedPageIndices: [9, 2],
  }), /contract marker/)
})
