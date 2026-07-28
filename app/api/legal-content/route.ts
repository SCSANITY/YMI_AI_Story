import { NextResponse } from 'next/server'
import { getPublishedLegalContentSnapshot } from '@/lib/published-legal-content'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const content = await getPublishedLegalContentSnapshot()
    return NextResponse.json(
      { content },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Published legal content is unavailable'
    return NextResponse.json(
      { error: message },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      },
    )
  }
}
