import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: Request) {
  const { email, code } = await request.json()

  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const normalizedCode = typeof code === 'string' ? code.trim() : ''

  if (!normalizedEmail || !normalizedCode) {
    return NextResponse.json({ verified: false }, { status: 400 })
  }

  const { data: verified, error } = await supabaseAdmin.rpc('verify_guest_otp', {
    p_email: normalizedEmail,
    p_code: normalizedCode,
  })

  if (error) {
    console.error('[otp] verification guard failed', error)
    return NextResponse.json({ error: 'Unable to verify code' }, { status: 503 })
  }

  if (verified !== true) {
    return NextResponse.json({ verified: false }, { status: 400 })
  }

  return NextResponse.json({ verified: true })
}
