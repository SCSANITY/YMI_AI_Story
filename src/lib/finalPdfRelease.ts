import {
  assertFinalOutputAssetsReleasable,
  isStructuredFinalOutputAssets,
  mergeApprovedFinalOutputPages,
  type StructuredFinalPdfReleaseProof,
} from '@/lib/finalReleaseContract'
import { buildStructuredFinalPdf } from '@/lib/structuredFinalPdf'

export type ApprovedFinalPdfPage = {
  page_index: number
  approved_output_path: string
}

export type FinalPdfReleaseArtifact = {
  buffer: Buffer
  outputAssets: Record<string, unknown>
  structuredProof: StructuredFinalPdfReleaseProof
  previewImagePath: string | null
}

function asOutputAssets(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function getFinalPdfPreviewImagePath(
  outputAssets: Record<string, unknown>,
  approvedPages: ApprovedFinalPdfPage[]
): string | null {
  if (!isStructuredFinalOutputAssets(outputAssets)) {
    return approvedPages[0]?.approved_output_path ?? null
  }
  if (!Array.isArray(outputAssets.pages)) return null
  const frontCover = outputAssets.pages.find((value) => {
    return value && typeof value === 'object' && !Array.isArray(value) && value.role === 'final_front_cover'
  })
  if (!frontCover || typeof frontCover !== 'object' || !('storage_path' in frontCover)) return null
  return typeof frontCover.storage_path === 'string' ? frontCover.storage_path : null
}

export async function buildFinalPdfReleaseArtifact(args: {
  outputAssets: unknown
  totalPages: number
  approvedPages: ApprovedFinalPdfPage[]
  loadApprovedPage: (path: string, pageIndex: number) => Promise<Buffer>
}): Promise<FinalPdfReleaseArtifact> {
  const linkedOutputAssets = asOutputAssets(args.outputAssets)
  const reviewedPages = mergeApprovedFinalOutputPages(linkedOutputAssets, args.approvedPages)
  const reviewedOutputAssets: Record<string, unknown> = {
    ...linkedOutputAssets,
    pages: reviewedPages,
  }
  const approvedPathByPageIndex = new Map(
    args.approvedPages.map((page) => [page.page_index, page.approved_output_path])
  )

  if (!isStructuredFinalOutputAssets(reviewedOutputAssets)) {
    throw new Error('Final PDF release requires the V3 single-page output contract')
  }
  const result = await buildStructuredFinalPdf({
    outputAssets: reviewedOutputAssets,
    totalPages: args.totalPages,
    pageIndices: args.approvedPages.map((page) => page.page_index),
    loadPage: async (pageIndex) => {
      const path = approvedPathByPageIndex.get(pageIndex)
      if (!path) throw new Error(`Missing approved path for Final page ${pageIndex}`)
      return args.loadApprovedPage(path, pageIndex)
    },
  })
  const structuredProof: StructuredFinalPdfReleaseProof = {
    schema_version: 3,
    mode: 'v3-front-cover-plus-interior-spreads',
    source_page_count: result.sourcePageCount,
    expected_pdf_page_count: result.expectedPdfPageCount,
    pdf_page_count: result.pdfPageCount,
  }
  const outputAssets = {
    ...reviewedOutputAssets,
    pdf_composition: structuredProof,
  }
  assertFinalOutputAssetsReleasable(outputAssets, structuredProof)
  return {
    buffer: result.buffer,
    outputAssets,
    structuredProof,
    previewImagePath: getFinalPdfPreviewImagePath(outputAssets, args.approvedPages),
  }
}
