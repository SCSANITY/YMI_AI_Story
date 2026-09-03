import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'

import {
  buildStructuredFinalPdf,
  buildStructuredFinalPdfPlan,
  composeFinalInteriorSpread,
  normalizeFinalFrontCover,
} from './structuredFinalPdf'
import { createFinalV3Metadata } from './final-page-metadata.fixture'

function birthdaygirlFixture() {
  const pages = createFinalV3Metadata((outputOrder) =>
    outputOrder === 0 ? 8 : 100 + outputOrder * 3
  )
  return {
    outputAssets: { schema_version: 3, asset_layout: 'single-page', pages },
    pageIndices: pages.map((page) => Number(page.page_index)).reverse(),
  }
}

async function solidPng(width: number, height: number, background: string) {
  return sharp({ create: { width, height, channels: 3, background } }).png().toBuffer()
}

describe('structured Final customer PDF', () => {
  it('builds the 31-source contract as one square cover and 15 landscape spreads', async () => {
    const fixture = birthdaygirlFixture()
    const buffers = new Map<number, Buffer>()
    buffers.set(8, await solidPng(100, 102, '#0000ff'))
    for (let pageNumber = 1; pageNumber <= 30; pageNumber += 1) {
      buffers.set(100 + pageNumber * 3, await solidPng(120, 120, `rgb(${pageNumber}, 80, 120)`))
    }

    const result = await buildStructuredFinalPdf({
      ...fixture,
      totalPages: 31,
      minSourceEdge: 64,
      maxImageEdge: 180,
      loadPage: async (pageIndex) => {
        const buffer = buffers.get(pageIndex)
        if (!buffer) throw new Error(`Missing fixture ${pageIndex}`)
        return buffer
      },
    })
    const document = await PDFDocument.load(result.buffer)

    assert.equal(result.sourcePageCount, 31)
    assert.equal(result.expectedPdfPageCount, 16)
    assert.equal(result.pdfPageCount, 16)
    assert.equal(document.getPageCount(), 16)
    assert.equal(result.orderedSourcePageIndices[0], 8)
    assert.equal(result.orderedSourcePageIndices[1], 103)
    assert.deepEqual(result.cover, { width: 102, height: 102 })
    assert.deepEqual(result.interiorSpread, { width: 180, height: 78, gutter: 24 })
    assert.ok(result.buffer.length < 50 * 1024 * 1024)
  })

  it('normalizes mixed valid interior source sizes into consistent spread geometry', async () => {
    const fixture = birthdaygirlFixture()
    const buffers = new Map<number, Buffer>()
    buffers.set(8, await solidPng(2048, 2078, '#0000ff'))
    for (let pageNumber = 1; pageNumber <= 30; pageNumber += 1) {
      const edge = pageNumber % 2 === 1 ? 2048 : 2197
      buffers.set(100 + pageNumber * 3, await solidPng(edge, edge, `rgb(${pageNumber}, 80, 120)`))
    }

    const result = await buildStructuredFinalPdf({
      ...fixture,
      totalPages: 31,
      maxImageEdge: 1800,
      loadPage: async (pageIndex) => {
        const buffer = buffers.get(pageIndex)
        if (!buffer) throw new Error(`Missing fixture ${pageIndex}`)
        return buffer
      },
    })

    assert.equal(result.pdfPageCount, 16)
    assert.deepEqual(result.interiorSpread, { width: 1800, height: 888, gutter: 24 })
  })

  it('requires deterministic cover-first and physical interior output order', () => {
    const fixture = birthdaygirlFixture()
    const assets = structuredClone(fixture.outputAssets)
    const pages = assets.pages as Array<Record<string, unknown>>
    pages[2].page_number = 3

    assert.throws(() => buildStructuredFinalPdfPlan({
      outputAssets: assets,
      totalPages: 31,
      pageIndices: fixture.pageIndices,
    }), /output order mismatch|page order mismatch|page-number coverage/i)
  })

  it('normalizes the standalone front cover to an exact square page', async () => {
    const cover = await normalizeFinalFrontCover({
      frontBuffer: await solidPng(101, 102, '#0000ff'),
      maxImageEdge: 200,
      jpegQuality: 95,
      minSourceEdge: 64,
    })
    const info = await sharp(cover.buffer).metadata()
    assert.deepEqual({ width: info.width, height: info.height }, { width: 102, height: 102 })
  })

  it('places interior left/right pages around the deterministic white gutter', async () => {
    const spread = await composeFinalInteriorSpread({
      leftBuffer: await solidPng(100, 100, '#ff0000'),
      rightBuffer: await solidPng(100, 100, '#0000ff'),
      spreadIndex: 1,
      maxImageEdge: 224,
      jpegQuality: 95,
      minSourceEdge: 64,
      gutter: 24,
    })
    const { data, info } = await sharp(spread.buffer).raw().toBuffer({ resolveWithObject: true })
    const sample = (x: number) => {
      const offset = (Math.floor(info.height / 2) * info.width + x) * info.channels
      return { red: data[offset], green: data[offset + 1], blue: data[offset + 2] }
    }

    assert.deepEqual({ width: info.width, height: info.height }, { width: 224, height: 100 })
    const left = sample(30)
    const gutter = sample(112)
    const right = sample(194)
    assert.ok(left.red > 220 && left.blue < 40)
    assert.ok(gutter.red > 235 && gutter.green > 235 && gutter.blue > 235)
    assert.ok(right.blue > 220 && right.red < 40)
  })

  it('fails visibly on non-square cover geometry and low-resolution placeholders', async () => {
    const fixture = birthdaygirlFixture()
    const regular = await solidPng(600, 600, '#ffffff')
    const invalidCover = new Map<number, Buffer>([
      [8, await solidPng(100, 130, '#0000ff')],
    ])

    await assert.rejects(() => buildStructuredFinalPdf({
      ...fixture,
      totalPages: 31,
      minSourceEdge: 64,
      loadPage: async (pageIndex) => invalidCover.get(pageIndex) ?? regular,
    }), /front cover must be approximately square/)

    const placeholder = await solidPng(1, 1, '#ffffff')
    await assert.rejects(() => buildStructuredFinalPdf({
      ...fixture,
      totalPages: 31,
      loadPage: async (pageIndex) => pageIndex === 103 ? placeholder : regular,
    }), /minimum 512px source edge/)
  })

  it('rejects fallback markers, incomplete metadata, and output-size overflow', async () => {
    const fixture = birthdaygirlFixture()
    assert.throws(() => buildStructuredFinalPdfPlan({
      outputAssets: { ...fixture.outputAssets, pdf_fallback: true },
      totalPages: 31,
      pageIndices: fixture.pageIndices,
    }), /fallback PDF marker/)
    assert.throws(() => buildStructuredFinalPdfPlan({
      outputAssets: fixture.outputAssets,
      totalPages: 31,
      pageIndices: fixture.pageIndices.slice(1),
    }), /coverage mismatch/)

    const buffer = await solidPng(120, 120, '#abcdef')
    await assert.rejects(() => buildStructuredFinalPdf({
      ...fixture,
      totalPages: 31,
      minSourceEdge: 64,
      maxPdfBytes: 100,
      loadPage: async () => buffer,
    }), /exceeds the 100 byte output limit/)
  })

  it('does not reinterpret a V1 job as a structured PDF', () => {
    assert.throws(() => buildStructuredFinalPdfPlan({
      outputAssets: { pages: [] },
      totalPages: 15,
      pageIndices: Array.from({ length: 15 }, (_, index) => index),
    }), /unsupported Final output contract marker/)
  })
})
