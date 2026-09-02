import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createSignedStorageUrlMap } from '@/lib/storage-signing'
import { getEmptyPurchaseSummary, loadPurchaseSummaryByCreation } from '@/lib/purchase-state'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  resolveCheckoutOwner,
  type CheckoutOwner,
} from '@/lib/checkout-owner'

const MY_BOOKS_CACHE_CONTROL = 'private, no-store, max-age=0'

type JobOutputAssets = {
  bucket?: string
  pages?: Array<{ page_index: number; storage_path: string; storage_path_full?: string }>
  pdf_path?: string
} | null

// Supabase query builders have very deep generated types here; keep this helper dynamic.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildOwnerScopedQuery(query: any, owner: CheckoutOwner): any {
  const filter = ownerFilter(owner)
  return query.eq('owner_type', filter.owner_type).eq(filter.column, filter.value)
}

function privateJson(body: unknown, init?: { status?: number }) {
  const response = NextResponse.json(body, init)
  response.headers.set('Cache-Control', MY_BOOKS_CACHE_CONTROL)
  return response
}

async function loadCreationsWithArchive(owner: CheckoutOwner) {
  const baseSelect = `
    creation_id,
    template_id,
    customize_snapshot,
    preview_job_id,
    created_at,
    templates:templates (*, package_prices:template_package_prices(package_type,list_price_usd,sale_price_usd,display_discount_percent,row_version,updated_at))
  `

  const archiveSelect = `
    creation_id,
    template_id,
    customize_snapshot,
    preview_job_id,
    created_at,
    is_archived,
    deleted_at,
    templates:templates (*, package_prices:template_package_prices(package_type,list_price_usd,sale_price_usd,display_discount_percent,row_version,updated_at))
  `

  const primaryQuery = buildOwnerScopedQuery(
    supabaseAdmin.from('creations').select(archiveSelect).order('created_at', { ascending: false }),
    owner
  )
  const primary = await primaryQuery

  // Backward compatibility: if DB migration not applied yet, fallback to old select.
  if (primary.error && (primary.error.message?.includes('is_archived') || primary.error.code === '42703')) {
    const fallbackQuery = buildOwnerScopedQuery(
      supabaseAdmin.from('creations').select(baseSelect).order('created_at', { ascending: false }),
      owner
    )
    return await fallbackQuery
  }

  return primary
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  let owner
  try {
    owner = await resolveCheckoutOwner(request, {
      expectedCustomerId: url.searchParams.get('customerId'),
      optional: true,
    })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? NextResponse.json({ error: 'Failed to resolve owner' }, { status: 500 })
  }
  if (!owner) return privateJson({ items: [] })

  const { data: items, error } = await loadCreationsWithArchive(owner)
  if (error) {
    return NextResponse.json({ error: 'Failed to load items' }, { status: 500 })
  }

  const allRows = items ?? []
  let purchaseSummaryByCreation
  try {
    purchaseSummaryByCreation = await loadPurchaseSummaryByCreation(
      allRows.map((row: { creation_id?: string | null }) => String(row.creation_id || '')).filter(Boolean)
    )
  } catch (error) {
    console.error('[my-books] Failed to load purchase state', error)
    return privateJson({ error: 'Failed to load purchase state' }, { status: 500 })
  }
  const visibleRows = allRows.filter((row: { creation_id?: string | null; is_archived?: boolean | null }) => {
    const summary = purchaseSummaryByCreation.get(String(row.creation_id || '')) ?? getEmptyPurchaseSummary()
    return summary.purchaseState !== 'unpurchased' || row?.is_archived !== true
  })
  const jobIds = visibleRows
    .map((row: { preview_job_id?: string | null }) => row.preview_job_id)
    .filter((value: string | null) => Boolean(value))

  const previewUrlMap = new Map<string, string>()

  if (jobIds.length > 0) {
    const { data: jobs, error: jobsError } = await supabaseAdmin
      .from('jobs')
      .select('job_id, output_assets')
      .in('job_id', jobIds as string[])

    if (jobsError) {
      console.error('[my-books] Failed to load Preview covers', jobsError)
      return privateJson({ error: 'Failed to load Preview covers' }, { status: 500 })
    }

    const jobMap = new Map<string, { bucket: string; path: string }>()
    for (const job of jobs ?? []) {
      const outputAssets = job.output_assets as
        | {
            bucket?: string
            pages?: { page_index: number; storage_path: string }[]
          }
        | null
      const bucket = outputAssets?.bucket || 'raw-private'
      const pages = Array.isArray(outputAssets?.pages) ? outputAssets.pages ?? [] : []
      const coverPage = pages.find((page) => page.page_index === 0) ?? pages[0]
      if (coverPage?.storage_path) {
        jobMap.set(job.job_id, { bucket, path: coverPage.storage_path })
      }
    }

    const signedUrls = await createSignedStorageUrlMap(
      Array.from(jobMap.entries()).map(([jobId, info]) => ({
        key: jobId,
        bucket: info.bucket,
        path: info.path,
        expiresIn: 60 * 10,
      }))
    )
    signedUrls.forEach((signedUrl, jobId) => previewUrlMap.set(jobId, signedUrl))
  }

  const enriched = visibleRows.map((row: { creation_id?: string | null; preview_job_id?: string | null }) => {
    const purchaseSummary = purchaseSummaryByCreation.get(String(row.creation_id || '')) ?? getEmptyPurchaseSummary()
    return {
      ...row,
      ...purchaseSummary,
      preview_cover_url: row.preview_job_id ? previewUrlMap.get(row.preview_job_id) ?? null : null,
    }
  })

  return privateJson({ items: enriched })
}

export async function DELETE(request: Request) {
  const body = await request.json()
  const creationId = body?.creationId ?? body?.creation_id

  if (!creationId) {
    return NextResponse.json({ error: 'Missing creationId' }, { status: 400 })
  }

  let owner
  try {
    owner = await resolveCheckoutOwner(request, {
      expectedCustomerId: body?.customerId ?? null,
    })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? NextResponse.json({ error: 'Failed to resolve owner' }, { status: 500 })
  }
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const scopedCreationQuery = buildOwnerScopedQuery(
    supabaseAdmin.from('creations').select('creation_id').eq('creation_id', creationId),
    owner
  )
  const { data: targetCreation } = await scopedCreationQuery.maybeSingle()
  if (!targetCreation?.creation_id) {
    return NextResponse.json({ error: 'Creation not found' }, { status: 404 })
  }

  const scopedCartQuery = buildOwnerScopedQuery(
    supabaseAdmin
      .from('cart_items')
      .select('cart_item_id, status, payment_id, order_id')
      .eq('creation_id', creationId),
    owner
  )
  const { data: cartItems, error: cartError } = await scopedCartQuery
  if (cartError) {
    return NextResponse.json({ error: 'Failed to inspect creation references' }, { status: 500 })
  }

  const linkedItems = cartItems ?? []
  const hasTransactionHistory = linkedItems.some(
    (item: { status?: string | null; payment_id?: string | null; order_id?: string | null }) =>
      item.status === 'ordered' || Boolean(item.payment_id) || Boolean(item.order_id)
  )

  // Scenario A: creation already entered transaction flow -> soft delete only.
  if (hasTransactionHistory) {
    const scopedArchiveQuery = buildOwnerScopedQuery(
      supabaseAdmin
        .from('creations')
        .update({
          is_archived: true,
          deleted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('creation_id', creationId),
      owner
    )
    const { error: archiveError } = await scopedArchiveQuery

    if (archiveError?.message?.includes('is_archived') || archiveError?.code === '42703') {
      return NextResponse.json(
        {
          error: 'Archive columns are missing. Please run the creations soft-delete migration first.',
        },
        { status: 500 }
      )
    }

    if (archiveError) {
      return NextResponse.json({ error: 'Failed to archive creation' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, mode: 'soft' })
  }

  // Scenario B: only draft/cart references -> hard delete + storage cleanup.
  const scopedJobsQuery = buildOwnerScopedQuery(
    supabaseAdmin
      .from('jobs')
      .select('job_id, output_assets')
      .eq('creation_id', creationId),
    owner
  )
  const { data: jobs } = await scopedJobsQuery

  const bucketToPaths = new Map<string, Set<string>>()
  for (const job of jobs ?? []) {
    const outputAssets = job.output_assets as JobOutputAssets
    if (!outputAssets) continue
    const bucket = outputAssets.bucket || 'raw-private'
    if (!bucketToPaths.has(bucket)) {
      bucketToPaths.set(bucket, new Set())
    }
    const bucketSet = bucketToPaths.get(bucket)
    if (!bucketSet) continue
    const pages = Array.isArray(outputAssets.pages) ? outputAssets.pages : []
    for (const page of pages) {
      if (page?.storage_path) bucketSet.add(page.storage_path)
      if (page?.storage_path_full) bucketSet.add(page.storage_path_full)
    }
    if (outputAssets.pdf_path) {
      bucketSet.add(outputAssets.pdf_path)
    }
  }

  for (const [bucket, paths] of bucketToPaths.entries()) {
    const toRemove = Array.from(paths)
    if (toRemove.length === 0) continue
    await supabaseAdmin.storage.from(bucket).remove(toRemove)
  }

  const scopedJobsDeleteQuery = buildOwnerScopedQuery(
    supabaseAdmin
      .from('jobs')
      .delete()
      .eq('creation_id', creationId),
    owner
  )
  await scopedJobsDeleteQuery

  const scopedCartDeleteQuery = buildOwnerScopedQuery(
    supabaseAdmin
      .from('cart_items')
      .delete()
      .eq('creation_id', creationId),
    owner
  )
  await scopedCartDeleteQuery

  const scopedCreationDeleteQuery = buildOwnerScopedQuery(
    supabaseAdmin
      .from('creations')
      .delete()
      .eq('creation_id', creationId),
    owner
  )
  const { error: deleteError } = await scopedCreationDeleteQuery
  if (deleteError) {
    return NextResponse.json({ error: 'Failed to delete creation' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, mode: 'hard' })
}
