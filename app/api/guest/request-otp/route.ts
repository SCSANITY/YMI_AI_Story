import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendOtpEmail } from '@/lib/email'
import { getOrCreateAnonSession } from '@/lib/session'
import {
  createGuestOtpRateLimitKey,
  normalizeGuestOtpEmail,
  parseGuestOtpRateLimitDecision,
  resolveGuestOtpClientIp,
} from '@/lib/guest-otp'

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const normalizedEmail = normalizeGuestOtpEmail(body?.email)

  if (!normalizedEmail) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }

  const rateLimitSecret =
    process.env.OTP_RATE_LIMIT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY

  if (!rateLimitSecret) {
    console.error('[otp] rate-limit secret is unavailable')
    return NextResponse.json({ error: 'Unable to send verification code' }, { status: 503 })
  }

  try {
    const anonSessionId = await getOrCreateAnonSession()
    const clientIp = resolveGuestOtpClientIp(request.headers)
    const { data, error } = await supabaseAdmin.rpc('consume_guest_otp_rate_limit', {
      p_email_key: createGuestOtpRateLimitKey('email', normalizedEmail, rateLimitSecret),
      p_session_key: createGuestOtpRateLimitKey('session', anonSessionId, rateLimitSecret),
      p_ip_key: clientIp
        ? createGuestOtpRateLimitKey('ip', clientIp, rateLimitSecret)
        : null,
    })

    const decision = parseGuestOtpRateLimitDecision(data)
    if (error || !decision) {
      console.error('[otp] rate-limit check failed', error)
      return NextResponse.json({ error: 'Unable to send verification code' }, { status: 503 })
    }

    if (!decision.allowed) {
      return NextResponse.json(
        {
          error: 'Too many verification requests. Please wait before trying again.',
          retryAfterSeconds: decision.retryAfterSeconds,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(decision.retryAfterSeconds) },
        }
      )
    }
  } catch (error) {
    console.error('[otp] rate-limit guard failed', error)
    return NextResponse.json({ error: 'Unable to send verification code' }, { status: 503 })
  }

  const code = generateCode()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const { data: verification, error: insertError } = await supabaseAdmin
    .from('verification_codes')
    .insert({
      email: normalizedEmail,
      code,
      expires_at: expiresAt,
    })
    .select('verification_id')
    .single()

  if (insertError || !verification?.verification_id) {
    return NextResponse.json(
      { error: 'Failed to create verification code', details: insertError?.message || 'missing verification id' },
      { status: 500 }
    )
  }

  try {
    await sendOtpEmail(normalizedEmail, code, verification.verification_id)
  } catch (error) {
    console.error('[otp] failed to send email', error)
    await supabaseAdmin
      .from('verification_codes')
      .delete()
      .eq('verification_id', verification.verification_id)
    return NextResponse.json({ error: 'Unable to send verification code' }, { status: 500 })
  }

  // Keep only the newest code for this email to avoid ambiguity.
  await supabaseAdmin
    .from('verification_codes')
    .delete()
    .eq('email', normalizedEmail)
    .neq('code', code)

  return NextResponse.json({
    sent: true,
    expiresAt,
    resendAfterSeconds: 60,
    devCode: process.env.NODE_ENV === 'production' ? undefined : code,
  })
}
