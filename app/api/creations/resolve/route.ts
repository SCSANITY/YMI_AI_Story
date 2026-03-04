import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function getCookieValue(cookies: string, name: string) {
  const entry = cookies
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
  return entry ? entry.split('=')[1] : null
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const jobId = url.searchParams.get('jobId')
  const creationId = url.searchParams.get('creationId')
  const customerId = url.searchParams.get('customerId')

  const cookies = request.headers.get('cookie') || ''
  const anonSessionId = getCookieValue(cookies, 'ymi_anon_session')

  if (!jobId && !creationId) {
    return NextResponse.json({ error: 'Missing jobId or creationId' }, { status: 400 })
  }

  let query = supabaseAdmin
    .from('creations')
    .select('creation_id, preview_job_id, template_id, customize_snapshot')

  if (jobId) {
    query = query.eq('preview_job_id', jobId)
  }
  if (creationId) {
    query = query.eq('creation_id', creationId)
  }

  if (customerId) {
    query = query.eq('owner_type', 'customer').eq('customer_id', customerId)
  } else if (anonSessionId) {
    query = query.eq('owner_type', 'anon').eq('anon_session_id', anonSessionId)
  }

  const { data, error } = await query.maybeSingle()

  if (error || !data) {
    return NextResponse.json({ error: 'Creation not found' }, { status: 404 })
  }

  return NextResponse.json({
    creationId: data.creation_id,
    previewJobId: data.preview_job_id,
    templateId: data.template_id,
    customizeSnapshot: data.customize_snapshot,
  })
}
