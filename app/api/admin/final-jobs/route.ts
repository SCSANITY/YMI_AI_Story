import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { resolveFinalJobDisplayTitle } from '@/lib/personalized-book-title'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/validators'
import { getFrozenFinalProductionMode } from '@/lib/final-production'

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
  release_mode,
  released_at,
  email_sent_at,
  print_status,
  print_completed_pages,
  print_released_at,
  error_message,
  created_at,
  updated_at,
  orders:orders(display_id, email, order_status),
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

  const requestedJobId = new URL(request.url).searchParams.get('jobId')
  if (requestedJobId && !isUuid(requestedJobId)) {
    return jsonNoStore({ error: 'Invalid final job id' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('final_jobs')
    .select(FINAL_JOB_SELECT)
    .order('updated_at', { ascending: false })
    .limit(100)

  if (error) {
    return jsonNoStore({ error: error.message || 'Failed to load final jobs' }, { status: 500 })
  }

  const rows = [...(data ?? [])]
  if (requestedJobId && !rows.some((row) => row.final_job_id === requestedJobId)) {
    const { data: focusedJob, error: focusedJobError } = await supabaseAdmin
      .from('final_jobs')
      .select(FINAL_JOB_SELECT)
      .eq('final_job_id', requestedJobId)
      .maybeSingle()
    if (focusedJobError) {
      return jsonNoStore({ error: focusedJobError.message }, { status: 500 })
    }
    if (focusedJob) rows.unshift(focusedJob)
  }

  if (!rows.length) return jsonNoStore({ finalJobs: [] })
  const { data: linkedJobs, error: linkedJobsError } = await supabaseAdmin
    .from('jobs').select('job_id,input_snapshot').in('job_id', rows.map((row) => row.job_id))
  if (linkedJobsError) return jsonNoStore({ error: 'Failed to load Final production mode' }, { status: 500 })
  const modeByJobId = new Map((linkedJobs ?? []).map((job) => [job.job_id, getFrozenFinalProductionMode(job.input_snapshot)]))
  const finalJobs = rows.map((row) => {
    const { creations, ...summary } = row
    return {
      ...summary,
      production_mode: modeByJobId.get(row.job_id) ?? 'auto',
      display_title: resolveFinalJobDisplayTitle({ ...summary, creations }),
    }
  })

  return jsonNoStore({ finalJobs })
}
