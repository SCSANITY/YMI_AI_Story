import { normalizeAdminOrderPage, normalizeAdminOrderSearch } from '@/lib/admin-orders'
import { finalPurchasedEdition } from '@/lib/final-purchased-edition'
import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { resolveFinalJobDisplayTitle } from '@/lib/personalized-book-title'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/validators'
import { getFrozenFinalProductionMode } from '@/lib/final-production'

import { PROOF_REVIEW_WAIT_MS } from '@/lib/proof-review-clock'

const FINAL_JOB_SELECT = `
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
  proof_draft_sequence, proof_revision, proof_draft_open, release_mode,
  released_at,
  email_sent_at,
  pdf_only,
  print_status,
  print_completed_pages,
  print_released_at,
  error_message,
  created_at,
  updated_at,
  orders:orders(display_id, email, order_status),
  purchased_line:cart_items!final_jobs_cart_item_id_fkey(order_id,creation_id,final_job_id,status,product_type,package_type),
  creations:creations(
    customize_snapshot,
    templates:templates(name)
  )
`

export async function GET(request: Request) {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return jsonNoStore({ error: 'Admin access required' }, { status: 403 })
  }

  const params = new URL(request.url).searchParams
  const requestedJobId = params.get('jobId')
  if (requestedJobId && !isUuid(requestedJobId)) {
    return jsonNoStore({ error: 'Invalid final job id' }, { status: 400 })
  }

  const stage = params.get('stage')
  const edition = params.get('edition')
  const search = normalizeAdminOrderSearch(params.get('search'))
  const page = normalizeAdminOrderPage(params.get('page'))
  const pageSize = 40
  const searchEmbed = search ? ',search_order:orders(),search_creation:creations(search_template:templates())' : ''
  const editionEmbed = edition ? ',edition_line:cart_items!final_jobs_cart_item_id_fkey!inner()' : ''
  let query = supabaseAdmin.from('final_jobs').select(FINAL_JOB_SELECT + searchEmbed + editionEmbed, { count: 'exact' })
  if (edition) {
    if (!['digital', 'basic', 'supreme'].includes(edition)) return jsonNoStore({ error: 'Invalid book type' }, { status: 400 })
    query = query.eq('edition_line.product_type', edition === 'digital' ? 'ebook' : 'physical').eq('edition_line.package_type', edition).eq('edition_line.status', 'ordered')
  }
  if (stage === 'reply_check') query = query.eq('pdf_only',false).eq('proof_draft_open',false)
    .not('released_at','is',null).is('print_released_at',null).or('print_status.is.null,print_status.neq.released')
    .lte('email_sent_at',new Date(Date.now()-PROOF_REVIEW_WAIT_MS).toISOString())
  if (stage === 'pdf_review') query = query.or('proof_draft_open.eq.true,review_status.is.null,review_status.neq.released')
  if (stage === 'print_pending') query = query.eq('pdf_only',false).eq('proof_draft_open',false).eq('review_status','released').or('print_status.is.null,print_status.neq.released')
  if (stage === 'completed') query = query.eq('review_status','released').or('pdf_only.eq.true,print_status.eq.released')
  if (search) {
    const pattern = `*${search}*`
    const childFields = ['childName', 'child_name', 'name'].flatMap(key => [
      `customize_snapshot->>${key}`, `customize_snapshot->textOverrides->>${key}`, `customize_snapshot->text_overrides->>${key}`,
    ])
    query = query.ilike('search_order.display_id', pattern)
      .ilike('search_creation.search_template.name', pattern)
      .or([...childFields.map(field => `${field}.ilike.${pattern}`), 'search_template.not.is.null'].join(','), { referencedTable: 'search_creation' })
      .or(`search_order.not.is.null,search_creation.not.is.null,template_id.ilike.${pattern}`)
  }
  const offset = (page - 1) * pageSize
  const { data, error, count } = await query.order('updated_at', { ascending: false })
    .order('final_job_id', { ascending: false }).range(offset, offset + pageSize - 1)

  if (error) {
    return jsonNoStore({ error: error.message || 'Failed to load final jobs' }, { status: 500 })
  }

  const focusedQuery = supabaseAdmin.from('final_jobs').select(FINAL_JOB_SELECT)
  const rows = (data ?? []) as unknown as NonNullable<Awaited<typeof focusedQuery>['data']>
  if (requestedJobId && !rows.some((row) => row.final_job_id === requestedJobId)) {
    const { data: focusedJob, error: focusedJobError } = await focusedQuery
      .eq('final_job_id', requestedJobId)
      .maybeSingle()
    if (focusedJobError) {
      return jsonNoStore({ error: focusedJobError.message }, { status: 500 })
    }
    if (focusedJob) rows.unshift(focusedJob)
  }

  if (!rows.length) return jsonNoStore({ finalJobs: [], total: count ?? 0, pageSize })
  const { data: linkedJobs, error: linkedJobsError } = await supabaseAdmin
    .from('jobs').select('job_id,input_snapshot').in('job_id', rows.map((row) => row.job_id))
  if (linkedJobsError) return jsonNoStore({ error: 'Failed to load Final production mode' }, { status: 500 })
  const modeByJobId = new Map((linkedJobs ?? []).map((job) => [job.job_id, getFrozenFinalProductionMode(job.input_snapshot)]))
  const finalJobs = rows.map((row) => {
    const { creations, purchased_line, ...summary } = row
    return {
      ...summary,
      purchased_edition: finalPurchasedEdition(row, purchased_line),
      production_mode: modeByJobId.get(row.job_id) ?? 'auto',
      display_title: resolveFinalJobDisplayTitle({ ...summary, creations }),
    }
  })

  return jsonNoStore({ finalJobs, total: count ?? 0, pageSize })
}
