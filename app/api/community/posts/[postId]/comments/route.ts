import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'Comments are disabled on the announcement board.' },
    { status: 410 }
  )
}
