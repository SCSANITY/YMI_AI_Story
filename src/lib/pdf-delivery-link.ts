/** Keep the original book-specific Storage grant in the fragment, outside site requests and logs. */
export function buildPdfDeliveryLink(orderUrl: string, orderId: string, signedPdf: string, checkoutEmail: string) {
  const token = new URL(signedPdf).searchParams.get('token')
  const payload = token?.split('.')[1]
  const expires: unknown = payload && JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).exp
  if (typeof expires !== 'number' || !Number.isSafeInteger(expires) || expires <= 0) {
    throw new Error('The signed PDF is missing a valid expiry')
  }
  const link = new URL('/book-preview/' + encodeURIComponent(orderId), orderUrl)
  link.searchParams.set('expires', String(expires))
  link.hash = new URLSearchParams({ pdf: signedPdf, email: checkoutEmail.trim() }).toString()
  return link.href
}
