import { NextResponse } from 'next/server'
import {
  countFinalPageIssues,
  preferredFinalPagePath,
  type AdminOrderProductionSnapshotJob,
} from '@/lib/admin-order-production'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { parseFinalPageMetadataContract } from '@/lib/final-page-metadata'
import { resolveFinalJobDisplayTitle, resolvePersonalizedBookTitle } from '@/lib/personalized-book-title'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/validators'

const THUMBNAIL_TTL_SECONDS = 60 * 20

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers)
  headers.set('Cache-Control', 'no-store')
  return NextResponse.json(body, { ...init, headers })
}

type CartItemRow = {
  cart_item_id: string
  final_job_id: string | null
  product_type: string | null
  package_type: string | null
  quantity: number | null
  creations?: unknown
}

type PageRow = {
  final_job_id: string
  page_index: number
  status: string | null
  ai_output_path: string | null
  manual_output_path: string | null
  approved_output_path: string | null
  error_message: string | null
}

function cartItemRequiresPrint(item: Pick<CartItemRow, 'product_type' | 'package_type'>) {
  return item.product_type === 'physical' || item.package_type === 'basic' || item.package_type === 'supreme'
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ orderId: string }> | { orderId: string } }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Forbidden' }, { status: 403 })

  const { orderId } = await Promise.resolve(context.params)
  if (!isUuid(orderId)) {
    return jsonNoStore({ error: 'Invalid order id' }, { status: 400 })
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('order_id, display_id, order_status, email, created_at')
    .eq('order_id', orderId)
    .maybeSingle()
  if (orderError || !order) {
    return jsonNoStore({ error: orderError?.message || 'Order not found' }, { status: 404 })
  }

  const { data: cartItemsData, error: cartItemsError } = await supabaseAdmin
    .from('cart_items')
    .select(`
      cart_item_id,
      final_job_id,
      product_type,
      package_type,
      quantity,
      creations:creations(
        template_id,
        customize_snapshot,
        templates:templates(name)
      )
    `)
    .eq('order_id', orderId)
    .eq('status', 'ordered')
  if (cartItemsError) {
    return jsonNoStore({ error: cartItemsError.message }, { status: 500 })
  }

  const cartItems = (cartItemsData ?? []) as CartItemRow[]
  // cart_items.final_job_id is the legacy link to jobs.job_id, not final_jobs.final_job_id.
  const linkedGenerationJobIds = Array.from(new Set(
    cartItems.map((item) => item.final_job_id).filter((value): value is string => Boolean(value))
  ))

  const finalJobsByJobId = new Map<string, Record<string, unknown>>()
  const outputAssetsByJobId = new Map<string, unknown>()
  const pagesByFinalJobId = new Map<string, PageRow[]>()

  if (linkedGenerationJobIds.length > 0) {
    const { data: finalJobs, error: finalJobsError } = await supabaseAdmin
      .from('final_jobs')
      .select(`
        final_job_id,
        job_id,
        template_id,
        review_status,
        total_pages,
        approved_pages,
        released_at,
        email_sent_at,
        print_status,
        print_released_at,
        error_message,
        creations:creations(
          template_id,
          customize_snapshot,
          templates:templates(name)
        )
      `)
      .in('job_id', linkedGenerationJobIds)
    if (finalJobsError) {
      return jsonNoStore({ error: finalJobsError.message }, { status: 500 })
    }
    for (const row of finalJobs ?? []) {
      finalJobsByJobId.set(String(row.job_id), row as Record<string, unknown>)
    }

    const linkedJobIds = Array.from(new Set(
      (finalJobs ?? []).map((row) => String(row.job_id || '')).filter(Boolean)
    ))
    if (linkedJobIds.length > 0) {
      const { data: linkedJobs, error: linkedJobsError } = await supabaseAdmin
        .from('jobs')
        .select('job_id, output_assets')
        .in('job_id', linkedJobIds)
      if (linkedJobsError) {
        return jsonNoStore({ error: linkedJobsError.message }, { status: 500 })
      }
      for (const row of linkedJobs ?? []) {
        outputAssetsByJobId.set(String(row.job_id), row.output_assets)
      }
    }

    const finalJobIds = (finalJobs ?? []).map((row) => String(row.final_job_id || '')).filter(Boolean)
    const { data: pageRows, error: pagesError } = finalJobIds.length > 0
      ? await supabaseAdmin
      .from('final_job_pages')
      .select('final_job_id, page_index, status, ai_output_path, manual_output_path, approved_output_path, error_message')
      .in('final_job_id', finalJobIds)
      .order('page_index', { ascending: true })
      : { data: [] as PageRow[], error: null }
    if (pagesError) {
      return jsonNoStore({ error: pagesError.message }, { status: 500 })
    }
    for (const row of (pageRows ?? []) as PageRow[]) {
      pagesByFinalJobId.set(row.final_job_id, [
        ...(pagesByFinalJobId.get(row.final_job_id) ?? []),
        row,
      ])
    }
  }

  const jobs: AdminOrderProductionSnapshotJob[] = []
  const thumbnailPathByKey = new Map<string, string>()
  const seenFinalJobs = new Set<string>()

  for (const item of cartItems) {
    const quantity = Number.isSafeInteger(Number(item.quantity)) && Number(item.quantity) > 0
      ? Number(item.quantity)
      : 1
    const creation = Array.isArray(item.creations) ? item.creations[0] : item.creations
    const creationRecord = creation && typeof creation === 'object'
      ? creation as Record<string, unknown>
      : {}
    const templateRelation = creationRecord.templates
    const template = Array.isArray(templateRelation) ? templateRelation[0] : templateRelation
    const templateRecord = template && typeof template === 'object'
      ? template as Record<string, unknown>
      : {}
    const fallbackTitle = resolvePersonalizedBookTitle({
      templateId: creationRecord.template_id,
      templateName: templateRecord.name,
      customizeSnapshot: creationRecord.customize_snapshot,
    })

    if (!item.final_job_id || !finalJobsByJobId.has(item.final_job_id)) {
      jobs.push({
        key: `item:${item.cart_item_id}`,
        finalJobId: null,
        displayTitle: fallbackTitle,
        productType: item.product_type,
        packageType: item.package_type,
        requiresPrint: cartItemRequiresPrint(item),
        quantity,
        thumbnailUrl: null,
        totalPages: 0,
        approvedPages: 0,
        pageIssueCount: 0,
        reviewStatus: 'pending',
        releasedAt: null,
        emailSentAt: null,
        printStatus: 'locked',
        printReleasedAt: null,
        errorMessage: 'Final job has not been created yet.',
      })
      continue
    }
    const finalJob = finalJobsByJobId.get(item.final_job_id)!
    const resolvedFinalJobId = String(finalJob.final_job_id)
    if (seenFinalJobs.has(resolvedFinalJobId)) {
      const existing = jobs.find((job) => job.finalJobId === resolvedFinalJobId)
      if (existing) {
        existing.quantity += quantity
        existing.requiresPrint = existing.requiresPrint || cartItemRequiresPrint(item)
      }
      continue
    }
    seenFinalJobs.add(resolvedFinalJobId)

    const pages = pagesByFinalJobId.get(resolvedFinalJobId) ?? []
    let coverPage = pages[0] ?? null
    try {
      const contract = parseFinalPageMetadataContract({
        outputAssets: outputAssetsByJobId.get(String(finalJob.job_id || '')),
        totalPages: Number(finalJob.total_pages || 0),
        pageIndices: pages.map((page) => Number(page.page_index)),
      })
      const coverMetadata = contract.pages.find((page) => page.role === 'final_front_cover')
      coverPage = coverMetadata
        ? pages.find((page) => page.page_index === coverMetadata.page_index) ?? coverPage
        : coverPage
    } catch {
      // The snapshot remains available and reports the job error instead of hiding the order.
    }
    const thumbnailPath = coverPage ? preferredFinalPagePath(coverPage) : null
    if (thumbnailPath) thumbnailPathByKey.set(resolvedFinalJobId, thumbnailPath)

    jobs.push({
      key: `job:${resolvedFinalJobId}`,
      finalJobId: resolvedFinalJobId,
      displayTitle: resolveFinalJobDisplayTitle(finalJob),
      productType: item.product_type,
      packageType: item.package_type,
      requiresPrint: cartItemRequiresPrint(item),
      quantity,
      thumbnailUrl: null,
      totalPages: Number(finalJob.total_pages || 0),
      approvedPages: Number(finalJob.approved_pages || 0),
      pageIssueCount: countFinalPageIssues(pages),
      reviewStatus: String(finalJob.review_status || 'pending'),
      releasedAt: finalJob.released_at ? String(finalJob.released_at) : null,
      emailSentAt: finalJob.email_sent_at ? String(finalJob.email_sent_at) : null,
      printStatus: String(finalJob.print_status || 'locked'),
      printReleasedAt: finalJob.print_released_at ? String(finalJob.print_released_at) : null,
      errorMessage: finalJob.error_message ? String(finalJob.error_message) : null,
    })
  }

  if (thumbnailPathByKey.size > 0) {
    const paths = Array.from(new Set(thumbnailPathByKey.values()))
    const { data: signedRows, error: signError } = await supabaseAdmin.storage
      .from('raw-private')
      .createSignedUrls(paths, THUMBNAIL_TTL_SECONDS)
    if (signError) {
      return jsonNoStore({ error: signError.message }, { status: 500 })
    }
    const signedByPath = new Map(
      (signedRows ?? []).map((row) => [row.path, row.signedUrl ?? null])
    )
    for (const job of jobs) {
      const path = job.finalJobId ? thumbnailPathByKey.get(job.finalJobId) : null
      if (path) job.thumbnailUrl = signedByPath.get(path) ?? null
    }
  }

  return jsonNoStore({
    order: {
      orderId: String(order.order_id),
      displayId: order.display_id ? String(order.display_id) : null,
      orderStatus: order.order_status ? String(order.order_status) : null,
      email: order.email ? String(order.email) : null,
      createdAt: String(order.created_at),
    },
    jobs,
  })
}
