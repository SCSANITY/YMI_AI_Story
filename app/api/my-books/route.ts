import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type Owner = {
  ownerType: 'customer' | 'anon'
  ownerId: string
}

type JobOutputAssets = {
  bucket?: string
  pages?: Array<{ page_index: number; storage_path: string; storage_path_full?: string }>
  pdf_path?: string
} | null

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

function buildOwnerScopedQuery(query: any, owner: Owner) {
  if (owner.ownerType === 'customer') {
    return query.eq('owner_type', 'customer').eq('customer_id', owner.ownerId)
  }
  return query.eq('owner_type', 'anon').eq('anon_session_id', owner.ownerId)
}

async function loadCreationsWithArchive(owner: Owner) {
  const baseSelect = `
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
      story_type
    )
  `

  const archiveSelect = `
    creation_id,
    template_id,
    customize_snapshot,
    preview_job_id,
    created_at,
    is_archived,
    deleted_at,
    templates:templates (
      template_id,
      name,
      description,
      cover_image_path,
      story_type
    )
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
  const customerId = url.searchParams.get('customerId')
  const owner = resolveOwner(request, customerId)

  if (!owner) {
    return NextResponse.json({ items: [] })
  }

  const { data: items, error } = await loadCreationsWithArchive(owner)
  if (error) {
    return NextResponse.json({ error: 'Failed to load items' }, { status: 500 })
  }

  const visibleRows = (items ?? []).filter((row: { is_archived?: boolean | null }) => row?.is_archived !== true)
  const jobIds = visibleRows
    .map((row: { preview_job_id?: string | null }) => row.preview_job_id)
    .filter((value: string | null) => Boolean(value))

  const previewUrlMap = new Map<string, string>()

  if (jobIds.length > 0) {
    const { data: jobs } = await supabaseAdmin
      .from('jobs')
      .select('job_id, output_assets')
      .in('job_id', jobIds as string[])

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

    for (const [jobId, info] of jobMap.entries()) {
      const { data: signed } = await supabaseAdmin.storage
        .from(info.bucket)
        .createSignedUrl(info.path, 60 * 10)
      if (signed?.signedUrl) {
        previewUrlMap.set(jobId, signed.signedUrl)
      }
    }
  }

  const enriched = visibleRows.map((row: { preview_job_id?: string | null }) => ({
    ...row,
    preview_cover_url: row.preview_job_id ? previewUrlMap.get(row.preview_job_id) ?? null : null,
  }))

  return NextResponse.json({ items: enriched })
}

export async function DELETE(request: Request) {
  const body = await request.json()
  const creationId = body?.creationId ?? body?.creation_id
  const customerId = body?.customerId ?? null

  if (!creationId) {
    return NextResponse.json({ error: 'Missing creationId' }, { status: 400 })
  }

  const owner = resolveOwner(request, customerId)
  if (!owner) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
    (item: any) => item.status === 'ordered' || Boolean(item.payment_id) || Boolean(item.order_id)
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
