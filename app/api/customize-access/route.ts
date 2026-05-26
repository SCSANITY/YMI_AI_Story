import { NextResponse } from 'next/server'
import { getCustomizeAccessSettings } from '@/lib/customize-access-server'

export async function GET() {
  const customizeAccess = await getCustomizeAccessSettings()

  return NextResponse.json(
    { customizeAccess },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    }
  )
}
