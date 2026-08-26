type CheckoutLocationParts = {
  pathname: string
  search: string
  hash?: string
}

export function removeCheckoutPaymentResumeStep({
  pathname,
  search,
  hash = '',
}: CheckoutLocationParts): string | null {
  const params = new URLSearchParams(search)
  if (params.get('step') !== 'payment') return null

  params.delete('step')
  const nextSearch = params.toString()
  return `${pathname}${nextSearch ? `?${nextSearch}` : ''}${hash}`
}
