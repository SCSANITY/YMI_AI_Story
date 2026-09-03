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
import { createFinalV3Metadata } from './final-page-metadata.fixture'

describe('Final PDF release contract', () => {
  it('rejects unversioned Final output assets', () => {
    assert.throws(() => assertFinalOutputAssetsReleasable({ pages: [] }), /requires complete V3/)
  })

  it('rejects superseded V2, incomplete V3 markers, and V3 output without proof', () => {
    assert.throws(
      () => assertFinalOutputAssetsReleasable({ schema_version: 2 }),
      /requires complete V3/
    )
    assert.throws(
      () => assertFinalOutputAssetsReleasable({ asset_layout: 'single-page' }),
      /requires complete V3/
    )
    assert.throws(
      () => assertFinalOutputAssetsReleasable({
        schema_version: 3,
        asset_layout: 'single-page',
        pages: [{}, {}, {}],
      }),
      /successful structured PDF composition/
    )
  })

  it('allows V3 only when the server proof matches the persisted page contract', () => {
    const pages = createFinalV3Metadata()
    const assets = {
      schema_version: 3,
      asset_layout: 'single-page',
      pages,
      pdf_composition: {
        schema_version: 3,
        mode: 'v3-front-cover-plus-interior-spreads',
        source_page_count: 31,
        expected_pdf_page_count: 16,
        pdf_page_count: 16,
      },
    }
    const proof = readStructuredFinalPdfReleaseProof(assets)

    assert.equal(isStructuredFinalOutputAssets(assets), true)
    assert.equal(getStructuredFinalPdfExpectedPageCount(assets), 16)
    assert.ok(proof)
    assert.equal(isStructuredFinalPdfReleaseProofValid(assets, proof), true)
    assert.doesNotThrow(() => assertFinalOutputAssetsReleasable(assets, proof))
    assert.equal(
      isStructuredFinalPdfReleaseProofValid(assets, { ...proof, source_page_count: 32 }),
      false
    )
    assert.throws(
      () => assertFinalOutputAssetsReleasable(assets, { ...proof, pdf_page_count: 15 }),
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

  it('preserves structured page identity while replacing reviewed storage paths', () => {
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
