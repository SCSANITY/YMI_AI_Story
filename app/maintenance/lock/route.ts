import { NextRequest, NextResponse } from 'next/server'

const BYPASS_COOKIE = 'ymi_maintenance_bypass'

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/maintenance', request.url))
  response.cookies.set({
    name: BYPASS_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })

  return response
}
