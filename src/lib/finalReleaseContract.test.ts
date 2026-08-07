import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  assertFinalOutputAssetsReleasable,
  getStructuredFinalPdfExpectedPageCount,
  isStructuredFinalPdfReleaseProofValid,
  isStructuredFinalOutputAssets,
  mergeApprovedFinalOutputPages,
  readStructuredFinalPdfReleaseProof,
} from './finalReleaseContract'

describe('Final PDF release contract', () => {
  it('allows existing non-fallback output assets', () => {
    assert.doesNotThrow(() => assertFinalOutputAssetsReleasable({ pages: [] }))
  })

  it('rejects incomplete V2 markers and V2 output without positive composition proof', () => {
    assert.throws(
      () => assertFinalOutputAssetsReleasable({ schema_version: 2 }),
      /incomplete V2/
    )
    assert.throws(
      () => assertFinalOutputAssetsReleasable({ asset_layout: 'single-page' }),
      /incomplete V2/
    )
    assert.throws(
      () => assertFinalOutputAssetsReleasable({
        schema_version: 2,
        asset_layout: 'single-page',
        pages: [{}, {}, {}],
      }),
      /successful structured PDF composition/
    )
  })

  it('allows V2 only when the server proof matches the persisted page contract', () => {
    const assets = {
      schema_version: 2,
      asset_layout: 'single-page',
      pages: [
        { page_index: 10, output_order: 0, role: 'final_back_cover', spread_index: 0, side: 'left', page_number: null },
        { page_index: 4, output_order: 1, role: 'final_front_cover', spread_index: 0, side: 'right', page_number: null },
        { page_index: 19, output_order: 2, role: 'final_interior', spread_index: 1, side: 'left', page_number: 1 },
        { page_index: 7, output_order: 3, role: 'final_interior', spread_index: 1, side: 'right', page_number: 2 },
      ],
      pdf_composition: {
        schema_version: 2,
        mode: 'v2-spread-pages',
        source_page_count: 4,
        expected_pdf_page_count: 2,
        pdf_page_count: 2,
      },
    }
    const proof = readStructuredFinalPdfReleaseProof(assets)

    assert.equal(isStructuredFinalOutputAssets(assets), true)
    assert.equal(getStructuredFinalPdfExpectedPageCount(assets), 2)
    assert.ok(proof)
    assert.equal(isStructuredFinalPdfReleaseProofValid(assets, proof), true)
    assert.doesNotThrow(() => assertFinalOutputAssetsReleasable(assets, proof))
    assert.equal(
      isStructuredFinalPdfReleaseProofValid(assets, { ...proof, source_page_count: 5 }),
      false
    )
    assert.throws(
      () => assertFinalOutputAssetsReleasable(assets, { ...proof, pdf_page_count: 3 }),
      /successful structured PDF composition/
    )
  })

  it('rejects the superseded 32-to-31 proof shape', () => {
    assert.equal(readStructuredFinalPdfReleaseProof({
      pdf_composition: {
        schema_version: 1,
        mode: 'v2-single-page',
        source_page_count: 32,
        pdf_page_count: 31,
      },
    }), null)
  })

  it('keeps the fail-visible fallback PDF guard', () => {
    assert.throws(
      () => assertFinalOutputAssetsReleasable({ pdf_fallback: true }),
      /fallback PDF marker/
    )
  })

  it('preserves V2 page identity while replacing reviewed storage paths', () => {
    const pages = mergeApprovedFinalOutputPages({
      pages: [{
        page_index: 7,
        output_order: 3,
        role: 'final_interior',
        spread_index: 1,
        side: 'right',
        page_number: 2,
        storage_path: 'worker.png',
        storage_path_full: 'worker-full.png',
      }],
    }, [{ page_index: 7, approved_output_path: 'approved.png' }])

    assert.deepEqual(pages, [{
      page_index: 7,
      output_order: 3,
      role: 'final_interior',
      spread_index: 1,
      side: 'right',
      page_number: 2,
      storage_path: 'approved.png',
    }])
  })
})
