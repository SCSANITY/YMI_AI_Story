import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> | { jobId: string } }
) {
  const { jobId } = await Promise.resolve(context.params)

  const { data: job, error } = await supabaseAdmin
    .from('jobs')
    .select('job_id, job_type, status, progress, error_message, input_snapshot, output_assets, created_at, updated_at')
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
