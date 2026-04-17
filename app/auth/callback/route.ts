import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabaseServer'

function resolveSafeRedirect(next: string | null, origin: string) {
  if (!next || !next.startsWith('/') || next.startsWith('//')) {
    return new URL('/', origin)
  }

  return new URL(next, origin)
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next')

  if (code) {
    const supabase = await createServerSupabase()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      console.error('[auth] OAuth callback exchange failed:', error.message)
    }
  }

  return NextResponse.redirect(resolveSafeRedirect(next, origin))
}
