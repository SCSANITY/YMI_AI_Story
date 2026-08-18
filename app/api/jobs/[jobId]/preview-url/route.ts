import { NextResponse } from 'next/server'
import {
  buildSignedPreviewResponse,
  selectPreviewSignTargets,
  type StoredPreviewPage,
} from '@/lib/preview-page-contract'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  resolveCheckoutOwner,
  type CheckoutOwner,
} from '@/lib/checkout-owner'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
}

const jsonNoStore = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: NO_STORE_HEADERS })

function buildOwnerScopedQuery(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  owner: CheckoutOwner
) {
  const filter = ownerFilter(owner)
  return query.eq('owner_type', filter.owner_type).eq(filter.column, filter.value)
}

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> | { jobId: string } }
) {
  const { jobId } = await Promise.resolve(context.params)
  const url = new URL(request.url)
  const pagesParam = url.searchParams.get('pages')
  const limitParam = url.searchParams.get('limit')
  const sizeParam = url.searchParams.get('size') || 'small'
  let owner
  try {
    owner = await resolveCheckoutOwner(request, {
      expectedCustomerId: url.searchParams.get('customerId'),
    })
  } catch (error) {
    const response = checkoutOwnerErrorResponse(error)
    if (response) {
      response.headers.set('Cache-Control', NO_STORE_HEADERS['Cache-Control'])
      return response
    }
    return jsonNoStore({ error: 'Failed to resolve owner' }, 500)
  }
  if (!owner) return jsonNoStore({ error: 'Unauthorized' }, 401)

  const { data: job, error } = await buildOwnerScopedQuery(
    supabaseAdmin
      .from('jobs')
      .select('status, output_assets')
      .eq('job_id', jobId),
    owner
  ).maybeSingle()

  if (error || !job) {
    return jsonNoStore({ error: 'Job not found' }, 404)
  }

  const outputAssets = job.output_assets as
    | {
        storage_path?: string
        bucket?: string
        schema_version?: number
        asset_layout?: string
        pages?: StoredPreviewPage[]
      }
    | null
  const bucket = outputAssets?.bucket || 'raw-private'

  const pages = Array.isArray(outputAssets?.pages) ? outputAssets?.pages ?? [] : []

  if (job.status !== 'done' && job.status !== 'running') {
    return jsonNoStore({ error: 'Job not completed' }, 400)
  }

  if (job.status === 'running' && !pages.length && !outputAssets?.storage_path) {
    return jsonNoStore({ error: 'Preview not ready' }, 400)
  }

  const signTargets = selectPreviewSignTargets({
    pages,
    pagesParam,
    limitParam,
    sizeParam,
    legacyStoragePath: outputAssets?.storage_path,
  })

  if (!signTargets.length) {
    return jsonNoStore({ error: 'Preview asset missing' }, 400)
  }

  const signedResults = await Promise.all(
    signTargets.map(async (target) => {
      const { data: signed, error: signedError } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(target.storagePath, 60 * 10)
      if (signedError || !signed?.signedUrl) {
        throw new Error('Failed to sign URL')
      }
      return signed.signedUrl
    })
  ).catch(() => null)

  if (!signedResults) {
    return jsonNoStore({ error: 'Failed to sign URL' }, 500)
  }
  return jsonNoStore(
    buildSignedPreviewResponse({
      targets: signTargets,
      signedUrls: signedResults,
      schemaVersion: outputAssets?.schema_version,
      assetLayout: outputAssets?.asset_layout,
    })
  )
}
