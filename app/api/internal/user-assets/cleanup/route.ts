import { NextResponse } from 'next/server'
import { matchesSecret } from '@/lib/secret-compare'
import { processUserAssetCleanup } from '@/lib/user-asset-cleanup-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function isAuthorized(request: Request) {
  const internalSecret = process.env.INTERNAL_API_SECRET?.trim()
  const cronSecret = process.env.CRON_SECRET?.trim()
  return Boolean(
    matchesSecret(request.headers.get('x-internal-secret')?.trim(), internalSecret)
      || (cronSecret && matchesSecret(
        request.headers.get('authorization')?.trim(),
        `Bearer ${cronSecret}`
      ))
  )
}

async function run(request: Request) {
  if (!isAuthorized(request)) {
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
