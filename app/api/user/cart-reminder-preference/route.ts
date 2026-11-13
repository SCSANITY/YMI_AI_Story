import { getAuthenticatedUser } from '@/lib/authenticated-user'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

function json(data: object, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })
}

async function member(request: Request) {
  const user = await getAuthenticatedUser()
  if (!user || user.id !== request.headers.get('X-YMI-Preference-User')) return null
  return user
}

export async function GET(request: Request) {
  const user = await member(request)
  if (!user) return json({ error: 'Sign in to manage email preferences.' }, 401)
  const { data: customer, error } = await supabaseAdmin.from('customers').select('customer_id,email')
    .eq('auth_user_id', user.id).eq('is_guest', false).maybeSingle()
  if (error) return json({ error: 'Could not load the preference.' }, 503)
  if (!customer) return json({ error: 'Account is still being set up.' }, 409)
  const email = user.email?.trim().toLowerCase()
  const canEnable = Boolean(user.email_confirmed_at && email && customer.email?.trim().toLowerCase() === email)
  const { data: entry, error: readError } = await supabaseAdmin.from('cart_reminder_eligibility')
    .select('email,unsubscribed_at').eq('customer_id', customer.customer_id).maybeSingle()
  if (readError) return json({ error: 'Could not load the preference.' }, 503)
  return json({
    enabled: Boolean(entry && entry.unsubscribed_at === null),
    canEnable,
    paused: Boolean(entry && entry.unsubscribed_at === null && (!canEnable || entry.email !== email)),
  })
}

export async function POST(request: Request) {
  // Next may reconstruct request.url with its listener hostname. Compare the
  // browser's origin to the actual request Host and the reconstructed scheme.
  const url = new URL(request.url)
  const host = request.headers.get('host') ?? url.host
  if (request.headers.get('origin') !== `${url.protocol}//${host}`) return json({ error: 'Invalid origin.' }, 403)
  const choice = request.headers.get('X-YMI-Cart-Reminders')
  if (choice !== 'on' && choice !== 'off') return json({ error: 'Invalid choice.' }, 400)
  const user = await member(request)
  if (!user) return json({ error: 'Sign in to manage email preferences.' }, 401)
  const email = user.email_confirmed_at ? user.email?.trim().toLowerCase() : null
  if (choice === 'on' && !email) return json({ error: 'Confirm your account email first.' }, 409)
  const { data, error } = await supabaseAdmin.rpc('set_cart_reminder_preference', {
    p_auth_user_id: user.id, p_email: email ?? null, p_enabled: choice === 'on',
  })
  if (error) return json({ error: 'Could not save the preference.' }, 503)
  if (typeof data !== 'boolean') return json({ error: 'Refresh your account details and try again.' }, 409)
  return json({ enabled: data })
}
