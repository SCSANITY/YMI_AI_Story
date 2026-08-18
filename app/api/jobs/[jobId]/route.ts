import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  checkoutOwnerErrorResponse,
  ownerFilter,
  resolveCheckoutOwner,
  type CheckoutOwner,
} from '@/lib/checkout-owner'

type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancel_requested' | 'cancelled'

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
}

function buildOwnerScopedQuery(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  owner: CheckoutOwner
) {
  const filter = ownerFilter(owner)
  return query.eq('owner_type', filter.owner_type).eq(filter.column, filter.value)
}

async function readJsonSafely(request: Request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ jobId: string }> | { jobId: string } }
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
      response.headers.set('Cache-Control', NO_STORE_HEADERS['Cache-Control'])
      return response
    }
    return NextResponse.json({ error: 'Failed to resolve owner' }, { status: 500, headers: NO_STORE_HEADERS })
  }
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE_HEADERS })

  const { data: job, error } = await buildOwnerScopedQuery(
    supabaseAdmin
      .from('jobs')
      .select(
        'job_id, job_type, story_language, selected_book_type, status, progress, error_message, input_snapshot, output_assets, created_at, updated_at'
      )
      .eq('job_id', jobId),
    owner
  ).maybeSingle()

  if (error || !job) {
    return NextResponse.json(
      { error: error?.message || 'Job not found', jobId },
      { status: 404, headers: NO_STORE_HEADERS }
    )
  }

  return NextResponse.json(job, { headers: NO_STORE_HEADERS })
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ jobId: string }> | { jobId: string } }
) {
  const { jobId } = await Promise.resolve(context.params)
  const body = await readJsonSafely(request)
  let owner
  try {
    owner = await resolveCheckoutOwner(request, {
      expectedCustomerId: typeof body?.customerId === 'string' ? body.customerId : null,
    })
  } catch (error) {
    return checkoutOwnerErrorResponse(error) ?? NextResponse.json({ error: 'Failed to resolve owner' }, { status: 500 })
  }
  if (!owner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: job, error } = await buildOwnerScopedQuery(
    supabaseAdmin
      .from('jobs')
      .select('job_id, job_type, status, creation_id')
      .eq('job_id', jobId),
    owner
  ).maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message || 'Failed to load job', jobId }, { status: 500 })
  }

  if (!job?.job_id) {
    return NextResponse.json({ error: 'Job not found', jobId }, { status: 404 })
  }

  if (job.job_type !== 'preview') {
    return NextResponse.json({ error: 'Only preview jobs can be cancelled', jobId }, { status: 400 })
  }

  const archivedAt = new Date().toISOString()
  const targetCreationId =
    (typeof job.creation_id === 'string' && job.creation_id) ||
    (typeof body?.creationId === 'string' ? body.creationId : null)

  if (targetCreationId) {
    const { error: archiveError } = await buildOwnerScopedQuery(
      supabaseAdmin
        .from('creations')
        .update({
          is_archived: true,
          deleted_at: archivedAt,
          updated_at: archivedAt,
        })
        .eq('creation_id', targetCreationId),
      owner
    )

    if (archiveError) {
      return NextResponse.json(
        { error: archiveError.message || 'Failed to archive creation', jobId },
        { status: 500 }
      )
    }
  }

  let nextStatus: JobStatus = job.status as JobStatus
  if (job.status === 'queued') {
    nextStatus = 'cancelled'
  } else if (job.status === 'running') {
    nextStatus = 'cancel_requested'
  } else if (
    job.status === 'done' ||
    job.status === 'failed' ||
    job.status === 'cancel_requested' ||
    job.status === 'cancelled'
  ) {
    nextStatus = job.status as JobStatus
  }

  if (nextStatus !== job.status) {
    const updatePayload: Record<string, unknown> = {
      status: nextStatus,
      updated_at: archivedAt,
    }

    if (nextStatus === 'cancelled' || nextStatus === 'cancel_requested') {
      updatePayload.error_message = 'Preview cancelled by user'
    }

    const { error: updateError } = await supabaseAdmin
      .from('jobs')
      .update(updatePayload)
      .eq('job_id', jobId)

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message || 'Failed to cancel preview job', jobId },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({
    ok: true,
    status: nextStatus,
    jobId,
  })
}
