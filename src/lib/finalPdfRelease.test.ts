import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'

import { buildFinalPdfReleaseArtifact } from './finalPdfRelease'

function birthdaygirlFixture() {
  const pages: Array<Record<string, unknown>> = [
    { page_index: 40, output_order: 0, role: 'final_back_cover', spread_index: 0, side: 'left', page_number: null },
    { page_index: 8, output_order: 1, role: 'final_front_cover', spread_index: 0, side: 'right', page_number: null },
  ]
  for (let pageNumber = 1; pageNumber <= 30; pageNumber += 1) {
    pages.push({
      page_index: 100 + pageNumber * 3,
      output_order: pageNumber + 1,
      role: 'final_interior',
      spread_index: Math.ceil(pageNumber / 2),
      side: pageNumber % 2 === 1 ? 'left' : 'right',
      page_number: pageNumber,
      storage_path: `worker/${pageNumber}.png`,
    })
  }
  return {
    outputAssets: { schema_version: 2, asset_layout: 'single-page', pages },
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
  it('builds a valid V2 artifact from approved paths and preserves all metadata markers', async () => {
    const fixture = birthdaygirlFixture()
    const image = await solidPng('#d8b4fe')
    const loaded: Array<{ path: string; pageIndex: number }> = []
    let legacyCalls = 0

    const artifact = await buildFinalPdfReleaseArtifact({
      ...fixture,
      totalPages: 32,
      loadApprovedPage: async (path, pageIndex) => {
        loaded.push({ path, pageIndex })
        return image
      },
      buildLegacyPdf: async () => {
        legacyCalls += 1
        return Buffer.from('legacy')
      },
    })
    const document = await PDFDocument.load(artifact.buffer)
    const outputPages = artifact.outputAssets.pages as Array<Record<string, unknown>>

    assert.equal(document.getPageCount(), 16)
    assert.equal(loaded.length, 32)
    assert.equal(legacyCalls, 0)
    assert.equal(artifact.outputAssets.schema_version, 2)
    assert.equal(artifact.outputAssets.asset_layout, 'single-page')
    assert.deepEqual(artifact.structuredProof, {
      schema_version: 2,
      mode: 'v2-spread-pages',
      source_page_count: 32,
      expected_pdf_page_count: 16,
      pdf_page_count: 16,
    })
    assert.deepEqual(artifact.outputAssets.pdf_composition, artifact.structuredProof)
    assert.equal(outputPages.length, 32)
    assert.ok(outputPages.every((page) => page.storage_path === `approved/${page.page_index}.png`))
    assert.ok(outputPages.every((page) => !('storage_path_full' in page)))
    assert.equal(artifact.previewImagePath, 'approved/8.png')
    assert.ok(loaded.every(({ path, pageIndex }) => path === `approved/${pageIndex}.png`))
  })

  it('fails closed before upload on incomplete V2 review coverage or fallback output', async () => {
    const fixture = birthdaygirlFixture()
    const image = await solidPng('#ffffff')
    const build = (outputAssets: unknown, approvedPages = fixture.approvedPages) => {
      return buildFinalPdfReleaseArtifact({
        outputAssets,
        approvedPages,
        totalPages: 32,
        loadApprovedPage: async () => image,
        buildLegacyPdf: async () => Buffer.from('legacy'),
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

  it('keeps legacy V1 composition byte-for-byte on the injected legacy path', async () => {
    const approvedPages = [
      { page_index: 7, approved_output_path: 'approved/7.png' },
      { page_index: 2, approved_output_path: 'approved/2.png' },
    ]
    let loaded = false
    let receivedPaths: string[] = []
    const expected = Buffer.from('legacy-pdf')

    const artifact = await buildFinalPdfReleaseArtifact({
      outputAssets: { pages: [{ page_index: 7 }, { page_index: 2 }] },
      totalPages: 2,
      approvedPages,
      loadApprovedPage: async () => {
        loaded = true
        return Buffer.alloc(0)
      },
      buildLegacyPdf: async (paths) => {
        receivedPaths = paths
        return expected
      },
    })

    assert.equal(artifact.buffer, expected)
    assert.deepEqual(receivedPaths, ['approved/7.png', 'approved/2.png'])
    assert.equal(loaded, false)
    assert.equal(artifact.structuredProof, null)
    assert.equal(artifact.previewImagePath, 'approved/7.png')
    assert.equal('pdf_composition' in artifact.outputAssets, false)
  })
})
