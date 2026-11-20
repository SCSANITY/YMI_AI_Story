import { isUuid } from '@/lib/validators'

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params
  const expires = Number(new URL(request.url).searchParams.get('expires'))
  const valid = isUuid(orderId) && Number.isSafeInteger(expires) && expires > 0
  const now = Date.now()
  const ready = valid && expires * 1000 > now
  const expired = valid && !ready
  const title = ready ? 'Your PDF preview is ready' : expired ? 'Your preview link has expired' : 'Preview link unavailable'
  const message = expired
    ? 'PDF preview links are valid for 72 hours. You can still view your order details.'
    : ready ? 'Your download will start shortly. You can also open your order below.' : 'Open your order to view your book details.'
  const orderPath = isUuid(orderId) ? '/orders/' + orderId : '/orders'
  const origins = [process.env.SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_URL]
    .filter((url): url is string => Boolean(url)).map(url => new URL(url).origin)
  const script = valid ? '<script defer src="/pdf-preview/open.js"></script>' : ''
  return new Response(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} | YMI Story</title><link rel="stylesheet" href="/pdf-preview/card.css">${script}</head>
<body data-ready="${ready}" data-origins="${encodeURIComponent(JSON.stringify(origins))}" data-now="${now}" data-expires="${valid ? expires : 0}">
<main><article aria-labelledby="title">
<img class="logo" src="/email-assets/logo-full.png" alt="YMI Story">
<h1 id="title">${title}</h1><p id="message">${message}</p>
${expired ? `<section class="access" aria-label="Order access">
<p>Checked out as a guest? Sign in or create an account with the email you used at checkout.</p>
<div id="email-row" hidden><div class="email-field"><span class="label">Checkout email</span><span id="email"></span></div>
<button type="button" id="copy" aria-label="Copy checkout email"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 5V4a1 1 0 0 0-1-1H5a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h1"/></svg>Copy</button></div>
<p id="google" hidden>Using Gmail? Choose <strong>Continue with Google</strong> to sign in directly.</p>
<p id="feedback" role="status"></p></section>` : ''}
<div class="actions"><a class="button" href="${orderPath}">Open My Order <span aria-hidden="true">→</span></a>
${ready ? '<a id="download" hidden>Download PDF</a>' : ''}</div>
<img class="seal" src="/email-assets/seal.png" alt="" aria-hidden="true">
</article></main></body></html>`, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}
