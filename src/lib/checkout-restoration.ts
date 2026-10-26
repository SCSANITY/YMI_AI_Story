import type { OrderDiscountSummary } from './discounts'

export type CheckoutAddressForm = {
  firstName: string; lastName: string; email: string; country: string;
  shippingRegionKey: string; shippingDestinationLabel: string; region: string;
  city: string; addressLine1: string; addressLine2: string; addressLine3: string;
  zip: string; phone: string; company: string; recipientEmail: string;
  vatNumber: string; eoriNumber: string; iossNumber: string;
}
export type ShippingMethodCode = 'standard' | 'speedy'
export type ShippingQuoteOption = {
  methodCode: ShippingMethodCode; methodName: string; methodDescription?: string | null;
  speedLabel?: string | null; amountUsd: number; displayAmount?: string | null;
  rateName?: string | null; estimatedDelivery?: string | null; message?: string | null;
  snapshot: Record<string, unknown> | null;
}
export type ShippingQuoteState = {
  status: 'idle' | 'missing' | 'loading' | 'available' | 'unavailable' | 'error';
  options: ShippingQuoteOption[]; selectedMethod: ShippingMethodCode | null; message: string | null;
}
export const EMPTY_SHIPPING_QUOTE: ShippingQuoteState = {
  status: 'missing', options: [], selectedMethod: null, message: null,
}

const text = (value: unknown) => typeof value === 'string' ? value : ''

export class CheckoutReturnStateError extends Error {
  constructor(readonly outcome: 'paid' | 'closed') {
    super(outcome === 'paid' ? 'This order has been paid.' : 'This checkout is closed.')
    this.name = 'CheckoutReturnStateError'
  }
}

export function restoreCheckoutOrder(order: Record<string, unknown>) {
  if (typeof order.order_status !== 'string' || !order.order_status) throw new Error('Unable to read the order state.')
  if (order.order_status !== 'unpaid') {
    throw new CheckoutReturnStateError(['paid', 'production', 'shipped', 'delivered'].includes(order.order_status) ? 'paid' : 'closed')
  }
  const address = (order.shipping_address ?? {}) as Record<string, unknown>
  const form: CheckoutAddressForm = {
    firstName: text(address.firstName), lastName: text(address.lastName),
    email: text(address.email) || text(order.email), country: text(address.country),
    shippingRegionKey: text(address.shippingRegionKey) || text(address.regionKey),
    shippingDestinationLabel: text(address.shippingDestinationLabel) || text(address.destinationLabel),
    region: text(address.region), city: text(address.city),
    addressLine1: text(address.addressLine1), addressLine2: text(address.addressLine2),
    addressLine3: text(address.addressLine3), zip: text(address.zip), phone: text(address.phone),
    company: text(address.company), recipientEmail: text(address.recipientEmail),
    vatNumber: text(address.vatNumber), eoriNumber: text(address.eoriNumber), iossNumber: text(address.iossNumber),
  }
  const amount = order.shipping_amount_usd
  const snapshot = order.shipping_rate_snapshot as Record<string, unknown> | null
  const method = order.shipping_method
  // A zero quote can be legitimate; a missing method/snapshot is not a quote.
  const hasQuote = typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 &&
    (method === 'standard' || method === 'speedy') && snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) &&
    typeof snapshot.zoneCode === 'string' && Boolean(snapshot.zoneCode.trim())
  const quote: ShippingQuoteState = hasQuote ? {
    status: 'available', selectedMethod: method, message: null,
    options: [{ methodCode: method, methodName: text(snapshot.methodName) || text(snapshot.rateName) || method,
      amountUsd: amount, estimatedDelivery: text(snapshot.estimatedDelivery) || null,
      rateName: text(snapshot.rateName) || null, snapshot }],
  } : EMPTY_SHIPPING_QUOTE
  const discounts = order.checkout_discounts as OrderDiscountSummary | undefined
  if (!discounts ||
      discounts.productDiscountInstrumentId !== (order.applied_product_discount_instrument_id ?? null) ||
      discounts.shippingDiscountInstrumentId !== (order.applied_shipping_discount_instrument_id ?? null)) {
    throw new Error('Unable to restore the order discounts.')
  }
  return { form, quote, discounts }
}

export function shippingDiscountRefreshKey(orderId: string, instrumentId: string | null, quote: ShippingQuoteState) {
  const option = quote.options.find(option => option.methodCode === quote.selectedMethod)
  return instrumentId && option ? `${orderId}:${instrumentId}:${option.amountUsd}:${option.methodCode}` : ''
}
