import { cookies, headers } from 'next/headers'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const COOKIE_NAME = 'ymi_anon_session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30

export async function getOrCreateAnonSession(): Promise<string> {
  const cookieStore = await cookies()
  const headerStore = await headers()

  const existing = cookieStore.get(COOKIE_NAME)?.value ?? null
  if (existing) {
    const { data, error } = await supabaseAdmin
      .from('anon_sessions')
      .select('anon_session_id')
      .eq('anon_session_id', existing)
      .maybeSingle()

    if (error) {
      throw new Error(`Failed to verify anon session: ${error.message}`)
    }

    if (data?.anon_session_id) {
      const { error: updateError } = await supabaseAdmin
        .from('anon_sessions')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('anon_session_id', existing)
      if (updateError) {
        throw new Error(`Failed to update anon session: ${updateError.message}`)
      }
      return existing
    }
  }

  const anonSessionId = randomUUID()
  const forwarded = headerStore.get('x-forwarded-for')
  const ipAddress =
    (forwarded ? forwarded.split(',')[0]?.trim() : null) ||
    headerStore.get('x-real-ip') ||
    null

  const { error } = await supabaseAdmin
    .from('anon_sessions')
    .insert({
      anon_session_id: anonSessionId,
      ip_address: ipAddress ?? undefined,
      last_seen_at: new Date().toISOString(),
    })

  if (error) {
    throw new Error(`Failed to create anon session: ${error.message}`)
  }

  cookieStore.set({
    name: COOKIE_NAME,
    value: anonSessionId,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
    sameSite: 'lax',
  })

  return anonSessionId
}
