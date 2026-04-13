import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const BYPASS_COOKIE = 'ymi_maintenance_bypass'

const ALLOWED_API_PREFIXES = [
  '/api/webhooks/',
  '/api/internal/',
]

function isMaintenanceEnabled() {
  return process.env.MAINTENANCE_MODE === 'true'
}

function hasBypass(request: NextRequest) {
  return request.cookies.get(BYPASS_COOKIE)?.value === '1'
}

function isAllowedPath(pathname: string) {
  if (
    pathname === '/maintenance' ||
    pathname.startsWith('/maintenance/unlock') ||
    pathname.startsWith('/maintenance/lock')
  ) {
    return true
  }

  if (pathname.startsWith('/_next/')) return true
  if (pathname === '/favicon.ico') return true
  if (pathname.includes('.')) return true

  if (pathname.startsWith('/api/')) {
    return ALLOWED_API_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  }

  return false
}

export async function proxy(request: NextRequest) {
  if (isMaintenanceEnabled()) {
    const { pathname } = request.nextUrl

    if (!isAllowedPath(pathname) && !hasBypass(request)) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          {
            error: 'Site is temporarily under maintenance.',
            code: 'maintenance_mode',
          },
          { status: 503 }
        )
      }

      const maintenanceUrl = request.nextUrl.clone()
      maintenanceUrl.pathname = '/maintenance'
      maintenanceUrl.search = ''
      return NextResponse.redirect(maintenanceUrl)
    }
  }

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
