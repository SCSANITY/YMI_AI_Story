import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'Community uploads are disabled. Announcements are managed by admins.' },
    { status: 410 }
  )
}
