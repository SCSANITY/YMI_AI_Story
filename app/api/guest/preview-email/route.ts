import { getAuthenticatedClaims } from '@/lib/authenticated-user'
import { getRequestAnonSessionId } from '@/lib/checkout-owner'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { isUuid } from '@/lib/validators'

const json = (body: object, status = 200) =>
  Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } })

async function guestSession(request: Request) {
  const id = getRequestAnonSessionId(request)
  return isUuid(id) && !(await getAuthenticatedClaims()) ? id : null
}

export async function GET(request: Request) {
  const guest = await guestSession(request)
  if (!guest) return json({ guest: false })
  const { data, error } = await supabaseAdmin.from('guest_preview_contacts')
    .select('email').eq('anon_session_id', guest).maybeSingle()
  return error ? json({ error: 'Could not load your email.' }, 503) : json({ guest: true, email: data?.email ?? null })
}

export async function POST(request: Request) {
  const url = new URL(request.url)
  if (request.headers.get('origin') !== url.protocol + '//' + (request.headers.get('host') ?? url.host)) {
    return json({ error: 'Invalid origin.' }, 403)
  }
  if (request.headers.get('content-type')?.split(';')[0] !== 'application/json') return json({}, 415)
  const body = await request.json().catch(() => null)
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Enter a valid email address.' }, 400)
  const guest = await guestSession(request)
  if (!guest) return json({ error: 'Guest session unavailable.' }, 403)
  const { error } = await supabaseAdmin.from('guest_preview_contacts')
    .upsert({ anon_session_id: guest, email }, { onConflict: 'anon_session_id' })
  return error ? json({ error: 'Could not save your email. Please try again.' }, 503) : json({ email })
}
