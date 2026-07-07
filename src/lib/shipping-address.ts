import type Stripe from 'stripe'

/**
 * Canonical shipping-address contract — the ONE schema used across checkout, storage,
 * fulfillment, emails and order display. Street lives in `addressLine1`/`addressLine2`
 * (NOT a flat `address`). This is the source-of-truth shape written by the checkout form,
 * and all stored rows conform after `Template_folder/sql_unify_shipping_address_schema.sql`.
 */
export type ShippingAddress = {
  firstName?: string
  lastName?: string
  email?: string
  addressLine1?: string
  addressLine2?: string
  city?: string
  region?: string
  zip?: string
  country?: string
  phone?: string
  company?: string
  shippingRegionKey?: string
  shippingDestinationLabel?: string
}

/** A stored address has real content (i.e. was entered at checkout). */
export function hasShippingAddress(addr: Record<string, unknown> | null | undefined): boolean {
  if (!addr) return false
  return Boolean(
    String((addr.addressLine1 as string) ?? '').trim() ||
      String((addr.city as string) ?? '').trim()
  )
}

/** The street line for display/email. */
export function shippingStreet(addr: Record<string, unknown> | null | undefined): string {
  if (!addr) return ''
  return [addr.addressLine1, addr.addressLine2]
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean)
    .join(', ')
}

/**
 * Map Stripe `customer_details` to the canonical schema. Stripe details are BILLING info
 * and are used ONLY as a fallback when the order has no stored shipping address — never to
 * overlay/clobber the address the customer entered at checkout.
 */
export function stripeDetailsToShippingAddress(
  details: Stripe.Checkout.Session.CustomerDetails | null | undefined
): ShippingAddress {
  const address = details?.address
  if (!address) return {}
  const name = details?.name || ''
  return {
    firstName: name.split(' ').slice(0, -1).join(' ') || '',
    lastName: name.split(' ').slice(-1).join(' ') || '',
    addressLine1: address.line1 || '',
    addressLine2: address.line2 || '',
    city: address.city || '',
    region: address.state || '',
    zip: address.postal_code || '',
    country: address.country || '',
  }
}

/**
 * Resolve the address to persist at payment finalization: the order's stored shipping
 * address (entered at checkout) is authoritative; Stripe billing details fill in only when
 * the order has no address at all. One clean rule — no field-by-field clobber.
 */
export function resolveShippingAddress(
  stored: Record<string, unknown> | null | undefined,
  details: Stripe.Checkout.Session.CustomerDetails | null | undefined
): ShippingAddress {
  if (hasShippingAddress(stored)) return stored as ShippingAddress
  return stripeDetailsToShippingAddress(details)
}
