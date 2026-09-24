import {
  buildSignedPreviewResponse,
  parseSignedPreviewAssets,
  selectPreviewSignTargets,
  type StoredPreviewPage,
} from '@/lib/preview-page-contract'
import {
  isPreviewDisplayComplete,
  resolvePreviewDisplayAssets,
} from '@/lib/preview-book-presentation'
import { resolvePreviewCapacityState } from '@/lib/preview-capacity'
import {
  resolvePreviewJobPhase,
  type PreviewJobStatus,
} from '@/lib/preview-job-state'
import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  checkoutOwnerErrorResponse,
  resolveCheckoutOwner,
  scopeCheckoutOwnerQuery,
} from '@/lib/checkout-owner'

const SIGNED_URL_TTL_SECONDS = 60 * 10

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await Promise.resolve(context.params)
  const url = new URL(request.url)
  let owner
  try {
    owner = await resolveCheckoutOwner(request, {
      expectedCustomerId: url.searchParams.get('customerId'),
    })
  } catch (error) {
    const response = checkoutOwnerErrorResponse(error)
    if (response) {
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      return response
    }
    return jsonNoStore({ error: 'Failed to resolve owner' }, 500)
  }
  if (!owner) return jsonNoStore({ error: 'Unauthorized' }, 401)

  const { data: job, error } = await scopeCheckoutOwnerQuery(
    supabaseAdmin
      .from('jobs')
      .select('job_id, job_type, status, progress, output_assets, provider_runs')
      .eq('job_id', jobId),
    owner
  ).maybeSingle()

  if (error || !job || job.job_type !== 'preview') {
    return jsonNoStore({ error: 'Preview job not found' }, 404)
  }

  const status = job.status as PreviewJobStatus
  const outputAssets = job.output_assets as
    | {
        bucket?: string
        schema_version?: number
        asset_layout?: string
        pages?: StoredPreviewPage[]
      }
    | null
  const pages = Array.isArray(outputAssets?.pages) ? outputAssets.pages : []
  let assets: ReturnType<typeof buildSignedPreviewResponse> | null = null
  let hasCover = false
  let displayComplete = false

  if (
    pages.length > 0 &&
    outputAssets?.schema_version === 3 &&
    outputAssets?.asset_layout === 'single-page'
  ) {
    const targets = selectPreviewSignTargets({
      pages,
      pagesParam: null,
      limitParam: null,
      sizeParam: 'small',
    })
    const bucket = outputAssets.bucket || 'raw-private'
    const signedUrls = await Promise.all(
      targets.map(async (target) => {
        const { data, error: signedError } = await supabaseAdmin.storage
          .from(bucket)
          .createSignedUrl(target.storagePath, SIGNED_URL_TTL_SECONDS)
        if (signedError || !data?.signedUrl) throw new Error('Preview asset signing failed')
        return data.signedUrl
      })
    ).catch(() => null)

    if (!signedUrls) return jsonNoStore({ error: 'Failed to sign Preview assets' }, 500)
    assets = buildSignedPreviewResponse({ targets, signedUrls })
    const display = resolvePreviewDisplayAssets(parseSignedPreviewAssets(assets))
    hasCover = Boolean(display.coverUrl)
    displayComplete = isPreviewDisplayComplete(display)
  }

  const phase = resolvePreviewJobPhase({ status, hasCover, displayComplete })
  return jsonNoStore({
    job_id: job.job_id,
    status,
    phase,
    progress: typeof job.progress === 'number' ? job.progress : null,
    capacity_state: resolvePreviewCapacityState({
      jobType: job.job_type,
      status,
      providerRuns: job.provider_runs,
    }),
    failure_code: status === 'failed' ? 'generation_failed' : null,
    assets,
  })
}
