import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendOtpEmail } from '@/lib/email'

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

export async function POST(request: Request) {
  const { email } = await request.json()

  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  if (!normalizedEmail) {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 })
  }

  const code = generateCode()
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  const { error: insertError } = await supabaseAdmin.from('verification_codes').insert({
    email: normalizedEmail,
    code,
    expires_at: expiresAt,
  })

  if (insertError) {
    return NextResponse.json(
      { error: 'Failed to create verification code', details: insertError.message },
      { status: 500 }
    )
  }

  try {
    await sendOtpEmail(normalizedEmail, code)
  } catch (error) {
    console.error('[otp] failed to send email', error)
    await supabaseAdmin
      .from('verification_codes')
      .delete()
      .eq('email', normalizedEmail)
      .eq('code', code)
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
    devCode: process.env.NODE_ENV === 'production' ? undefined : code,
  })
}
