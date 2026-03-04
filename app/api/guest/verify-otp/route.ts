import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: Request) {
  const { email, code } = await request.json()

  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const normalizedCode = typeof code === 'string' ? code.trim() : ''

  if (!normalizedEmail || !normalizedCode) {
    return NextResponse.json({ verified: false }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data: otpRow, error } = await supabaseAdmin
    .from('verification_codes')
    .select('email, code, expires_at')
    .eq('email', normalizedEmail)
    .eq('code', normalizedCode)
    .gt('expires_at', now)
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !otpRow) {
    return NextResponse.json({ verified: false }, { status: 400 })
  }

  await supabaseAdmin
    .from('verification_codes')
    .delete()
    .eq('email', normalizedEmail)

  return NextResponse.json({ verified: true })
}
