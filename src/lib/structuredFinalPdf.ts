import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'

import {
  parseFinalPageMetadataContract,
  type FinalPageMetadata,
} from '@/lib/final-page-metadata'
import {
  DEFAULT_FINAL_SOURCE_MIN_EDGE,
  inspectFinalSourceImage,
  isApproximatelySquareFinalSource,
} from '@/lib/final-source-image'

const DEFAULT_MAX_IMAGE_EDGE = 1800
const DEFAULT_JPEG_QUALITY = 82
const DEFAULT_MAX_PDF_BYTES = 50 * 1024 * 1024
const DEFAULT_MIN_SOURCE_EDGE = DEFAULT_FINAL_SOURCE_MIN_EDGE
export const DEFAULT_INTERIOR_GUTTER = 24

export type StructuredFinalPdfInteriorSpread = {
  spreadIndex: number
  left: FinalPageMetadata
  right: FinalPageMetadata
}

export type StructuredFinalPdfPlan = {
  frontCover: FinalPageMetadata
  interiors: FinalPageMetadata[]
  interiorSpreads: StructuredFinalPdfInteriorSpread[]
  expectedPdfPageCount: number
  orderedSourcePageIndices: number[]
}

export type StructuredFinalPdfResult = {
  buffer: Buffer
  pdfPageCount: number
  sourcePageCount: number
  expectedPdfPageCount: number
  orderedSourcePageIndices: number[]
  cover: { width: number; height: number }
  interiorSpread: { width: number; height: number; gutter: number }
}

export class StructuredFinalPdfError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StructuredFinalPdfError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertPositiveInteger(value: number, name: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new StructuredFinalPdfError(`${name} must be a positive integer`)
  }
}

export function buildStructuredFinalPdfPlan(args: {
  outputAssets: unknown
  totalPages: number
  pageIndices: number[]
}): StructuredFinalPdfPlan {
  if (isRecord(args.outputAssets) && args.outputAssets.pdf_fallback === true) {
    throw new StructuredFinalPdfError('Final job contains a fallback PDF marker')
  }

  let contract
  try {
    contract = parseFinalPageMetadataContract({
      outputAssets: args.outputAssets,
      totalPages: args.totalPages,
      pageIndices: args.pageIndices,
    })
  } catch (error) {
    throw new StructuredFinalPdfError(
      error instanceof Error ? error.message : 'Invalid structured Final metadata'
    )
  }
  if (contract.schemaVersion !== 3 || contract.assetLayout !== 'single-page') {
    throw new StructuredFinalPdfError('Structured Final PDF requires the V3 single-page contract')
  }

  const frontCover = contract.pages.find((page) => page.role === 'final_front_cover')
  if (!frontCover) {
    throw new StructuredFinalPdfError('Structured Final PDF requires one standalone front cover')
  }
  if (frontCover.output_order !== 0) {
    throw new StructuredFinalPdfError('Final front cover must be output order 0')
  }

  const interiors = contract.pages.filter((page) => page.role === 'final_interior')
  interiors.forEach((page, index) => {
    const physicalPageNumber = index + 1
    const expectedSide = physicalPageNumber % 2 === 1 ? 'left' : 'right'
    const expectedSpreadIndex = Math.ceil(physicalPageNumber / 2)
    if (
      page.output_order !== index + 1 ||
      page.page_number !== physicalPageNumber ||
      page.spread_index !== expectedSpreadIndex ||
      page.side !== expectedSide
    ) {
      throw new StructuredFinalPdfError(
        `Final interior output order mismatch at physical page ${physicalPageNumber}`
      )
    }
  })
  const interiorSpreads: StructuredFinalPdfInteriorSpread[] = []
  for (let index = 0; index < interiors.length; index += 2) {
    const left = interiors[index]
    const right = interiors[index + 1]
    if (!left || !right || left.spread_index !== right.spread_index) {
      throw new StructuredFinalPdfError('Final interior spread pairing mismatch')
    }
    interiorSpreads.push({ spreadIndex: left.spread_index, left, right })
  }

  return {
    frontCover,
    interiors,
    interiorSpreads,
    expectedPdfPageCount: 1 + interiorSpreads.length,
    orderedSourcePageIndices: [
      frontCover.page_index,
      ...interiors.map((page) => page.page_index),
    ],
  }
}

async function inspectSource(buffer: Buffer, label: string, minSourceEdge: number) {
  try {
    return await inspectFinalSourceImage({ buffer, label, minSourceEdge })
  } catch (error) {
    throw new StructuredFinalPdfError(
      error instanceof Error ? error.message : `${label} is not a readable image`
    )
  }
}

export async function normalizeFinalFrontCover(args: {
  frontBuffer: Buffer
  maxImageEdge: number
  jpegQuality: number
  minSourceEdge: number
}) {
  const front = await inspectSource(args.frontBuffer, 'Final front cover', args.minSourceEdge)
  if (!isApproximatelySquareFinalSource(front)) {
    throw new StructuredFinalPdfError(
      `Final front cover must be approximately square (${front.width}x${front.height})`
    )
  }

  const coverEdge = Math.min(args.maxImageEdge, Math.max(front.width, front.height))
  const { data, info } = await sharp(args.frontBuffer, { failOn: 'error' })
    .rotate()
    .resize({
      width: coverEdge,
      height: coverEdge,
      fit: 'contain',
      position: 'centre',
      background: '#ffffff',
      withoutEnlargement: true,
    })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: args.jpegQuality, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })

  if (!isApproximatelySquareFinalSource({ width: info.width, height: info.height })) {
    throw new StructuredFinalPdfError('Normalized Final front cover must be square')
  }
  return { buffer: data, width: info.width, height: info.height }
}

async function normalizeInteriorPage(args: {
  buffer: Buffer
  label: string
  maxPageEdge: number
  minSourceEdge: number
}) {
  const source = await inspectSource(args.buffer, args.label, args.minSourceEdge)
  if (!isApproximatelySquareFinalSource(source)) {
    throw new StructuredFinalPdfError(`${args.label} must be square`)
  }

  const { data, info } = await sharp(args.buffer, { failOn: 'error' })
    .rotate()
    .resize({
      width: args.maxPageEdge,
      height: args.maxPageEdge,
      fit: 'contain',
      position: 'centre',
      background: '#ffffff',
    })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer({ resolveWithObject: true })

  return { buffer: data, width: info.width, height: info.height, source }
}

export async function composeFinalInteriorSpread(args: {
  leftBuffer: Buffer
  rightBuffer: Buffer
  spreadIndex: number
  maxImageEdge: number
  jpegQuality: number
  minSourceEdge: number
  gutter: number
}) {
  if (!Number.isInteger(args.gutter) || args.gutter <= 0 || args.gutter >= args.maxImageEdge - 2) {
    throw new StructuredFinalPdfError('interiorGutter must fit within maxImageEdge')
  }
  const maxPageEdge = Math.floor((args.maxImageEdge - args.gutter) / 2)
  const left = await normalizeInteriorPage({
    buffer: args.leftBuffer,
    label: `Final interior spread ${args.spreadIndex} left page`,
    maxPageEdge,
    minSourceEdge: args.minSourceEdge,
  })
  const right = await normalizeInteriorPage({
    buffer: args.rightBuffer,
    label: `Final interior spread ${args.spreadIndex} right page`,
    maxPageEdge,
    minSourceEdge: args.minSourceEdge,
  })
  if (left.width !== right.width || left.height !== right.height) {
    throw new StructuredFinalPdfError(
      `Final interior spread ${args.spreadIndex} normalized geometry mismatch`
    )
  }

  const spreadWidth = left.width + args.gutter + right.width
  const spreadHeight = left.height
  const { data, info } = await sharp({
    create: {
      width: spreadWidth,
      height: spreadHeight,
      channels: 3,
      background: '#ffffff',
    },
  })
    .composite([
      { input: left.buffer, left: 0, top: 0 },
      { input: right.buffer, left: left.width + args.gutter, top: 0 },
    ])
    .jpeg({ quality: args.jpegQuality, mozjpeg: true })
    .toBuffer({ resolveWithObject: true })

  if (info.width <= info.height || info.width > args.maxImageEdge) {
    throw new StructuredFinalPdfError(
      `Composed Final interior spread ${args.spreadIndex} has invalid dimensions`
    )
  }
  return {
    buffer: data,
    width: info.width,
    height: info.height,
    gutter: args.gutter,
    source: left.source,
  }
}

export async function buildStructuredFinalPdf(args: {
  outputAssets: unknown
  totalPages: number
  pageIndices: number[]
  loadPage: (pageIndex: number) => Promise<Buffer>
  maxImageEdge?: number
  jpegQuality?: number
  maxPdfBytes?: number
  minSourceEdge?: number
  interiorGutter?: number
}): Promise<StructuredFinalPdfResult> {
  const maxImageEdge = args.maxImageEdge ?? DEFAULT_MAX_IMAGE_EDGE
  const jpegQuality = args.jpegQuality ?? DEFAULT_JPEG_QUALITY
  const maxPdfBytes = args.maxPdfBytes ?? DEFAULT_MAX_PDF_BYTES
  const minSourceEdge = args.minSourceEdge ?? DEFAULT_MIN_SOURCE_EDGE
  const interiorGutter = args.interiorGutter ?? DEFAULT_INTERIOR_GUTTER
  assertPositiveInteger(maxImageEdge, 'maxImageEdge')
  assertPositiveInteger(maxPdfBytes, 'maxPdfBytes')
  assertPositiveInteger(minSourceEdge, 'minSourceEdge')
  assertPositiveInteger(interiorGutter, 'interiorGutter')
  if (!Number.isInteger(jpegQuality) || jpegQuality < 60 || jpegQuality > 95) {
    throw new StructuredFinalPdfError('jpegQuality must be an integer from 60 to 95')
  }

  const plan = buildStructuredFinalPdfPlan(args)
  const frontBuffer = await args.loadPage(plan.frontCover.page_index)
  const cover = await normalizeFinalFrontCover({
    frontBuffer,
    maxImageEdge,
    jpegQuality,
    minSourceEdge,
  })

  const pdf = await PDFDocument.create()
  const coverImage = await pdf.embedJpg(cover.buffer)
  const coverPage = pdf.addPage([cover.width, cover.height])
  coverPage.drawImage(coverImage, { x: 0, y: 0, width: cover.width, height: cover.height })

  let interiorSpreadOutput = { width: 0, height: 0, gutter: interiorGutter }
  for (const spread of plan.interiorSpreads) {
    const [leftBuffer, rightBuffer] = await Promise.all([
      args.loadPage(spread.left.page_index),
      args.loadPage(spread.right.page_index),
    ])
    const composed = await composeFinalInteriorSpread({
      leftBuffer,
      rightBuffer,
      spreadIndex: spread.spreadIndex,
      maxImageEdge,
      jpegQuality,
      minSourceEdge,
      gutter: interiorGutter,
    })
    interiorSpreadOutput = {
      width: composed.width,
      height: composed.height,
      gutter: composed.gutter,
    }
    const image = await pdf.embedJpg(composed.buffer)
    const pdfPage = pdf.addPage([composed.width, composed.height])
    pdfPage.drawImage(image, { x: 0, y: 0, width: composed.width, height: composed.height })
  }

  if (pdf.getPageCount() !== plan.expectedPdfPageCount) {
    throw new StructuredFinalPdfError('Structured Final PDF emitted an unexpected page count')
  }

  const buffer = Buffer.from(await pdf.save({ useObjectStreams: true }))
  if (buffer.length > maxPdfBytes) {
    throw new StructuredFinalPdfError(
      `Structured Final PDF exceeds the ${maxPdfBytes} byte output limit`
    )
  }
  return {
    buffer,
    pdfPageCount: pdf.getPageCount(),
    sourcePageCount: plan.orderedSourcePageIndices.length,
    expectedPdfPageCount: plan.expectedPdfPageCount,
    orderedSourcePageIndices: plan.orderedSourcePageIndices,
    cover: { width: cover.width, height: cover.height },
    interiorSpread: interiorSpreadOutput,
  }
}
