import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import { buildManualFinalOutputAssets, getFrozenFinalProductionMode,
  initialFinalProductionStatus, resolveNewFinalProductionMode } from './final-production'
import { buildFinalPdfReleaseArtifact } from './finalPdfRelease'
import { buildFinalReviewMutationPlan, canUploadIntoEmptyFinalPage,
  getFinalReplacementClaimablePageStatuses } from './final-review-mutation-contract'

export function manualFixture() {
  const pages: Record<string, unknown>[] = [{ index: 10, template_image: 'cover.png', enable_face_swap: true,
    presentation: { role: 'final_front_cover', spread_index: 0 } }]
  for (let n = 1; n <= 30; n++) pages.push({ index: 10 + n, template_image: `page-${n}.png`, enable_face_swap: true,
    presentation: { role: 'final_interior', spread_index: Math.ceil(n / 2), side: n % 2 ? 'left' : 'right', page_number: n } })
  return { schema_version: 3, asset_layout: 'single-page', pages, final: { page_indices: pages.map((p) => p.index) } }
}

test('phase1 defaults manual; explicit auto is supported, invalid settings fail', () => {
  assert.equal(resolveNewFinalProductionMode(undefined), 'manual')
  assert.equal(resolveNewFinalProductionMode('manual'), 'manual')
  assert.equal(resolveNewFinalProductionMode('auto'), 'auto')
  assert.throws(() => resolveNewFinalProductionMode('AUTO'), /final_production_mode_invalid/)
  assert.equal(initialFinalProductionStatus('manual'), 'manual_pending')
  assert.equal(initialFinalProductionStatus('auto'), 'queued')
})

test('stored Job mode survives a changed creation switch; pre-mode Jobs remain auto', () => {
  const snapshot = { final_production_mode: resolveNewFinalProductionMode('manual'), face_source_path: 'synthetic/reference' }
  resolveNewFinalProductionMode('auto')
  assert.equal(getFrozenFinalProductionMode(snapshot), 'manual')
  assert.equal(getFrozenFinalProductionMode({}), 'auto')
  assert.throws(() => getFrozenFinalProductionMode({ final_production_mode: 'unknown' }), /final_production_mode_invalid/)
})

test('manual pages are uploadable without inventing a failure or claiming Worker work', () => {
  assert.equal(canUploadIntoEmptyFinalPage('manual_pending'), true)
  assert.ok(getFinalReplacementClaimablePageStatuses('manual_pending').includes('manual_pending'))
  assert.equal(canUploadIntoEmptyFinalPage('processing'), false)
  const outputAssets = buildManualFinalOutputAssets(manualFixture())
  const plan = buildFinalReviewMutationPlan({ outputAssets, totalPages: 31,
    reviewPageIndices: Array.from({ length: 31 }, (_, i) => 10 + i) })
  assert.equal(plan.pages[0].role, 'final_front_cover')
  assert.equal(plan.pages[30].output_order, 30)
  const invalid = manualFixture()
  invalid.pages[2].presentation = { role: 'final_interior', spread_index: 1, side: 'left', page_number: 1 }
  assert.throws(() => buildManualFinalOutputAssets(invalid))
})

test('manual31-page scaffold reuses the existing16-page PDF release and approved paths', async () => {
  const outputAssets = buildManualFinalOutputAssets(manualFixture())
  const leaf = await sharp({ create: { width: 512, height: 512, channels: 3, background: '#88aa66' } }).png().toBuffer()
  const approvedPages = Array.from({ length: 31 }, (_, i) => ({ page_index: i + 10, approved_output_path: `synthetic-approved/page-${i}.png` }))
  let loads = 0
  const result = await buildFinalPdfReleaseArtifact({ outputAssets, totalPages: 31, approvedPages,
    loadApprovedPage: async () => { loads++; return leaf } })
  assert.equal(loads, 31)
  assert.equal(result.structuredProof.source_page_count, 31)
  assert.equal(result.structuredProof.pdf_page_count, 16)
  assert.equal(result.buffer.subarray(0, 4).toString(), '%PDF')
})
