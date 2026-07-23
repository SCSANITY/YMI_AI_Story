import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { getCustomizeAccessSettings, setCustomizeAccessEnabled } from '@/lib/customize-access-server'

export async function GET() {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const customizeAccess = await getCustomizeAccessSettings({ failOnError: true })
    return NextResponse.json(
      { customizeAccess },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load customize access'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const enabled = Boolean(body?.enabled)

  try {
    const customizeAccess = await setCustomizeAccessEnabled(enabled, admin.customer_id)
    return NextResponse.json({ customizeAccess })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update customize access'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
