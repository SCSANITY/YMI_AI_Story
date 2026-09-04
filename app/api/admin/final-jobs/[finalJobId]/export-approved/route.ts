import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import {
  ApprovedSourceExportError,
  buildApprovedSourceExportPlan,
  type ApprovedSourceReviewPage,
} from '@/lib/admin-approved-source-export'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { resolveFinalJobDisplayTitle } from '@/lib/personalized-book-title'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const SIGN_TTL_SECONDS = 60 * 30

export async function POST(
  request: Request,
  context: { params: Promise<{ finalJobId: string }> | { finalJobId: string } }
) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Admin access required' }, { status: 403 })

  const { finalJobId } = await Promise.resolve(context.params)
  const body = await request.json().catch(() => null)
  const selectedPageIndices = Array.isArray(body?.pageIndices) ? body.pageIndices : []

  const { data: finalJob, error: finalJobError } = await supabaseAdmin
    .from('final_jobs')
    .select(`
      final_job_id,
      job_id,
      template_id,
      total_pages,
      creations:creations(
        template_id,
        customize_snapshot,
        templates:templates(name)
      )
    `)
    .eq('final_job_id', finalJobId)
    .maybeSingle()
  if (finalJobError || !finalJob) {
    return jsonNoStore({ error: finalJobError?.message || 'Final job not found' }, { status: 404 })
  }

  const [linkedJobResult, pagesResult] = await Promise.all([
    supabaseAdmin
      .from('jobs')
      .select('output_assets')
      .eq('job_id', finalJob.job_id)
      .maybeSingle(),
    supabaseAdmin
      .from('final_job_pages')
      .select('page_index, status, approved_output_path, approved_source, reviewed_at')
      .eq('final_job_id', finalJobId),
  ])
  if (linkedJobResult.error || !linkedJobResult.data) {
    return jsonNoStore(
      { error: linkedJobResult.error?.message || 'Linked Final job not found' },
      { status: 500 }
    )
  }
  if (pagesResult.error) {
    return jsonNoStore({ error: pagesResult.error.message || 'Failed to load Final pages' }, { status: 500 })
  }

  let plan
  try {
    plan = buildApprovedSourceExportPlan({
      finalJobId,
      displayTitle: resolveFinalJobDisplayTitle(finalJob),
      generatedAt: new Date().toISOString(),
      outputAssets: linkedJobResult.data.output_assets,
      totalPages: Number(finalJob.total_pages || 0),
      reviewPages: (pagesResult.data ?? []) as ApprovedSourceReviewPage[],
      selectedPageIndices,
    })
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Invalid approved source export' },
      { status: error instanceof ApprovedSourceExportError ? 409 : 500 }
    )
  }

  const uniquePaths = plan.files.map((file) => file.storage_path)
  const { data: signedFiles, error: signError } = await supabaseAdmin.storage
    .from('raw-private')
    .createSignedUrls(uniquePaths, SIGN_TTL_SECONDS)
  if (signError) {
    return jsonNoStore({ error: signError.message || 'Failed to sign approved sources' }, { status: 500 })
  }
  const signedUrlByPath = new Map(
    (signedFiles ?? []).map((file) => [file.path, file.signedUrl ?? null])
  )
  const files = []
  for (const { storage_path, ...file } of plan.files) {
    const signedUrl = signedUrlByPath.get(storage_path)
    if (!signedUrl) {
      return jsonNoStore(
        { error: `Failed to sign approved Final page ${file.page_index}` },
        { status: 500 }
      )
    }
    files.push({ ...file, signed_url: signedUrl })
  }

  return jsonNoStore({
    archiveName: plan.archive_name,
    manifestName: plan.manifest_name,
    manifest: plan.manifest,
    files,
  })
}
