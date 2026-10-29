import { noStoreJson as privateJson } from '@/lib/http-response'
import { NextResponse } from 'next/server'
import { UUID_REGEX } from '@/lib/validators'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createSignedStorageUrlMap } from '@/lib/storage-signing'
import { getEmptyPurchaseSummary, loadPurchaseSummaryByCreation } from '@/lib/purchase-state'
import { isVisibleMyBookRow } from '@/lib/my-books-visibility'
import {
  checkoutOwnerErrorResponse,
  resolveCheckoutOwner,
  scopeCheckoutOwnerQuery,
  type CheckoutOwner,
} from '@/lib/checkout-owner'

async function loadCreationsWithArchive(owner: CheckoutOwner) {
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

  const query = scopeCheckoutOwnerQuery(
    supabaseAdmin.from('creations').select(archiveSelect).order('created_at', { ascending: false }),
    owner
  )
  return await query
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  let owner
  try {
    owner = await resolveCheckoutOwner(request, {
      expectedCustomerId: url.searchParams.get('customerId'),
      optional: true,
      verification: 'claims',
    })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? NextResponse.json({ error: 'Failed to resolve owner' }, { status: 500 })
  }
  const expectsCustomer = request.headers.get('x-ymi-expect-customer') === '1'
  if (expectsCustomer && (!owner || owner.ownerType !== 'customer')) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
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
    return isVisibleMyBookRow(row, summary)
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
  const body = await request.json().catch(() => null)
  const creationId = body?.creationId ?? body?.creation_id
  if (typeof creationId !== 'string' || !UUID_REGEX.test(creationId)) {
    return privateJson({ error: 'Invalid creationId' }, { status: 400 })
  }
  let owner
  try {
    owner = await resolveCheckoutOwner(request, { expectedCustomerId: body?.customerId ?? null })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? privateJson({ error: 'Failed to resolve owner' }, { status: 500 })
  }
  if (!owner) return privateJson({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabaseAdmin.rpc('remove_owned_preview_creation', {
    p_creation_id: creationId,
    p_owner_type: owner.ownerType,
    p_owner_id: owner.ownerType === 'customer' ? owner.customerId : owner.anonSessionId,
  })
  if (error) {
    const status = error.code === 'P0002' ? 404 : error.code === 'PT409' ? 409 : 500
    return privateJson({ error: status === 409 ? 'This preview is busy. Please try again later.' : 'Unable to remove this preview.' }, { status })
  }
  const result = data as { ok?: boolean; mode?: string } | null
  if (!result?.ok || !['soft', 'hard'].includes(String(result.mode))) {
    return privateJson({ error: 'Unable to confirm preview removal. Please reload My Books.' }, { status: 503 })
  }
  // Physical cleanup is internal and post-commit. No Storage or cleanup batch is
  // called from this request, and an unknown response is never auto-retried.
  return privateJson({ ok: true, mode: result.mode })
}
