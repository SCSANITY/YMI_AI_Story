import type Stripe from 'stripe'

/**
 * Canonical shipping-address contract — the ONE schema used across checkout, storage,
 * fulfillment, emails and order display. Street lives in addressLine1-3
 * (NOT a flat `address`). This is the source-of-truth shape written by the checkout form,
 * and all stored rows conform after `Template_folder/sql_unify_shipping_address_schema.sql`.
 */
export type ShippingAddress = {
  firstName?: string
  lastName?: string
  email?: string
  addressLine1?: string
  addressLine2?: string
  addressLine3?: string
  city?: string
  region?: string
  zip?: string
  country?: string
  phone?: string
  company?: string
  recipientEmail?: string
  vatNumber?: string
  eoriNumber?: string
  iossNumber?: string
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
  return [addr.addressLine1, addr.addressLine2, addr.addressLine3]
    .map((v) => (v == null ? '' : String(v).trim()))
    .filter(Boolean)
    .join(', ')
}

// Portal input limits are kept separate from the narrower booking API limits.
// No booking adapter may silently truncate these saved customer values.
export const RECIPIENT_ADDRESS_LIMITS = {
  name: 35,
  company: 30,
  recipientEmail: 50,
  phone: 15,
  zip: 20,
  region: 30,
  city: 30,
  addressLine1: 30,
  addressLine2: 30,
  addressLine3: 30,
  vatNumber: 30,
  eoriNumber: 30,
  iossNumber: 30,
} as const

const ADDRESS_TEXT_FIELDS = [
  'firstName', 'lastName', 'email', 'shippingRegionKey',
  'shippingDestinationLabel', 'region', 'city', 'addressLine1',
  'addressLine2', 'addressLine3', 'zip', 'phone', 'company',
  'recipientEmail', 'vatNumber', 'eoriNumber', 'iossNumber',
] as const

/** Normalize only known fields before writing orders.shipping_address or user_assets.metadata. */
export function normalizeShippingAddress(raw: unknown): ShippingAddress {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const input = raw as Record<string, unknown>
  const address: ShippingAddress = {}
  for (const field of ADDRESS_TEXT_FIELDS) {
    const value = input[field]
    if (typeof value === 'string') address[field] = value.trim()
  }
  if (typeof input.country === 'string') address.country = input.country.trim().toUpperCase()
  return address
}

/** Returns the offending field; the checkout contact email is validated separately. */
export function recipientAddressIssue(address: ShippingAddress): string | null {
  for (const field of ['firstName', 'lastName', 'country', 'region', 'city', 'addressLine1', 'zip', 'phone'] as const) {
    if (!address[field]?.trim()) return field
  }
  if ((address.firstName!.length + address.lastName!.length + 1) > RECIPIENT_ADDRESS_LIMITS.name) return 'name'
  if (!/^[A-Z]{2}$/.test(address.country!)) return 'country'
  if (!/^\+?[0-9][0-9 ()-]*$/.test(address.phone!)) return 'phone'
  for (const field of Object.keys(RECIPIENT_ADDRESS_LIMITS) as (keyof typeof RECIPIENT_ADDRESS_LIMITS)[]) {
    if (field === 'name') continue
    if ((address[field]?.length ?? 0) > RECIPIENT_ADDRESS_LIMITS[field]) return field
  }
  if (address.recipientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address.recipientEmail)) return 'recipientEmail'
  return null
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
