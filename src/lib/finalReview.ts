import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { sendOrderDeliveryEmail } from '@/lib/email'
import {
  assertFinalOutputAssetsReleasable,
  isStructuredFinalOutputAssets,
  isStructuredFinalPdfReleaseProofValid,
  mergeApprovedFinalOutputPages,
  readStructuredFinalPdfReleaseProof,
} from '@/lib/finalReleaseContract'
import {
  buildFinalPdfReleaseArtifact,
  getFinalPdfPreviewImagePath,
  type ApprovedFinalPdfPage,
} from '@/lib/finalPdfRelease'
import { advanceOrdersToProductionAfterPdfRelease } from '@/lib/order-production-transition-store'
import {
  buildPersonalizedBookPdfFileName,
  resolveFinalJobDisplayTitle,
} from '@/lib/personalized-book-title'
import { isFinalJobReleased } from '@/lib/purchase-state'
import type { ManualPrintArtifactClient } from '@/lib/manual-print-artifact'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const STORAGE_BUCKET = 'raw-private'
const FINAL_PDF_TTL_SECONDS = 60 * 60 * 24
const FINAL_PDF_MAX_IMAGE_EDGE = Number(process.env.FINAL_PDF_MAX_IMAGE_EDGE || 1800)
const FINAL_PDF_JPEG_QUALITY = Number(process.env.FINAL_PDF_JPEG_QUALITY || 82)

export type FinalReleaseMode = 'manual' | 'job_auto' | 'story_auto' | 'global_auto'

export type FinalJobSummary = {
  final_job_id: string
  job_id: string
  order_id: string
  cart_item_id: string
  creation_id: string | null
  template_id: string
  display_title: string
  status: string
  review_status: string
  total_pages: number
  approved_pages: number
  release_mode: FinalReleaseMode
  released_at: string | null
  email_sent_at: string | null
  print_status: 'locked' | 'pending' | 'in_review' | 'ready' | 'released'
  print_completed_pages: number
  print_released_at: string | null
  print_package_artifact_id?: string | null
  error_message: string | null
  created_at: string
  updated_at: string
  orders?: {
    display_id: string | null
    email: string | null
    order_status: string | null
  } | null
}

export type FinalJobPageRow = {
  final_job_page_id: string
  page_index: number
  output_order: number | null
  role: 'final_back_cover' | 'final_front_cover' | 'final_interior' | null
  spread_index: number | null
  side: 'left' | 'right' | null
  page_number: number | null
  status: string
  approved_source: 'ai' | 'manual' | null
  provider_request_id: string | null
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  review_intent_id?: string | null
  review_intent_type?: 'approve' | 'needs_fix' | 'approve_all' | null
  review_intent_at?: string | null
  attempt_count: number
  error_message: string | null
  created_at: string
  updated_at: string
  has_ai_output: boolean
  has_manual_output: boolean
  has_approved_output: boolean
  ai_url?: string | null
  manual_url?: string | null
  approved_url?: string | null
}

export type FinalPageContractSummary = {
  schema_version: 2 | null
  asset_layout: 'single-page' | null
}

export type FinalJobDetail = {
  finalJob: FinalJobSummary
  page_contract: FinalPageContractSummary
  pages: FinalJobPageRow[]
  print_artifact: ManualPrintArtifactClient | null
}

function isPngBuffer(buffer: Buffer) {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
}

function isJpegBuffer(buffer: Buffer) {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
}

export function getFinalPagePath(orderId: string, pageNumber: number) {
  return `orders/${orderId}/final/pages/approved/page_${String(pageNumber).padStart(2, '0')}.png`
}

export function getFinalPageAiPath(orderId: string, pageNumber: number) {
  return `orders/${orderId}/final/pages/ai/page_${String(pageNumber).padStart(2, '0')}.png`
}

export function getFinalPageManualPath(orderId: string, pageNumber: number) {
  return `orders/${orderId}/final/pages/manual/page_${String(pageNumber).padStart(2, '0')}.png`
}

export function getFinalPdfPath(orderId: string) {
  return `orders/${orderId}/final/pdf/final.pdf`
}

export async function downloadStorageBuffer(path: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).download(path)
  if (error || !data) {
    throw new Error(error?.message || `Failed to download ${path}`)
  }
  return Buffer.from(await data.arrayBuffer())
}

async function embedPageImage(pdf: PDFDocument, buffer: Buffer) {
  if (isPngBuffer(buffer)) return pdf.embedPng(buffer)
  if (isJpegBuffer(buffer)) return pdf.embedJpg(buffer)
  throw new Error('Unsupported image format for PDF export')
}

async function prepareImageForCustomerPdf(buffer: Buffer) {
  const image = sharp(buffer, { failOn: 'none' }).rotate()
  const metadata = await image.metadata()
  const width = Number(metadata.width || 0)
  const height = Number(metadata.height || 0)
  if (!width || !height) {
    throw new Error('Invalid image dimensions for PDF export')
  }

  const maxEdge = Math.max(1, FINAL_PDF_MAX_IMAGE_EDGE)
  const shouldResize = Math.max(width, height) > maxEdge
  const outputBuffer = await image
    .resize({
      width: shouldResize && width >= height ? maxEdge : undefined,
      height: shouldResize && height > width ? maxEdge : undefined,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .flatten({ background: '#ffffff' })
    .jpeg({
      quality: Math.min(95, Math.max(60, FINAL_PDF_JPEG_QUALITY)),
      mozjpeg: true,
    })
    .toBuffer()

  const outputMeta = await sharp(outputBuffer).metadata()
  return {
    buffer: outputBuffer,
    width: Number(outputMeta.width || 0),
    height: Number(outputMeta.height || 0),
  }
}

export async function buildFinalPdfFromPaths(paths: string[]): Promise<Buffer> {
  if (!paths.length) {
    throw new Error('No approved page images available for PDF export')
  }

  const pdf = await PDFDocument.create()
  for (const path of paths) {
    const originalBuffer = await downloadStorageBuffer(path)
    const prepared = await prepareImageForCustomerPdf(originalBuffer)
    const image = await embedPageImage(pdf, prepared.buffer)
    const width = image.width || prepared.width || 0
    const height = image.height || prepared.height || 0
    if (!width || !height) {
      throw new Error(`Invalid image dimensions for ${path}`)
    }
    const page = pdf.addPage([width, height])
    page.drawImage(image, { x: 0, y: 0, width, height })
  }

  return Buffer.from(await pdf.save())
}

export async function signStorageUrl(path: string | null, ttlSeconds = FINAL_PDF_TTL_SECONDS) {
  if (!path) return null
  const { data } = await supabaseAdmin.storage.from(STORAGE_BUCKET).createSignedUrl(path, ttlSeconds)
  return data?.signedUrl ?? null
}

export async function refreshFinalJobApprovalState(finalJobId: string) {
  const { data: finalJob } = await supabaseAdmin
    .from('final_jobs')
    .select('total_pages')
    .eq('final_job_id', finalJobId)
    .maybeSingle()

  const { count } = await supabaseAdmin
    .from('final_job_pages')
    .select('final_job_page_id', { count: 'exact', head: true })
    .eq('final_job_id', finalJobId)
    .in('status', ['approved', 'replaced'])
    .not('approved_output_path', 'is', null)

  const approvedCount = count ?? 0
  const totalPages = Number(finalJob?.total_pages ?? 0)
  const reviewStatus =
    totalPages > 0 && approvedCount >= totalPages ? 'approved' : approvedCount > 0 ? 'in_review' : 'pending'

  const { error } = await supabaseAdmin
    .from('final_jobs')
    .update({
      approved_pages: approvedCount,
      review_status: reviewStatus,
      status: 'review_pending',
      ...(reviewStatus === 'approved' ? { error_message: null } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('final_job_id', finalJobId)

  if (error) {
    throw new Error(error.message || 'Failed to refresh final job approval state')
  }
}

export async function releaseFinalJob(params: {
  finalJobId: string
  releaseMode: FinalReleaseMode
  approvedByCustomerId?: string | null
}) {
  const { finalJobId, releaseMode, approvedByCustomerId = null } = params

  const { data: finalJob, error: finalJobError } = await supabaseAdmin
    .from('final_jobs')
    .select(
      `
        final_job_id,
        job_id,
        order_id,
        cart_item_id,
        creation_id,
        template_id,
        status,
        review_status,
        total_pages,
        approved_pages,
        release_mode,
        pdf_path,
        released_at,
        email_sent_at,
        print_status,
        print_completed_pages,
        print_released_at,
        print_package_path,
        error_message,
        creations:creations(
          customize_snapshot,
          templates:templates(name)
        )
      `
    )
    .eq('final_job_id', finalJobId)
    .maybeSingle()

  if (finalJobError || !finalJob?.final_job_id) {
    throw new Error(finalJobError?.message || 'Final job not found')
  }

  const { data: linkedJob, error: linkedJobError } = await supabaseAdmin
    .from('jobs')
    .select('output_assets')
    .eq('job_id', finalJob.job_id)
    .maybeSingle()
  if (linkedJobError) {
    throw new Error(linkedJobError.message || 'Failed to load linked Final job output assets')
  }
  const linkedOutputAssets =
    linkedJob?.output_assets && typeof linkedJob.output_assets === 'object'
      ? (linkedJob.output_assets as Record<string, unknown>)
      : {}
  const alreadyPdfReleased = isFinalJobReleased(finalJob)
  if (alreadyPdfReleased && finalJob.email_sent_at) {
    const structuredProof = isStructuredFinalOutputAssets(linkedOutputAssets)
      ? readStructuredFinalPdfReleaseProof(linkedOutputAssets)
      : null
    assertFinalOutputAssetsReleasable(linkedOutputAssets, structuredProof)
    await advanceOrdersToProductionAfterPdfRelease({
      jobId: finalJob.job_id,
      orderIds: [finalJob.order_id],
      changedByAdminId: approvedByCustomerId,
    })
    return {
      finalJobId,
      pdfPath: finalJob.pdf_path,
      releaseMode: finalJob.release_mode,
      releasedAt: finalJob.released_at,
      emailSentAt: finalJob.email_sent_at,
      approvedPages: Number(finalJob.approved_pages || 0),
      alreadyReleased: true,
    }
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('display_id, email, order_status')
    .eq('order_id', finalJob.order_id)
    .maybeSingle()

  if (orderError || !order) {
    throw new Error(orderError?.message || 'Order not found for final release')
  }

  const { data: pages, error: pagesError } = await supabaseAdmin
    .from('final_job_pages')
    .select(
      'final_job_page_id, page_index, status, ai_output_path, manual_output_path, approved_output_path, approved_source'
    )
    .eq('final_job_id', finalJobId)
    .order('page_index', { ascending: true })

  if (pagesError || !pages?.length) {
    throw new Error(pagesError?.message || 'Final job pages not found')
  }
  const expectedTotalPages = Number(finalJob.total_pages || 0)
  if (expectedTotalPages <= 0 || pages.length !== expectedTotalPages) {
    throw new Error(
      `Final page count mismatch (expected=${expectedTotalPages}; review_rows=${pages.length})`
    )
  }

  const approvedPages: ApprovedFinalPdfPage[] = []
  for (const page of pages) {
    if (!page.approved_output_path) {
      throw new Error(`Missing approved output for final page ${page.page_index}`)
    }
    if (page.status !== 'approved' && page.status !== 'replaced') {
      throw new Error(`Page ${page.page_index} is not approved`)
    }
    approvedPages.push({
      page_index: page.page_index,
      approved_output_path: page.approved_output_path,
    })
  }

  const pdfPath = finalJob.pdf_path || getFinalPdfPath(finalJob.order_id)
  const now = new Date().toISOString()
  const reviewedOutputAssets: Record<string, unknown> = {
    ...linkedOutputAssets,
    pages: mergeApprovedFinalOutputPages(linkedOutputAssets, approvedPages),
  }
  const isStructuredOutput = isStructuredFinalOutputAssets(reviewedOutputAssets)
  const persistedStructuredProof = isStructuredOutput
    ? readStructuredFinalPdfReleaseProof(linkedOutputAssets)
    : null
  const canReuseExistingPdf = Boolean(
    alreadyPdfReleased &&
      finalJob.pdf_path &&
      (!isStructuredOutput ||
        isStructuredFinalPdfReleaseProofValid(reviewedOutputAssets, persistedStructuredProof))
  )
  let releaseOutputAssets: Record<string, unknown> = reviewedOutputAssets
  let previewPath = getFinalPdfPreviewImagePath(reviewedOutputAssets, approvedPages)

  if (!canReuseExistingPdf) {
    const artifact = await buildFinalPdfReleaseArtifact({
      outputAssets: linkedOutputAssets,
      totalPages: expectedTotalPages,
      approvedPages,
      loadApprovedPage: (path) => downloadStorageBuffer(path),
      buildLegacyPdf: buildFinalPdfFromPaths,
    })
    releaseOutputAssets = artifact.outputAssets
    previewPath = artifact.previewImagePath
    const { error: uploadError } = await supabaseAdmin.storage.from(STORAGE_BUCKET).upload(pdfPath, artifact.buffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

    if (uploadError) {
      throw new Error(uploadError.message || 'Failed to upload final PDF')
    }
  } else {
    assertFinalOutputAssetsReleasable(reviewedOutputAssets, persistedStructuredProof)
  }

  if (!alreadyPdfReleased) {
    const { error: finalJobUpdateError } = await supabaseAdmin
      .from('final_jobs')
      .update({
        status: 'completed',
        review_status: 'released',
        release_mode: releaseMode,
        approved_pages: pages.length,
        pdf_path: pdfPath,
        released_at: now,
        print_status: 'pending',
        error_message: null,
        updated_at: now,
      })
      .eq('final_job_id', finalJobId)

    if (finalJobUpdateError) {
      throw new Error(finalJobUpdateError.message || 'Failed to update final job release state')
    }
  }

  const { error: jobsUpdateError } = await supabaseAdmin
    .from('jobs')
    .update({
      status: 'done',
      progress: 100,
      output_assets: {
        ...releaseOutputAssets,
        bucket: STORAGE_BUCKET,
        pdf_path: pdfPath,
      },
      updated_at: now,
    })
    .eq('job_id', finalJob.job_id)

  if (jobsUpdateError) {
    throw new Error(jobsUpdateError.message || 'Failed to update worker job output')
  }

  const { error: approvedPagesError } = await supabaseAdmin
    .from('final_job_pages')
    .update({
      reviewed_by: approvedByCustomerId,
      reviewed_at: now,
      updated_at: now,
    })
    .eq('final_job_id', finalJobId)

  if (approvedPagesError) {
    throw new Error(approvedPagesError.message || 'Failed to stamp release review metadata')
  }

  const orderEmail = order.email || null
  if (!orderEmail) {
    throw new Error('Missing order email for final release')
  }

  const displayTitle = resolveFinalJobDisplayTitle(finalJob)
  const downloadFileName = buildPersonalizedBookPdfFileName(displayTitle)
  const { data: signedPdf, error: signedPdfError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(pdfPath, FINAL_PDF_TTL_SECONDS, { download: downloadFileName })

  if (signedPdfError || !signedPdf?.signedUrl) {
    throw new Error(signedPdfError?.message || 'Failed to create signed PDF url')
  }

  // Cover thumbnail must outlive the 24h PDF link — the email may be opened weeks
  // later, and a broken cover looks worse than a missing one. 1-year signed URL.
  const previewImageUrl = previewPath ? await signStorageUrl(previewPath, 60 * 60 * 24 * 365) : null
  let emailSentAt = finalJob.email_sent_at || null

  try {
    const emailResult = await sendOrderDeliveryEmail({
      to: orderEmail,
      orderId: finalJob.order_id,
      displayId: order.display_id ?? null,
      finalJobId,
      downloadUrl: signedPdf.signedUrl,
      previewImageUrl: previewImageUrl ?? undefined,
      retryFailed: true,
    })

    const eventStatus = emailResult.event?.status ?? null
    if (!emailResult.skipped || eventStatus === 'sent') {
      emailSentAt = new Date().toISOString()
      const { error: emailUpdateError } = await supabaseAdmin
        .from('final_jobs')
        .update({
          email_sent_at: emailSentAt,
          updated_at: emailSentAt,
        })
        .eq('final_job_id', finalJobId)

      if (emailUpdateError) {
        throw new Error(emailUpdateError.message || 'Failed to update final job email state')
      }
    }
  } catch (error) {
    console.error('[email] final delivery failed', { finalJobId, orderId: finalJob.order_id, error })
  }

  await advanceOrdersToProductionAfterPdfRelease({
    jobId: finalJob.job_id,
    orderIds: [finalJob.order_id],
    changedByAdminId: approvedByCustomerId,
  })

  return {
    finalJobId,
    pdfPath,
    releaseMode: alreadyPdfReleased ? finalJob.release_mode : releaseMode,
    releasedAt: finalJob.released_at || now,
    emailSentAt,
    approvedPages: pages.length,
    alreadyReleased: alreadyPdfReleased,
  }
}
