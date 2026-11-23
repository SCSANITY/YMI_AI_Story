import { validatedReleaseNote } from '@/lib/release-mail-body'
import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { FinalArtifactConflict } from '@/lib/final-review-artifact-paths'
import { releaseFinalJob, type FinalReleaseMode } from '@/lib/finalReview'

export const maxDuration = 300

export async function POST(
  request: Request,
  context: { params: Promise<{ finalJobId: string }> }
) {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { finalJobId } = await Promise.resolve(context.params)
  const body = await request.json().catch(() => ({}))
  let note: string
  try { note = validatedReleaseNote(body?.deliveryNote,'pdf') }
  catch (error) { return NextResponse.json({ error:error instanceof Error ? error.message : 'Invalid email body' }, { status:400 }) }
  const releaseMode = String(body?.releaseMode ?? 'manual') as FinalReleaseMode
  const allowedModes: FinalReleaseMode[] = ['manual', 'job_auto', 'story_auto', 'global_auto']
  if (!allowedModes.includes(releaseMode)) {
    return NextResponse.json({ error: 'Invalid release mode' }, { status: 400 })
  }

  try {
    const result = await releaseFinalJob({
      finalJobId,
      releaseMode,
      expectedRevision: body.expectedRevision,
      deliveryNote: note,
      approvedByCustomerId: admin.customer_id,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to release final job' },
      { status: error instanceof FinalArtifactConflict ? 409 : 500 }
    )
  }
}
