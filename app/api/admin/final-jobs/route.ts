import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { data, error } = await supabaseAdmin
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
    .order('updated_at', { ascending: false })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: error.message || 'Failed to load final jobs' }, { status: 500 })
  }

  return NextResponse.json({ finalJobs: data ?? [] })
}
