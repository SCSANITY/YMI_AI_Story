import { requireAdminCustomer } from '@/lib/adminAuth'
import { noStoreJson } from '@/lib/http-response'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/validators'

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  if (!await requireAdminCustomer()) return noStoreJson({ error: 'Forbidden' }, { status: 403 })
  const { orderId } = await params
  if (!isUuid(orderId)) return noStoreJson({ error: 'Invalid order' }, { status: 400 })
  const page = Number(new URL(request.url).searchParams.get('page') ?? 1)
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) return noStoreJson({ error: 'Invalid page' }, { status: 400 })
  const offset = (page - 1) * 25
  const { data, count, error } = await supabaseAdmin.from('email_events')
    .select('email_event_id,email_key,final_job_id,status,provider,provider_delivery_status,observed_at,sent_at,created_at,book_title:context->>bookTitle', { count: 'exact' })
    .eq('order_id', orderId).neq('status', 'external_observed')
    .order('created_at', { ascending: false }).order('email_event_id', { ascending: false })
    .range(offset, offset + 24)
  if (error) return noStoreJson({ error: 'Email activity unavailable' }, { status: 500 })
  return noStoreJson({ events: data ?? [], total: count ?? 0 })
}
