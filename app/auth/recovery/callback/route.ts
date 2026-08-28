import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabaseServer'
import {
  PASSWORD_RECOVERY_COOKIE,
  PASSWORD_RECOVERY_COOKIE_MAX_AGE_SECONDS,
} from '@/lib/password-recovery'

function resetPageUrl(requestUrl: string, error?: string) {
  const url = new URL('/reset-password', requestUrl)
  if (error) url.searchParams.set('error', error)
  return url
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const tokenHash = requestUrl.searchParams.get('token_hash')
  const type = requestUrl.searchParams.get('type')
  const code = requestUrl.searchParams.get('code')
  const supabase = await createServerSupabase()

  let exchangeError: Error | null = null
  if (tokenHash && type === 'recovery') {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    })
    exchangeError = error
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    exchangeError = error
  } else {
    exchangeError = new Error('Missing recovery credential')
  }

  if (exchangeError) {
    console.error('[auth] password recovery callback failed:', exchangeError.message)
    return NextResponse.redirect(resetPageUrl(request.url, 'invalid_or_expired'))
  }

  const { data, error: userError } = await supabase.auth.getUser()
  if (userError || !data.user) {
    console.error('[auth] password recovery session validation failed:', userError?.message)
    return NextResponse.redirect(resetPageUrl(request.url, 'invalid_or_expired'))
  }

  const response = NextResponse.redirect(resetPageUrl(request.url))
  response.headers.set('Cache-Control', 'no-store')
  response.cookies.set({
    name: PASSWORD_RECOVERY_COOKIE,
    value: '1',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: PASSWORD_RECOVERY_COOKIE_MAX_AGE_SECONDS,
  })
  return response
}
