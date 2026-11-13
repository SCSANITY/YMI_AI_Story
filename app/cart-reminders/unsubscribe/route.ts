import { unsubscribeCartReminder, validCartUnsubscribeToken } from '@/lib/cart-reminder-server'

function page(title: string, content: string, status = 200) {
  return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title} | YMI Story</title></head><body><main><p>YMI Story</p><h1>${title}</h1>${content}</main></body></html>`, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

const invalid = () => page('Invalid unsubscribe link', '<p>Please open the link from your cart reminder email.</p>', 400)

export function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')
  if (!validCartUnsubscribeToken(token)) return invalid()
  // The verifier accepts only a UUID, a dot, and a hex HMAC.
  return page('Unsubscribe from cart reminders', `<p>This stops weekly cart reminders.</p><form method="post" action="/cart-reminders/unsubscribe"><input type="hidden" name="token" value="${token}"><button type="submit">Unsubscribe</button></form>`)
}

export async function POST(request: Request) {
  if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/x-www-form-urlencoded') return invalid()
  const reader = request.body?.getReader()
  if (!reader) return invalid()
  let body = ''
  let size = 0
  const decoder = new TextDecoder()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 256) {
        await reader.cancel()
        return invalid()
      }
      body += decoder.decode(value, { stream: true })
    }
  } catch {
    return invalid()
  }
  body += decoder.decode()
  const grantId = validCartUnsubscribeToken(new URLSearchParams(body).get('token'))
  if (!grantId) return invalid()
  try {
    await unsubscribeCartReminder(grantId)
    return page('You’re unsubscribed', '<p>You won’t receive weekly cart reminders anymore.</p>')
  } catch {
    return page('Could not unsubscribe', '<p>Please try again using the link in your email.</p>', 503)
  }
}
