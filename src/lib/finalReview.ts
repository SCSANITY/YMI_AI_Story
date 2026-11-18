import { FINAL_PDF_DELIVERY_LINK_TTL_SECONDS, sendOrderDeliveryEmail } from '@/lib/email'
import {
  assertFinalOutputAssetsReleasable,
  readStructuredFinalPdfReleaseProof,
} from '@/lib/finalReleaseContract'
import {
  buildFinalPdfReleaseArtifact,
  getFinalPdfPreviewImagePath,
  type ApprovedFinalPdfPage,
} from '@/lib/finalPdfRelease'
import {
  FinalArtifactConflict,
  getNewFinalPdfReleasePath,
  isLegacyFinalManualPage,
  isScopedFinalApprovedPage,
  isScopedFinalPdf,
} from '@/lib/final-review-artifact-paths'
import { hasSingleFinalOrderLine } from '@/lib/final-review-batch-approval'
import { advanceOrdersToProductionAfterPdfRelease } from '@/lib/order-production-transition-store'
import {
  buildPersonalizedBookPdfFileName,
  resolveFinalJobDisplayTitle,
} from '@/lib/personalized-book-title'
import { isFinalJobReleased } from '@/lib/purchase-state'
import type { ManualPrintArtifactClient } from '@/lib/manual-print-artifact'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { FinalProductionMode } from '@/lib/final-production'

const STORAGE_BUCKET = 'raw-private'
const FINAL_REVIEW_ASSET_TTL_SECONDS = 60 * 60 * 24

export type FinalReleaseMode = 'manual' | 'job_auto' | 'story_auto' | 'global_auto'

export type FinalJobSummary = {
  production_mode?: FinalProductionMode
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
  role: 'final_front_cover' | 'final_interior' | null
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
  schema_version: 3 | null
  asset_layout: 'single-page' | null
}

export type FinalJobDetail = {
  finalJob: FinalJobSummary
  purchased_edition: import('@/types').BookPackageType | null
  page_contract: FinalPageContractSummary
  pages: FinalJobPageRow[]
  print_artifact: ManualPrintArtifactClient | null
  dedication_snapshot: { decision: 'skipped' | 'confirmed'; body: string | null;revision:number } | null
}

async function downloadStorageBuffer(path: string): Promise<Buffer> {
  const { data, error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).download(path)
  if (error || !data) {
    throw new Error(error?.message || `Failed to download ${path}`)
  }
  return Buffer.from(await data.arrayBuffer())
}

async function signStorageUrl(path: string | null, ttlSeconds = FINAL_REVIEW_ASSET_TTL_SECONDS) {
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
    .is('released_at', null)
    .neq('review_status', 'released')

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
    const structuredProof = readStructuredFinalPdfReleaseProof(linkedOutputAssets)
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
    .select('display_id, email, order_status, first_name:shipping_address->>firstName')
    .eq('order_id', finalJob.order_id)
    .maybeSingle()

  if (orderError || !order) {
    throw new Error(orderError?.message || 'Order not found for final release')
  }

  const orderEmail = order.email || null
  if (!orderEmail) {
    throw new Error('Missing order email for final release')
  }

  const scope = { orderId: finalJob.order_id, finalJobId }
  const now = new Date().toISOString()
  let pdfPath: string
  let previewPath: string | null
  let approvedPageCount: number

  if (alreadyPdfReleased) {
    // An email retry can sign the published object, but it can never rebuild it.
    const savedPath = finalJob.pdf_path
    const trustedLegacy = savedPath === 'orders/' + scope.orderId + '/final/pdf/final.pdf' &&
      await hasSingleFinalOrderLine(scope.orderId, finalJob.cart_item_id)
    if (!savedPath || (!isScopedFinalPdf(scope, savedPath) && !trustedLegacy) ||
        linkedOutputAssets.pdf_path !== savedPath || linkedOutputAssets.bucket !== STORAGE_BUCKET) {
      throw new FinalArtifactConflict('Published PDF ownership cannot be verified. Verify the saved PDF before retrying email.')
    }
    try {
      assertFinalOutputAssetsReleasable(linkedOutputAssets, readStructuredFinalPdfReleaseProof(linkedOutputAssets))
    } catch {
      throw new FinalArtifactConflict('Published PDF composition cannot be verified. Do not regenerate or resend it until it has been checked.')
    }
    pdfPath = savedPath
    previewPath = getFinalPdfPreviewImagePath(linkedOutputAssets, [])
    approvedPageCount = Number(finalJob.approved_pages || 0)
  } else {
    const { data: pages, error: pagesError } = await supabaseAdmin
      .from('final_job_pages')
      .select('page_index, status, manual_output_path, approved_output_path, approved_source')
      .eq('final_job_id', finalJobId)
      .order('page_index', { ascending: true })

    if (pagesError || !pages?.length) {
      throw new Error(pagesError?.message || 'Final job pages not found')
    }
    const expectedTotalPages = Number(finalJob.total_pages || 0)
    if (expectedTotalPages <= 0 || pages.length !== expectedTotalPages) {
      throw new Error('Final page count mismatch (expected=' + expectedTotalPages + '; review_rows=' + pages.length + ')')
    }

    const approvedPages: ApprovedFinalPdfPage[] = []
    for (const page of pages) {
      if (!page.approved_output_path) {
        throw new Error('Missing approved output for final page ' + page.page_index)
      }
      if (page.status !== 'approved' && page.status !== 'replaced') {
        throw new Error('Page ' + page.page_index + ' is not approved')
      }
      const legacyManual = page.approved_source === 'manual' &&
        page.approved_output_path === page.manual_output_path &&
        isLegacyFinalManualPage(scope.orderId, page.approved_output_path)
      if (!isScopedFinalApprovedPage(scope, page.approved_output_path) && !legacyManual) {
        throw new FinalArtifactConflict('Approved image for page ' + page.page_index +
          ' may be shared. Re-approve from a verified source or upload the correct replacement before release.')
      }
      approvedPages.push({
        page_index: page.page_index,
        approved_output_path: page.approved_output_path,
      })
    }

    const artifact = await buildFinalPdfReleaseArtifact({
      outputAssets: linkedOutputAssets,
      totalPages: expectedTotalPages,
      approvedPages,
      loadApprovedPage: (path) => downloadStorageBuffer(path),
    })
    pdfPath = getNewFinalPdfReleasePath(scope)
    previewPath = artifact.previewImagePath
    approvedPageCount = approvedPages.length
    const { error: uploadError } = await supabaseAdmin.storage.from(STORAGE_BUCKET).upload(pdfPath, artifact.buffer, {
      contentType: 'application/pdf',
      upsert: false,
    })
    if (uploadError) {
      throw new Error(uploadError.message || 'Failed to upload final PDF')
    }

    const { data: releasedFinal, error: finalJobUpdateError } = await supabaseAdmin
      .from('final_jobs')
      .update({
        status: 'completed',
        review_status: 'released',
        release_mode: releaseMode,
        approved_pages: approvedPageCount,
        pdf_path: pdfPath,
        released_at: now,
        print_status: 'pending',
        error_message: null,
        updated_at: now,
      })
      .eq('final_job_id', finalJobId)
      .is('released_at', null)
      .neq('review_status', 'released')
      .select('final_job_id')
      .maybeSingle()

    if (finalJobUpdateError) {
      throw new Error(finalJobUpdateError.message || 'Failed to update final job release state')
    }
    if (!releasedFinal?.final_job_id) {
      throw new FinalArtifactConflict('This book was released by another request. Refresh before retrying delivery.')
    }

    const releaseOutputAssets = artifact.outputAssets
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
  }

  const displayTitle = resolveFinalJobDisplayTitle(finalJob)
  const downloadFileName = buildPersonalizedBookPdfFileName(displayTitle)
  const { data: signedPdf, error: signedPdfError } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(pdfPath, FINAL_PDF_DELIVERY_LINK_TTL_SECONDS, { download: downloadFileName })

  if (signedPdfError || !signedPdf?.signedUrl) {
    throw new Error(signedPdfError?.message || 'Failed to create signed PDF url')
  }

  // Cover thumbnail must outlive the 72h PDF link — the email may be opened weeks
  // later, and a broken cover looks worse than a missing one. 1-year signed URL.
  const previewImageUrl = previewPath ? await signStorageUrl(previewPath, 60 * 60 * 24 * 365) : null
  let emailSentAt = finalJob.email_sent_at || null

  try {
    // Edition-specific copy belongs to the delivered book, not any other item in the order.
    const { data: deliveryItem, error: deliveryItemError } = await supabaseAdmin
      .from('cart_items')
      .select('product_type, package_type')
      .eq('cart_item_id', finalJob.cart_item_id)
      .eq('order_id', finalJob.order_id)
      .maybeSingle()
    const emailResult = await sendOrderDeliveryEmail({
      firstName: order.first_name,
      physicalPackageType: !deliveryItemError && deliveryItem?.product_type === 'physical'
        ? deliveryItem.package_type
        : null,
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
    approvedPages: approvedPageCount,
    alreadyReleased: alreadyPdfReleased,
  }
}
