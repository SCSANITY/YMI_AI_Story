import { NextResponse } from 'next/server'
import { isInternalRequestAuthorized } from '@/lib/internal-request-auth'
import { processUserAssetCleanup } from '@/lib/user-asset-cleanup-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function run(request: Request) {
  if (!isInternalRequestAuthorized(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  try {
    const result = await processUserAssetCleanup()
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[user-assets] scheduled cleanup failed', error)
    return NextResponse.json(
      { error: 'User asset cleanup failed' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}

export const GET = run
export const POST = run
