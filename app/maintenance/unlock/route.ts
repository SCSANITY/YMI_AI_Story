import { NextRequest, NextResponse } from 'next/server'

const BYPASS_COOKIE = 'ymi_maintenance_bypass'
const COOKIE_MAX_AGE = 60 * 60 * 12

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || ''
  const returnTo = request.nextUrl.searchParams.get('returnTo') || '/'
  const expected = process.env.MAINTENANCE_BYPASS_SECRET || ''

  if (!expected || token !== expected) {
    return NextResponse.redirect(new URL('/maintenance?error=invalid_token', request.url))
  }

  const destination = returnTo.startsWith('/') ? returnTo : '/'
  const response = NextResponse.redirect(new URL(destination, request.url))
  response.cookies.set({
    name: BYPASS_COOKIE,
    value: '1',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })

  return response
}
