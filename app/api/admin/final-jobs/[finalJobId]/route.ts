import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const SIGN_TTL_SECONDS = 60 * 20

async function signRawPath(path: string | null) {
  if (!path) return null
  const { data } = await supabaseAdmin.storage
    .from('raw-private')
    .createSignedUrl(path, SIGN_TTL_SECONDS)
  return data?.signedUrl ?? null
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ finalJobId: string }> | { finalJobId: string } }
) {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
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
        pdf_path,
        released_at,
        email_sent_at,
        print_status,
        print_completed_pages,
        print_released_at,
        print_package_path,
        error_message,
        created_at,
        updated_at,
        orders:orders(display_id, email, order_status)
      `
    )
    .eq('final_job_id', finalJobId)
    .maybeSingle()

  if (finalJobError || !finalJob) {
    return NextResponse.json({ error: finalJobError?.message || 'Final job not found' }, { status: 404 })
  }

  const { data: pages, error: pagesError } = await supabaseAdmin
    .from('final_job_pages')
    .select(
      'final_job_page_id, page_index, status, ai_output_path, manual_output_path, approved_output_path, approved_source, print_output_path, print_status, provider_request_id, review_note, reviewed_by, reviewed_at, review_intent_id, review_intent_type, review_intent_at, attempt_count, error_message, created_at, updated_at'
    )
    .eq('final_job_id', finalJobId)
    .order('page_index', { ascending: true })

  if (pagesError) {
    return NextResponse.json({ error: pagesError.message || 'Failed to load final pages' }, { status: 500 })
  }

  const signedPages = await Promise.all(
    (pages ?? []).map(async (page) => ({
      ...page,
      ai_url: await signRawPath(page.ai_output_path),
      manual_url: await signRawPath(page.manual_output_path),
      approved_url: await signRawPath(page.approved_output_path),
      print_url: await signRawPath(page.print_output_path),
    }))
  )

  return NextResponse.json({ finalJob, pages: signedPages })
}
