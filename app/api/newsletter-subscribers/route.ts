import { createHash, createHmac, randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { sendNewsletterConfirmationEmail } from '@/lib/email'
import { resolveGuestOtpClientIp } from '@/lib/guest-otp'
import { createServerSupabase } from '@/lib/supabaseServer'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getOrCreateAnonSession } from '@/lib/session'
import { getSiteUrl } from '@/lib/site-url'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeEmail(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function keyedHash(scope: string, value: string, secret: string) {
  return createHmac('sha256', secret).update(`${scope}:${value}`).digest('hex')
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const email = normalizeEmail(body?.email)

  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address' }, { status: 400 })
  }

  const rateLimitSecret =
    process.env.NEWSLETTER_RATE_LIMIT_SECRET ||
    process.env.OTP_RATE_LIMIT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY
  if (!rateLimitSecret) {
    return NextResponse.json({ error: 'Unable to request subscription' }, { status: 503 })
  }

  const clientIp = resolveGuestOtpClientIp(request.headers)
  const { data: rateData, error: rateError } = await supabaseAdmin.rpc(
    'consume_newsletter_signup_rate_limit',
    {
      p_email_key: keyedHash('email', email, rateLimitSecret),
      p_ip_key: clientIp ? keyedHash('ip', clientIp, rateLimitSecret) : null,
    }
  )
  const decision = Array.isArray(rateData) ? rateData[0] : rateData
  if (rateError || !decision || typeof decision.allowed !== 'boolean') {
    console.error('[newsletter] rate-limit check failed', rateError)
    return NextResponse.json({ error: 'Unable to request subscription' }, { status: 503 })
  }
  if (!decision.allowed) {
    const retryAfter = Math.max(1, Number(decision.retry_after_seconds ?? 60))
    return NextResponse.json(
      { error: 'Too many subscription requests. Please wait and try again.', retryAfterSeconds: retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  const { data: existing } = await supabaseAdmin
    .from('newsletter_subscribers')
    .select('status')
    .eq('email', email)
    .maybeSingle()
  if (existing?.status === 'active' || existing?.status === 'bounced') {
    return NextResponse.json({ success: true, confirmationRequired: true })
  }

  const [supabase, anonSessionId] = await Promise.all([
    createServerSupabase(),
    getOrCreateAnonSession().catch(() => null),
  ])
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let customerId: string | null = null
  if (user?.id) {
    const { data: customer } = await supabaseAdmin
      .from('customers')
      .select('customer_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    customerId = customer?.customer_id ?? null
  }

  const now = new Date().toISOString()
  const token = randomBytes(32).toString('hex')
  const confirmationTokenHash = createHash('sha256').update(token).digest('hex')
  const confirmationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
  const { error } = await supabaseAdmin
    .from('newsletter_subscribers')
    .upsert(
      {
        email,
        customer_id: customerId,
        anon_session_id: customerId ? null : anonSessionId,
        source: 'footer',
        status: 'pending',
        confirmation_token_hash: confirmationTokenHash,
        confirmation_expires_at: confirmationExpiresAt,
        subscribed_at: now,
        updated_at: now,
      },
      { onConflict: 'email' }
    )

  if (error) {
    return NextResponse.json({ error: 'Failed to request subscription' }, { status: 500 })
  }

  const siteUrl = getSiteUrl(request.url)
  const confirmUrl = `${siteUrl}/api/newsletter-subscribers/confirm?token=${encodeURIComponent(token)}`
  try {
    await sendNewsletterConfirmationEmail(
      email,
      confirmUrl,
      confirmationTokenHash.slice(0, 16)
    )
  } catch (emailError) {
    console.error('[newsletter] confirmation email failed', emailError)
    return NextResponse.json({ error: 'Unable to send confirmation email' }, { status: 500 })
  }

  return NextResponse.json({ success: true, confirmationRequired: true })
}
