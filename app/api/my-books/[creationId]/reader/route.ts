import { NextResponse } from 'next/server'
import { getEmptyPurchaseSummary, isFinalJobReleased, loadPurchaseSummaryByCreation } from '@/lib/purchase-state'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createSignedStorageUrlMap } from '@/lib/storage-signing'

const MY_BOOK_READER_CACHE_CONTROL = 'private, no-store, max-age=0'
const STORAGE_BUCKET = 'raw-private'

type Owner = {
  ownerType: 'customer' | 'anon'
  ownerId: string
}

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
  pdf_path: string | null
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

function privateJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init)
  response.headers.set('Cache-Control', MY_BOOK_READER_CACHE_CONTROL)
  return response
}

function getCookieValue(cookies: string, name: string) {
  const entry = cookies
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
  return entry ? entry.split('=')[1] : null
}

function resolveOwner(request: Request, customerId: string | null): Owner | null {
  if (customerId) {
    return { ownerType: 'customer', ownerId: customerId }
  }
  const cookies = request.headers.get('cookie') || ''
  const anonSessionId = getCookieValue(cookies, 'ymi_anon_session')
  if (!anonSessionId) return null
  return { ownerType: 'anon', ownerId: anonSessionId }
}

// Supabase query builders have very deep generated types here; keep this helper dynamic.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildOwnerScopedQuery(query: any, owner: Owner): any {
  if (owner.ownerType === 'customer') {
    return query.eq('owner_type', 'customer').eq('customer_id', owner.ownerId)
  }
  return query.eq('owner_type', 'anon').eq('anon_session_id', owner.ownerId)
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
  const customerId = url.searchParams.get('customerId')
  const owner = resolveOwner(request, customerId)
  if (!owner) {
    return privateJson({ error: 'Reader access requires the current session' }, { status: 401 })
  }

  const scopedCreationQuery = buildOwnerScopedQuery(
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
            price_cents,
            compare_at_price_cents,
            discount_percent,
            is_discount
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

  const purchaseSummary =
    (await loadPurchaseSummaryByCreation([creationId])).get(creationId) ?? getEmptyPurchaseSummary()
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
      },
      { status: 403 }
    )
  }

  const { data: finalJobs, error: finalJobsError } = await supabaseAdmin
    .from('final_jobs')
    .select(
      'final_job_id, job_id, order_id, cart_item_id, creation_id, template_id, status, review_status, total_pages, approved_pages, pdf_path, released_at, created_at'
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
      finalJob: {
        finalJobId: finalJob.final_job_id,
        status: finalJob.status,
        reviewStatus: finalJob.review_status,
        releasedAt: finalJob.released_at ?? null,
      },
      pages: [],
    })
  }

  const signedPages = await createSignedStorageUrlMap(
    [
      ...(previewCoverPath
        ? [{ key: 'cover', bucket: previewCoverBucket, path: previewCoverPath, expiresIn: 60 * 60 }]
        : []),
      ...readyPages.map((page) => ({
        key: String(page.page_index),
        bucket: STORAGE_BUCKET,
        path: page.approved_output_path,
        expiresIn: 60 * 60,
      })),
    ]
  )

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
      coverUrl: signedPages.get('cover') ?? null,
    },
    latestOrderId: purchaseSummary.latestOrderId,
    latestOrderDisplayId: purchaseSummary.latestOrderDisplayId,
    latestOrderStatus: purchaseSummary.latestOrderStatus,
    finalJob: {
      finalJobId: finalJob.final_job_id,
      status: finalJob.status,
      reviewStatus: finalJob.review_status,
      releasedAt: finalJob.released_at ?? null,
      pdfPath: finalJob.pdf_path ?? null,
    },
    pages: readyPages.map((page) => ({
      pageIndex: page.page_index,
      status: page.status,
      url: signedPages.get(String(page.page_index)) ?? null,
    })),
  })
}
