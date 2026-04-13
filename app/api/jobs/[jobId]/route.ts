import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type Owner = {
  ownerType: 'customer' | 'anon'
  ownerId: string
}

type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancel_requested' | 'cancelled'

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

function buildOwnerScopedQuery(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any,
  owner: Owner
) {
  if (owner.ownerType === 'customer') {
    return query.eq('owner_type', 'customer').eq('customer_id', owner.ownerId)
  }
  return query.eq('owner_type', 'anon').eq('anon_session_id', owner.ownerId)
}

async function readJsonSafely(request: Request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> | { jobId: string } }
) {
  const { jobId } = await Promise.resolve(context.params)

  const { data: job, error } = await supabaseAdmin
    .from('jobs')
    .select(
      'job_id, job_type, story_language, selected_book_type, status, progress, error_message, input_snapshot, output_assets, created_at, updated_at'
    )
    .eq('job_id', jobId)
    .single()

  if (error || !job) {
    return NextResponse.json(
      { error: error?.message || 'Job not found', jobId },
      { status: 404 }
    )
  }

  return NextResponse.json(job)
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ jobId: string }> | { jobId: string } }
) {
  const { jobId } = await Promise.resolve(context.params)
  const body = await readJsonSafely(request)
  const customerId = typeof body?.customerId === 'string' ? body.customerId : null
  const owner = resolveOwner(request, customerId)

  if (!owner) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
