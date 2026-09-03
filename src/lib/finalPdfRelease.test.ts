import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'

import { buildFinalPdfReleaseArtifact } from './finalPdfRelease'
import { createFinalV3Metadata } from './final-page-metadata.fixture'

function birthdaygirlFixture() {
  const pages = createFinalV3Metadata((outputOrder) =>
    outputOrder === 0 ? 8 : 100 + outputOrder * 3
  ).map((page) => ({ ...page, storage_path: `worker/${page.page_number ?? 'cover'}.png` }))
  return {
    outputAssets: { schema_version: 3, asset_layout: 'single-page', pages },
    approvedPages: pages.map((page) => ({
      page_index: Number(page.page_index),
      approved_output_path: `approved/${page.page_index}.png`,
    })).reverse(),
  }
}

async function solidPng(color: string) {
  return sharp({ create: { width: 600, height: 600, channels: 3, background: color } })
    .png()
    .toBuffer()
}

describe('Final PDF release artifact', () => {
  it('builds a valid V3 artifact from approved paths and preserves all metadata markers', async () => {
    const fixture = birthdaygirlFixture()
    const image = await solidPng('#d8b4fe')
    const loaded: Array<{ path: string; pageIndex: number }> = []

    const artifact = await buildFinalPdfReleaseArtifact({
      ...fixture,
      totalPages: 31,
      loadApprovedPage: async (path, pageIndex) => {
        loaded.push({ path, pageIndex })
        return image
      },
    })
    const document = await PDFDocument.load(artifact.buffer)
    const outputPages = artifact.outputAssets.pages as Array<Record<string, unknown>>

    assert.equal(document.getPageCount(), 16)
    assert.equal(loaded.length, 31)
    assert.equal(artifact.outputAssets.schema_version, 3)
    assert.equal(artifact.outputAssets.asset_layout, 'single-page')
    assert.deepEqual(artifact.structuredProof, {
      schema_version: 3,
      mode: 'v3-front-cover-plus-interior-spreads',
      source_page_count: 31,
      expected_pdf_page_count: 16,
      pdf_page_count: 16,
    })
    assert.deepEqual(artifact.outputAssets.pdf_composition, artifact.structuredProof)
    assert.equal(outputPages.length, 31)
    assert.ok(outputPages.every((page) => page.storage_path === `approved/${page.page_index}.png`))
    assert.ok(outputPages.every((page) => !('storage_path_full' in page)))
    assert.equal(artifact.previewImagePath, 'approved/8.png')
    assert.ok(loaded.every(({ path, pageIndex }) => path === `approved/${pageIndex}.png`))
  })

  it('fails closed before upload on incomplete V3 review coverage or fallback output', async () => {
    const fixture = birthdaygirlFixture()
    const image = await solidPng('#ffffff')
    const build = (outputAssets: unknown, approvedPages = fixture.approvedPages) => {
      return buildFinalPdfReleaseArtifact({
        outputAssets,
        approvedPages,
        totalPages: 31,
        loadApprovedPage: async () => image,
      })
    }

    await assert.rejects(
      () => build(fixture.outputAssets, fixture.approvedPages.slice(1)),
      /page coverage mismatch/
    )
    await assert.rejects(
      () => build({ ...fixture.outputAssets, pdf_fallback: true }),
      /fallback PDF marker/
    )
  })

  it('rejects unversioned Final output instead of composing a legacy PDF', async () => {
    const approvedPages = [
      { page_index: 7, approved_output_path: 'approved/7.png' },
      { page_index: 2, approved_output_path: 'approved/2.png' },
    ]
    await assert.rejects(() => buildFinalPdfReleaseArtifact({
      outputAssets: { pages: [{ page_index: 7 }, { page_index: 2 }] },
      totalPages: 2,
      approvedPages,
      loadApprovedPage: async () => Buffer.alloc(0),
    }), /requires the V3 single-page output contract/)
  })
})
