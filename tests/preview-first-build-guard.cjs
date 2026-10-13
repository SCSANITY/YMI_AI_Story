'use strict'

// Verification preload only, never imported by product code. Empty public data
// is enough for homepage prerender; no production keys/data or network writes.
const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url)
  const method = String(init?.method ?? input?.method ?? 'GET').toUpperCase()
  if (url.hostname === 'build.supabase.test') {
    if (!['GET', 'HEAD'].includes(method) || !url.pathname.startsWith('/rest/v1/')) {
      throw new Error('offline_build_write_or_private_request_blocked')
    }
    return new Response(method === 'HEAD' ? null : '[]', {
      status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '*/0' },
    })
  }
  if (/supabase\.(?:co|net)$/.test(url.hostname)
    || ['api.openai.com', 'api.runpod.ai', 'api.stripe.com', 'api.resend.com', 'www.ymistory.com', 'ymistory.com'].includes(url.hostname)) {
    throw new Error('offline_build_production_network_blocked')
  }
  return originalFetch(input, init)
}
