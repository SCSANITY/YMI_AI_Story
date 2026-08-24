import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'

export async function POST() {
  const admin = await requireAdminCustomer()
  if (!admin) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    )
  }
  return NextResponse.json(
    { error: 'This legacy reply endpoint has been retired. Use the General Mail workspace.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } }
  )
}
