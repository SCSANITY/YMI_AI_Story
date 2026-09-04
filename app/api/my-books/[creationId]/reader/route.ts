import {
  noStoreJson as privateJson,
  PRIVATE_NO_STORE_CACHE_CONTROL,
} from '@/lib/http-response'
import { getEmptyPurchaseSummary, isFinalJobReleased, loadPurchaseSummaryByCreation } from '@/lib/purchase-state'
import { buildReleasedReaderContract, type ReleasedReaderContract } from '@/lib/reader-page-contract'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createSignedStorageUrlMap } from '@/lib/storage-signing'
import {
  checkoutOwnerErrorResponse,
  resolveCheckoutOwner,
  scopeCheckoutOwnerQuery,
} from '@/lib/checkout-owner'

const STORAGE_BUCKET = 'raw-private'

type FinalJobRow = {
  final_job_id: string
  job_id: string
  order_id: string
  cart_item_id: string
  creation_id: string | null
  template_id: string
  status: string | null
  review_status: string | null
  total_pages: number | null
  approved_pages: number | null
  released_at: string | null
  created_at: string | null
}

type FinalPageRow = {
  page_index: number
  status: string | null
  approved_output_path: string | null
}

type PreviewJobOutputAssets = {
  bucket?: string | null
  pages?: Array<{
    page_index: number
    storage_path?: string | null
    storage_path_full?: string | null
  }>
}

function pickLatestFinalJob(finalJobs: FinalJobRow[]) {
  return finalJobs
    .slice()
    .sort((a, b) => {
      const aReady = Number(isFinalJobReleased(a))
      const bReady = Number(isFinalJobReleased(b))
      if (aReady !== bReady) return bReady - aReady
      const aTime = Date.parse(String(a.created_at || '')) || 0
      const bTime = Date.parse(String(b.created_at || '')) || 0
      return bTime - aTime
    })[0]
}

export async function GET(
  request: Request,
  context: { params: Promise<{ creationId: string }> }
) {
  const { creationId } = await context.params
  if (!creationId) {
    return privateJson({ error: 'Missing creationId' }, { status: 400 })
  }

  const url = new URL(request.url)
  let owner
  try {
    owner = await resolveCheckoutOwner(request, {
      expectedCustomerId: url.searchParams.get('customerId'),
    })
  } catch (error) {
    const response = checkoutOwnerErrorResponse(error)
    if (response) {
      response.headers.set('Cache-Control', PRIVATE_NO_STORE_CACHE_CONTROL)
      return response
    }
    return privateJson({ error: 'Failed to resolve owner' }, { status: 500 })
  }
  if (!owner) return privateJson({ error: 'Reader access requires the current session' }, { status: 401 })

  const scopedCreationQuery = scopeCheckoutOwnerQuery(
    supabaseAdmin
      .from('creations')
      .select(
        `
          creation_id,
          template_id,
          customize_snapshot,
          preview_job_id,
          created_at,
          templates:templates (
            template_id,
            name,
            description,
            cover_image_path,
            normalized_cover_image_path,
            story_type,
            package_prices:template_package_prices(
              package_type,
              list_price_usd,
              sale_price_usd,
              display_discount_percent,
              row_version,
              updated_at
            )
          )
        `
      )
      .eq('creation_id', creationId),
    owner
  )
  const { data: creation, error: creationError } = await scopedCreationQuery.maybeSingle()

  if (creationError || !creation?.creation_id) {
    return privateJson({ error: 'Creation not found' }, { status: 404 })
  }

  let purchaseSummary
  try {
    purchaseSummary =
      (await loadPurchaseSummaryByCreation([creationId])).get(creationId) ?? getEmptyPurchaseSummary()
  } catch (error) {
    console.error('[my-books-reader] Failed to load purchase state', error)
    return privateJson({ error: 'Failed to load purchase state' }, { status: 500 })
  }
  const purchaseState = purchaseSummary.purchaseState

  if (purchaseState !== 'purchased') {
    return privateJson(
      {
        eligible: false,
        purchaseState,
        reason: purchaseState === 'refunded' ? 'refunded' : 'not_purchased',
        creation: {
          creationId: creation.creation_id,
          templateId: creation.template_id,
          template: creation.templates ?? null,
        },
        latestOrderId: purchaseSummary.latestOrderId,
        latestOrderDisplayId: purchaseSummary.latestOrderDisplayId,
        latestOrderStatus: purchaseSummary.latestOrderStatus,
        latestPackageType: purchaseSummary.latestPackageType,
      },
      { status: 403 }
    )
  }

  const { data: finalJobs, error: finalJobsError } = await supabaseAdmin
    .from('final_jobs')
    .select(
      'final_job_id, job_id, order_id, cart_item_id, creation_id, template_id, status, review_status, total_pages, approved_pages, released_at, created_at'
    )
    .eq('creation_id', creationId)

  const { data: previewJob } = creation.preview_job_id
    ? await supabaseAdmin
        .from('jobs')
        .select('output_assets')
        .eq('job_id', creation.preview_job_id)
        .eq('job_type', 'preview')
        .maybeSingle()
    : { data: null }

  const previewAssets = (previewJob?.output_assets ?? null) as PreviewJobOutputAssets | null
  const previewCoverPage = previewAssets?.pages?.find((page) => page.page_index === 0)
  const previewCoverPath = previewCoverPage?.storage_path_full || previewCoverPage?.storage_path || null
  const previewCoverBucket = previewAssets?.bucket || STORAGE_BUCKET

  const signPreviewCover = async () => {
    if (!previewCoverPath) return null
    const signedCover = await createSignedStorageUrlMap([
      {
        key: 'cover',
        bucket: previewCoverBucket,
        path: previewCoverPath,
        expiresIn: 60 * 60,
      },
    ])
    return signedCover.get('cover') ?? null
  }

  if (finalJobsError) {
    return privateJson({ error: 'Failed to load final job' }, { status: 500 })
  }

  const finalJob = pickLatestFinalJob((finalJobs ?? []) as FinalJobRow[])
  const finalReady = isFinalJobReleased(finalJob)
  if (!finalJob || !finalReady) {
    const coverUrl = await signPreviewCover()
    return privateJson({
      eligible: true,
      purchaseState,
      finalReady: false,
      reason: 'preparing',
      creation: {
        creationId: creation.creation_id,
        templateId: creation.template_id,
        previewJobId: creation.preview_job_id ?? null,
        template: creation.templates ?? null,
        customizeSnapshot: creation.customize_snapshot ?? {},
        coverUrl,
      },
      latestOrderId: purchaseSummary.latestOrderId,
      latestOrderDisplayId: purchaseSummary.latestOrderDisplayId,
      latestOrderStatus: purchaseSummary.latestOrderStatus,
      latestPackageType: purchaseSummary.latestPackageType,
      finalJob: finalJob
        ? {
            finalJobId: finalJob.final_job_id,
            status: finalJob.status,
            reviewStatus: finalJob.review_status,
            releasedAt: finalJob.released_at ?? null,
          }
        : null,
      pages: [],
    })
  }

  const { data: pages, error: pagesError } = await supabaseAdmin
    .from('final_job_pages')
    .select('page_index, status, approved_output_path')
    .eq('final_job_id', finalJob.final_job_id)
    .order('page_index', { ascending: true })

  if (pagesError) {
    return privateJson({ error: 'Failed to load final pages' }, { status: 500 })
  }

  const readyPages = ((pages ?? []) as FinalPageRow[]).filter(
    (page): page is FinalPageRow & { approved_output_path: string } => Boolean(page.approved_output_path)
  )
  if (!readyPages.length || readyPages.length < Number(finalJob.total_pages ?? 0)) {
    const coverUrl = await signPreviewCover()
    return privateJson({
      eligible: true,
      purchaseState,
      finalReady: false,
      reason: 'final_pages_not_ready',
      creation: {
        creationId: creation.creation_id,
        templateId: creation.template_id,
        previewJobId: creation.preview_job_id ?? null,
        template: creation.templates ?? null,
        customizeSnapshot: creation.customize_snapshot ?? {},
        coverUrl,
      },
      latestOrderId: purchaseSummary.latestOrderId,
      latestOrderDisplayId: purchaseSummary.latestOrderDisplayId,
      latestOrderStatus: purchaseSummary.latestOrderStatus,
      latestPackageType: purchaseSummary.latestPackageType,
      finalJob: {
        finalJobId: finalJob.final_job_id,
        status: finalJob.status,
        reviewStatus: finalJob.review_status,
        releasedAt: finalJob.released_at ?? null,
      },
      pages: [],
    })
  }

  const { data: linkedJob, error: linkedJobError } = await supabaseAdmin
    .from('jobs')
    .select('output_assets')
    .eq('job_id', finalJob.job_id)
    .eq('job_type', 'final')
    .maybeSingle()

  if (linkedJobError) {
    return privateJson({ error: 'Failed to load final page metadata' }, { status: 500 })
  }

  let releasedContract: ReleasedReaderContract
  try {
    releasedContract = buildReleasedReaderContract({
      outputAssets: linkedJob?.output_assets ?? null,
      approvedPages: readyPages.map((page) => ({
        pageIndex: page.page_index,
        status: page.status,
        approvedPath: page.approved_output_path,
      })),
      totalPages: Number(finalJob.total_pages ?? 0),
    })
  } catch (error) {
    console.error('[my-books-reader] Invalid released Final contract', {
      creationId,
      finalJobId: finalJob.final_job_id,
      error,
    })
    return privateJson({ error: 'Released book page contract is invalid' }, { status: 500 })
  }

  const signedPages = await createSignedStorageUrlMap(
    releasedContract.pages.map((page) => ({
        key: `page:${page.pageIndex}`,
        bucket: STORAGE_BUCKET,
        path: page.approvedPath,
        expiresIn: 60 * 60,
      }))
  )

  const signedReaderPages = releasedContract.pages.map((page) => ({
    pageIndex: page.pageIndex,
    status: page.status,
    url: signedPages.get(`page:${page.pageIndex}`) ?? null,
    outputOrder: page.outputOrder,
    role: page.role,
    spreadIndex: page.spreadIndex,
    side: page.side,
    pageNumber: page.pageNumber,
  }))
  if (signedReaderPages.some((page) => !page.url)) {
    return privateJson({ error: 'Failed to sign released book pages' }, { status: 500 })
  }
  const finalCoverUrl = signedPages.get(`page:${releasedContract.frontCoverPageIndex}`) ?? null
  if (!finalCoverUrl) {
    return privateJson({ error: 'Failed to sign released book cover' }, { status: 500 })
  }

  return privateJson({
    eligible: true,
    purchaseState,
    finalReady: true,
    creation: {
      creationId: creation.creation_id,
      templateId: creation.template_id,
      previewJobId: creation.preview_job_id ?? null,
      template: creation.templates ?? null,
      customizeSnapshot: creation.customize_snapshot ?? {},
      coverUrl: finalCoverUrl,
    },
    latestOrderId: purchaseSummary.latestOrderId,
    latestOrderDisplayId: purchaseSummary.latestOrderDisplayId,
    latestOrderStatus: purchaseSummary.latestOrderStatus,
    latestPackageType: purchaseSummary.latestPackageType,
    finalJob: {
      finalJobId: finalJob.final_job_id,
      status: finalJob.status,
      reviewStatus: finalJob.review_status,
      releasedAt: finalJob.released_at ?? null,
    },
    schemaVersion: 3,
    assetLayout: 'single-page',
    pages: signedReaderPages,
  })
}
