import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getAuthenticatedClaims, getAuthenticatedUser } from '@/lib/authenticated-user'
import { getOrCreateAnonSession } from '@/lib/session'
import { UUID_REGEX } from '@/lib/validators'

const ANON_COOKIE_NAME = 'ymi_anon_session'
const DISPLAY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

export type CheckoutOwner =
  | {
      ownerType: 'customer'
      customerId: string
      email: string | null
      authUserId: string
      anonSessionId: null
    }
  | {
      ownerType: 'anon'
      customerId: null
      email: null
      authUserId: null
      anonSessionId: string
    }

// Asset custody can be delegated without manufacturing a login identity.
export type CheckoutAssetOwner =
  | {ownerType:'customer';customerId:string;anonSessionId:null}
  | {ownerType:'anon';customerId:null;anonSessionId:string}

class CheckoutOwnerError extends Error {
  status: number

  constructor(message: string, status = 403) {
    super(message)
    this.name = 'CheckoutOwnerError'
    this.status = status
  }
}

export function parseOrderReference(value: unknown) {
  const normalized = String(value ?? '').trim()
  if (UUID_REGEX.test(normalized)) return { column: 'order_id' as const, value: normalized }
  if (DISPLAY_ID_PATTERN.test(normalized)) return { column: 'display_id' as const, value: normalized }
  throw new CheckoutOwnerError('Invalid order reference', 400)
}

function getCookieValue(request: Request, name: string) {
  const cookies = request.headers.get('cookie') || ''
  const entry = cookies
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
  return entry ? decodeURIComponent(entry.split('=').slice(1).join('=')) : null
}

// Read-only access to the raw anon cookie. Never creates a session; the caller
// decides whether the value may be used as a guest-order read fallback.
export function getRequestAnonSessionId(request: Request) {
  return normalizeNullable(getCookieValue(request, ANON_COOKIE_NAME))
}

function normalizeNullable(value: unknown) {
  const normalized = String(value || '').trim()
  return normalized || null
}

async function resolveCustomerFromAuth(verification: 'remote' | 'claims') {
  const identity = verification === 'claims'
    ? await getAuthenticatedClaims()
    : await getAuthenticatedUser()

  if (!identity) return null

  const { data: customer, error } = await supabaseAdmin
    .from('customers')
    .select('customer_id, email, auth_user_id')
    .eq('auth_user_id', identity.id)
    .maybeSingle()

  if (error) {
    throw new CheckoutOwnerError('Failed to resolve current customer', 500)
  }
  if (!customer?.customer_id) return null

  return {
    ownerType: 'customer' as const,
    customerId: String(customer.customer_id),
    email: customer.email ? String(customer.email).trim().toLowerCase() : identity.email ?? null,
    authUserId: identity.id,
    anonSessionId: null,
  }
}

async function resolveAnonOwner(request: Request, createIfMissing: boolean) {
  const anonSessionId = createIfMissing
    ? await getOrCreateAnonSession()
    : getCookieValue(request, ANON_COOKIE_NAME)

  if (!anonSessionId) return null

  return {
    ownerType: 'anon' as const,
    customerId: null,
    email: null,
    authUserId: null,
    anonSessionId,
  }
}

export async function resolveCheckoutOwner(
  request: Request,
  options?: {
    allowAnon?: boolean
    createAnonIfMissing?: boolean
    expectedCustomerId?: string | null
    requireCustomer?: boolean
    optional?: boolean
    verification?: 'remote' | 'claims'
  }
): Promise<CheckoutOwner | null> {
  const allowAnon = options?.allowAnon ?? true
  const expectedCustomerId = normalizeNullable(options?.expectedCustomerId)
  const customer = await resolveCustomerFromAuth(options?.verification ?? 'remote')

  if (customer) {
    if (expectedCustomerId && expectedCustomerId !== customer.customerId) {
      throw new CheckoutOwnerError('Customer mismatch for current session', 403)
    }
    return customer
  }

  if (expectedCustomerId) {
    throw new CheckoutOwnerError('Authentication required for this customer', 401)
  }

  if (options?.requireCustomer) {
    throw new CheckoutOwnerError('Authentication required', 401)
  }

  if (allowAnon) {
    const anon = await resolveAnonOwner(request, Boolean(options?.createAnonIfMissing))
    if (anon) return anon
  }

  if (options?.optional) return null
  throw new CheckoutOwnerError('Checkout session not found', 401)
}

export function ownerFilter(owner: CheckoutAssetOwner) {
  return owner.ownerType === 'customer'
    ? { owner_type: 'customer', column: 'customer_id', value: owner.customerId } as const
    : { owner_type: 'anon', column: 'anon_session_id', value: owner.anonSessionId } as const
}

// Supabase's generated query-builder type becomes prohibitively deep when it is
// threaded through a shared helper. Keep the dynamic boundary in this one
// server-owned authority instead of repeating it in every route.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function scopeCheckoutOwnerQuery(query: any, owner: CheckoutOwner): any {
  const filter = ownerFilter(owner)
  return query.eq('owner_type', filter.owner_type).eq(filter.column, filter.value)
}

export async function requireCheckoutOrderAccess(
  orderIdOrDisplayId: string,
  owner: CheckoutOwner,
  options?: {
    allowAnonPaidOrder?: boolean
    requireUnpaid?: boolean
  }
) {
  const reference = parseOrderReference(orderIdOrDisplayId)
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('order_id, display_id, order_status, payment_id, customer_id, email, checkout_session_id')
    .eq(reference.column, reference.value)
    .maybeSingle()

  if (orderError) {
    throw new CheckoutOwnerError('Failed to load order', 500)
  }
  if (!order?.order_id) {
    throw new CheckoutOwnerError('Order not found', 404)
  }
  if (options?.requireUnpaid && (order.order_status !== 'unpaid' || order.payment_id)) {
    throw new CheckoutOwnerError('Only unpaid orders can be changed here', 409)
  }

  if (owner.ownerType === 'customer') {
    if (order.customer_id !== owner.customerId) {
      throw new CheckoutOwnerError('Order does not belong to the current customer', 403)
    }
    return order
  }

  if (order.order_status !== 'unpaid' && !options?.allowAnonPaidOrder) {
    throw new CheckoutOwnerError('Order does not belong to the current session', 403)
  }

  const { data: cartItems, error: cartItemsError } = await supabaseAdmin
    .from('cart_items')
    .select('cart_item_id, owner_type, anon_session_id, status')
    .eq('order_id', order.order_id)

  if (cartItemsError) {
    throw new CheckoutOwnerError('Failed to load order items', 500)
  }

  const linkedItems = cartItems ?? []
  const belongsToAnonSession =
    linkedItems.length > 0 &&
    linkedItems.every(
      (item) =>
        item.owner_type === 'anon' &&
        item.anon_session_id === owner.anonSessionId &&
        item.status === 'ordered'
    )

  if (!belongsToAnonSession) {
    throw new CheckoutOwnerError('Order does not belong to the current session', 403)
  }

  return order
}

// Read-only dual-identity access for the checkout restore GET endpoints. A
// signed-in customer may read back their own unclaimed guest order when the
// browser still carries the matching anon cookie (the merge claim may lag the
// first restore request). The returned readOwner is the identity the caller
// must use for any follow-up owner-scoped query, so a customer falling back to
// a guest order reads it through the anon filter. Write paths never use this.
export async function requireCheckoutOrderReadAccess(
  orderIdOrDisplayId: string,
  owner: CheckoutOwner,
  options?: {
    fallbackAnonSessionId?: string | null
  }
) {
  if (owner.ownerType === 'anon') {
    const order = await requireCheckoutOrderAccess(orderIdOrDisplayId, owner)
    return { order, readOwner: owner as CheckoutOwner }
  }

  const reference = parseOrderReference(orderIdOrDisplayId)
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('order_id, display_id, order_status, payment_id, customer_id, email, checkout_session_id')
    .eq(reference.column, reference.value)
    .maybeSingle()

  if (orderError) {
    throw new CheckoutOwnerError('Failed to load order', 500)
  }
  if (!order?.order_id) {
    throw new CheckoutOwnerError('Order not found', 404)
  }
  if (order.customer_id === owner.customerId) {
    return { order, readOwner: owner as CheckoutOwner }
  }

  // Guest-order fallback: only an unpaid, unpaid-for, unclaimed order whose
  // rows all belong to this browser's anon session may be read.
  const fallbackAnonSessionId = normalizeNullable(options?.fallbackAnonSessionId)
  const fallbackDenied = () => new CheckoutOwnerError('Order does not belong to the current session', 403)
  if (!fallbackAnonSessionId) throw fallbackDenied()
  if (order.order_status !== 'unpaid' || order.payment_id || order.customer_id) {
    throw fallbackDenied()
  }

  const { data: cartItems, error: cartItemsError } = await supabaseAdmin
    .from('cart_items')
    .select('cart_item_id, owner_type, anon_session_id, status')
    .eq('order_id', order.order_id)

  if (cartItemsError) {
    throw new CheckoutOwnerError('Failed to load order items', 500)
  }

  const linkedItems = cartItems ?? []
  const belongsToFallbackSession =
    linkedItems.length > 0 &&
    linkedItems.every(
      (item) =>
        item.owner_type === 'anon' &&
        item.anon_session_id === fallbackAnonSessionId &&
        item.status === 'ordered'
    )

  if (!belongsToFallbackSession) {
    throw fallbackDenied()
  }

  const readOwner: CheckoutOwner = {
    ownerType: 'anon',
    customerId: null,
    email: null,
    authUserId: null,
    anonSessionId: fallbackAnonSessionId,
  }
  return { order, readOwner }
}

export function checkoutOwnerErrorResponse(error: unknown) {
  if (error instanceof CheckoutOwnerError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  return null
}