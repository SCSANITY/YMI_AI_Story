import assert from 'node:assert/strict'
import test from 'node:test'
import { recordA9SupabaseCall, withA9Diagnostics } from './a9-diagnostics'

process.env.YMI_A9_DIAGNOSTICS = 'true'

test('diagnostic response records instance, request and Supabase timing metadata', async () => {
  const response = await withA9Diagnostics(async () => {
    const startedAt = performance.now()
    recordA9SupabaseCall(new URL('https://example.supabase.co/rest/v1/customers'), 'GET', startedAt, 12.3)
    return new Response('ok')
  })

  const serverTiming = response.headers.get('Server-Timing') ?? ''
  assert.match(serverTiming, /a9-instance;desc="[0-9a-f-]+"/)
  assert.match(serverTiming, /a9-seq;desc="1"/)
  assert.match(serverTiming, /a9-inflight;desc="0"/)
  assert.match(serverTiming, /a9-cold;desc="1"/)
  assert.match(serverTiming, /a9-handler;dur=/)
  assert.match(serverTiming, /rest\.customers;dur=12\.3;desc="GET@/)
})

test('diagnostic names identify signed Storage upload calls by bucket', async () => {
  process.env.YMI_A9_DIAGNOSTICS = 'true'
  const response = await withA9Diagnostics(async () => {
    const startedAt = performance.now()
    recordA9SupabaseCall(new URL('https://example.supabase.co/storage/v1/object/upload/sign/raw-private/user-assets/x.jpg'), 'POST', startedAt, 4.2)
    return new Response('ok')
  })

  assert.match(response.headers.get('Server-Timing') ?? '', /storage\.raw-private;dur=4\.2;desc="POST@/)
})

test('diagnostic response is unchanged when the flag is off', async () => {
  process.env.YMI_A9_DIAGNOSTICS = 'false'
  const response = await withA9Diagnostics(async () => new Response('ok'))
  assert.equal(response.headers.get('Server-Timing'), null)
})
