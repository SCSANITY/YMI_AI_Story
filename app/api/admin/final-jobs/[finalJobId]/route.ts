import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import {
  buildAdminFinalPageReadModel,
  type AdminFinalPageSource,
} from '@/lib/admin-final-page-read-model'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { FinalPageMetadataError } from '@/lib/final-page-metadata'
import { resolveFinalJobDisplayTitle } from '@/lib/personalized-book-title'
import {
  MANUAL_PRINT_ARTIFACT_SELECT,
  buildManualPrintArtifactClient,
  type ManualPrintArtifactRow,
} from '@/lib/manual-print-artifact-server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const SIGN_TTL_SECONDS = 60 * 20

async function signRawPaths(paths: Array<string | null>) {
  const uniquePaths = [...new Set(paths.filter((path): path is string => Boolean(path)))]
  if (!uniquePaths.length) return new Map<string, string | null>()
  const { data, error } = await supabaseAdmin.storage
    .from('raw-private')
    .createSignedUrls(uniquePaths, SIGN_TTL_SECONDS)
  if (error) throw new Error(error.message || 'Failed to sign Final page images')
  const signedUrlByPath = new Map<string, string | null>()
  for (const item of data ?? []) {
    if (item.path) signedUrlByPath.set(item.path, item.signedUrl ?? null)
  }
  return signedUrlByPath
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ finalJobId: string }> | { finalJobId: string } }
) {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return jsonNoStore({ error: 'Admin access required' }, { status: 403 })
  }

  const { finalJobId } = await Promise.resolve(context.params)
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
        released_at,
        email_sent_at,
        print_status,
        print_completed_pages,
        print_released_at,
        print_package_artifact_id,
        error_message,
        created_at,
        updated_at,
        orders:orders(display_id, email, order_status),
        creations:creations(
          customize_snapshot,
          templates:templates(name)
        )
      `
    )
    .eq('final_job_id', finalJobId)
    .maybeSingle()

  if (finalJobError || !finalJob) {
    return jsonNoStore({ error: finalJobError?.message || 'Final job not found' }, { status: 404 })
  }

  const { data: linkedJob, error: linkedJobError } = await supabaseAdmin
    .from('jobs')
    .select('output_assets')
    .eq('job_id', finalJob.job_id)
    .maybeSingle()

  if (linkedJobError || !linkedJob) {
    return jsonNoStore(
      { error: linkedJobError?.message || 'Linked Final job not found' },
      { status: 500 }
    )
  }

  const { data: pages, error: pagesError } = await supabaseAdmin
    .from('final_job_pages')
    .select(
      'final_job_page_id, page_index, status, ai_output_path, manual_output_path, approved_output_path, approved_source, provider_request_id, review_note, reviewed_by, reviewed_at, review_intent_id, review_intent_type, review_intent_at, attempt_count, error_message, created_at, updated_at'
    )
    .eq('final_job_id', finalJobId)
    .order('page_index', { ascending: true })

  if (pagesError) {
    return jsonNoStore({ error: pagesError.message || 'Failed to load final pages' }, { status: 500 })
  }

  const sourcePages = (pages ?? []) as AdminFinalPageSource[]
  let readModel
  try {
    readModel = buildAdminFinalPageReadModel({
      outputAssets: linkedJob.output_assets,
      totalPages: Number(finalJob.total_pages || 0),
      reviewPages: sourcePages,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid Final page metadata'
    return jsonNoStore(
      { error: message },
      { status: error instanceof FinalPageMetadataError ? 409 : 500 }
    )
  }

  const sourceById = new Map(sourcePages.map((page) => [page.final_job_page_id, page]))
  let signedUrlByPath: Map<string, string | null>
  try {
    signedUrlByPath = await signRawPaths(
      sourcePages.flatMap((page) => [
        page.ai_output_path,
        page.manual_output_path,
        page.approved_output_path,
      ])
    )
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Failed to sign Final page images' },
      { status: 500 }
    )
  }

  const signedPages = readModel.pages.map((page) => {
    const source = sourceById.get(page.final_job_page_id)
    if (!source) throw new Error(`Missing source row for Final page ${page.page_index}`)
    return {
      ...page,
      ai_url: source.ai_output_path ? signedUrlByPath.get(source.ai_output_path) ?? null : null,
      manual_url: source.manual_output_path ? signedUrlByPath.get(source.manual_output_path) ?? null : null,
      approved_url: source.approved_output_path ? signedUrlByPath.get(source.approved_output_path) ?? null : null,
    }
  })

  const { creations, ...summary } = finalJob
  const finalJobSummary = {
    ...summary,
    display_title: resolveFinalJobDisplayTitle({ ...summary, creations }),
  }

  let printArtifact = null
  if (finalJob.print_package_artifact_id) {
    const { data: artifact, error: artifactError } = await supabaseAdmin
      .from('final_print_artifacts')
      .select(MANUAL_PRINT_ARTIFACT_SELECT)
      .eq('artifact_id', finalJob.print_package_artifact_id)
      .eq('final_job_id', finalJobId)
      .maybeSingle()
    if (artifactError) {
      return jsonNoStore(
        { error: artifactError.message || 'Failed to load manual print PDF' },
        { status: 500 }
      )
    }
    if (artifact) {
      try {
        printArtifact = await buildManualPrintArtifactClient(
          artifact as ManualPrintArtifactRow
        )
      } catch (error) {
        return jsonNoStore(
          { error: error instanceof Error ? error.message : 'Failed to sign manual print PDF' },
          { status: 500 }
        )
      }
    }
  }

  return jsonNoStore({
    finalJob: finalJobSummary,
    page_contract: readModel.page_contract,
    pages: signedPages,
    print_artifact: printArtifact,
  })
}
