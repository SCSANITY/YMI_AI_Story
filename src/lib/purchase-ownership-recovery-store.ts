import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type {
  PurchaseOwnershipRecoveryStore,
  PurchaseRecoveryCartItem,
  PurchaseRecoveryOrder,
  PurchaseRecoveryOwnedRow,
} from '@/lib/purchase-ownership-recovery'

function throwQueryError(operation: string, error: { message?: string } | null) {
  if (error) throw new Error(`${operation}: ${error.message || 'unknown database error'}`)
}

export const supabasePurchaseOwnershipRecoveryStore: PurchaseOwnershipRecoveryStore = {
  async loadCustomerOrderedCartItems(customerId) {
    const { data, error } = await supabaseAdmin
      .from('cart_items')
      .select('creation_id, order_id, owner_type, customer_id, status')
      .eq('owner_type', 'customer')
      .eq('customer_id', customerId)
      .eq('status', 'ordered')
      .not('creation_id', 'is', null)
      .not('order_id', 'is', null)

    throwQueryError('Failed to load purchased cart items', error)
    return (data ?? []) as PurchaseRecoveryCartItem[]
  },

  async loadOrders(orderIds) {
    if (!orderIds.length) return []
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('order_id, customer_id, order_status')
      .in('order_id', orderIds)

    throwQueryError('Failed to load purchase orders', error)
    return (data ?? []) as PurchaseRecoveryOrder[]
  },

  async loadCartItemsByCreation(creationIds) {
    if (!creationIds.length) return []
    const { data, error } = await supabaseAdmin
      .from('cart_items')
      .select('creation_id, order_id, owner_type, customer_id, status')
      .in('creation_id', creationIds)
      .not('order_id', 'is', null)

    throwQueryError('Failed to inspect purchased creation references', error)
    return (data ?? []) as PurchaseRecoveryCartItem[]
  },

  async loadCreations(creationIds) {
    if (!creationIds.length) return []
    const { data, error } = await supabaseAdmin
      .from('creations')
      .select('creation_id, owner_type, customer_id')
      .in('creation_id', creationIds)

    throwQueryError('Failed to inspect purchased creations', error)
    return (data ?? []) as PurchaseRecoveryOwnedRow[]
  },

  async loadCreationJobs(creationIds) {
    if (!creationIds.length) return []
    const { data, error } = await supabaseAdmin
      .from('jobs')
      .select('creation_id, owner_type, customer_id')
      .in('creation_id', creationIds)
      .in('job_type', ['preview', 'final'])

    throwQueryError('Failed to inspect purchased creation jobs', error)
    return (data ?? []) as PurchaseRecoveryOwnedRow[]
  },

  async transferAnonymousJobs(creationIds, customerId) {
    if (!creationIds.length) return 0
    const { data, error } = await supabaseAdmin
      .from('jobs')
      .update({
        owner_type: 'customer',
        customer_id: customerId,
        anon_session_id: null,
      })
      .in('creation_id', creationIds)
      .in('job_type', ['preview', 'final'])
      .eq('owner_type', 'anon')
      .is('customer_id', null)
      .select('job_id')

    throwQueryError('Failed to recover purchased creation jobs', error)
    return data?.length ?? 0
  },

  async transferAnonymousCreations(creationIds, customerId) {
    if (!creationIds.length) return 0
    const { data, error } = await supabaseAdmin
      .from('creations')
      .update({
        owner_type: 'customer',
        customer_id: customerId,
        anon_session_id: null,
        updated_at: new Date().toISOString(),
      })
      .in('creation_id', creationIds)
      .eq('owner_type', 'anon')
      .is('customer_id', null)
      .select('creation_id')

    throwQueryError('Failed to recover purchased creations', error)
    return data?.length ?? 0
  },
}
