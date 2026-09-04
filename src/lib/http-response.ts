import 'server-only'

import { NextResponse } from 'next/server'

export const PRIVATE_NO_STORE_CACHE_CONTROL = 'private, no-store, max-age=0'

export function noStoreJson(
  body: unknown,
  init: ResponseInit | number = {}
) {
  const response = NextResponse.json(
    body,
    typeof init === 'number' ? { status: init } : init
  )
  response.headers.set('Cache-Control', PRIVATE_NO_STORE_CACHE_CONTROL)
  return response
}
