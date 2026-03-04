import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getOrCreateAnonSession } from '@/lib/session'

export async function POST() {
  try {
    const anonSessionId = await getOrCreateAnonSession()
    return NextResponse.json({ anonSessionId })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to create anon session'
    console.error('[anon-session] error:', message)
    return NextResponse.json(
      { error: process.env.NODE_ENV === 'production' ? 'Failed to create anon session' : message },
      { status: 500 }
    )
  }
}

export async function DELETE() {
  const cookieStore = await cookies()
  cookieStore.set({
    name: 'ymi_anon_session',
    value: '',
    maxAge: 0,
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  })
  return NextResponse.json({ success: true })
}
