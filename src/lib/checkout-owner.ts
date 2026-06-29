import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { createServerSupabase } from '@/lib/supabaseServer'
import { getOrCreateAnonSession } from '@/lib/session'

const ANON_COOKIE_NAME = 'ymi_anon_session'

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

export class CheckoutOwnerError extends Error {
  status: number

  constructor(message: string, status = 403) {
    super(message)
    this.name = 'CheckoutOwnerError'
    this.status = status
  }
}

function getCookieValue(request: Request, name: string) {
  const cookies = request.headers.get('cookie') || ''
  const entry = cookies
    .split(';')
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
  return entry ? decodeURIComponent(entry.split('=').slice(1).join('=')) : null
}

function normalizeNullable(value: unknown) {
  const normalized = String(value || '').trim()
  return normalized || null
}

async function resolveCustomerFromAuth() {
  const supabase = await createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.id) return null

  const { data: customer, error } = await supabaseAdmin
    .from('customers')
    .select('customer_id, email, auth_user_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (error) {
    throw new CheckoutOwnerError('Failed to resolve current customer', 500)
  }
  if (!customer?.customer_id) return null

  return {
    ownerType: 'customer' as const,
    customerId: String(customer.customer_id),
    email: customer.email ? String(customer.email).trim().toLowerCase() : user.email ?? null,
    authUserId: user.id,
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
  }
): Promise<CheckoutOwner | null> {
  const allowAnon = options?.allowAnon ?? true
  const expectedCustomerId = normalizeNullable(options?.expectedCustomerId)
  const customer = await resolveCustomerFromAuth()

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

export function ownerFilter(owner: CheckoutOwner) {
  return owner.ownerType === 'customer'
    ? { owner_type: 'customer', column: 'customer_id', value: owner.customerId }
    : { owner_type: 'anon', column: 'anon_session_id', value: owner.anonSessionId }
}

export function ownerJson(owner: CheckoutOwner | null) {
  if (!owner) return null
  return owner.ownerType === 'customer'
    ? { ownerType: 'customer', customerId: owner.customerId, email: owner.email }
    : { ownerType: 'anon', anonSessionId: owner.anonSessionId }
}

export async function requireCheckoutOrderAccess(
  orderIdOrDisplayId: string,
  owner: CheckoutOwner,
  options?: {
    allowAnonPaidOrder?: boolean
    requireUnpaid?: boolean
  }
) {
  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('order_id, display_id, order_status, payment_id, customer_id, email')
    .or(`order_id.eq.${orderIdOrDisplayId},display_id.eq.${orderIdOrDisplayId}`)
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

export function checkoutOwnerErrorResponse(error: unknown) {
  if (error instanceof CheckoutOwnerError) {
    return Response.json({ error: error.message }, { status: error.status })
  }
  return null
}
