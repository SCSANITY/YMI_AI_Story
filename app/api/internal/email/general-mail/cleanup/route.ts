import { NextResponse } from 'next/server'
import { processAbandonedGeneralMailAttachments } from '@/lib/general-mail-attachment-server'
import { isInternalRequestAuthorized } from '@/lib/internal-request-auth'

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
    const result = await processAbandonedGeneralMailAttachments()
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[general-mail] attachment cleanup failed', error)
    return NextResponse.json(
      { error: 'General mail attachment cleanup failed' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}

export const GET = run
export const POST = run
