import { isPaidLikeOrderStatus } from '@/lib/order-status'

type OwnerType = 'anon' | 'customer'

export type PurchaseRecoveryCartItem = {
  creation_id: string | null
  order_id: string | null
  owner_type: string | null
  customer_id: string | null
  status: string | null
}

export type PurchaseRecoveryOrder = {
  order_id: string
  customer_id: string | null
  order_status: string | null
}

export type PurchaseRecoveryOwnedRow = {
  creation_id: string
  owner_type: string | null
  customer_id: string | null
}

export type PurchaseOwnershipRecoveryStore = {
  loadCustomerOrderedCartItems(customerId: string): Promise<PurchaseRecoveryCartItem[]>
  loadOrders(orderIds: string[]): Promise<PurchaseRecoveryOrder[]>
  loadCartItemsByCreation(creationIds: string[]): Promise<PurchaseRecoveryCartItem[]>
  loadCreations(creationIds: string[]): Promise<PurchaseRecoveryOwnedRow[]>
  loadCreationJobs(creationIds: string[]): Promise<PurchaseRecoveryOwnedRow[]>
  transferAnonymousJobs(creationIds: string[], customerId: string): Promise<number>
  transferAnonymousCreations(creationIds: string[], customerId: string): Promise<number>
}

export type PurchaseOwnershipRecoveryResult = {
  eligibleCreationCount: number
  recoveredCreationCount: number
  recoveredJobCount: number
  alreadyOwnedCreationCount: number
}

export class PurchaseOwnershipConflictError extends Error {
  creationIds: string[]

  constructor(creationIds: string[]) {
    super('Purchased creation ownership conflict')
    this.name = 'PurchaseOwnershipConflictError'
    this.creationIds = creationIds
  }
}

const EMPTY_RESULT: PurchaseOwnershipRecoveryResult = {
  eligibleCreationCount: 0,
  recoveredCreationCount: 0,
  recoveredJobCount: 0,
  alreadyOwnedCreationCount: 0,
}

function uniqueValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)))
}

function hasExpectedOwner(
  row: { owner_type: string | null; customer_id: string | null },
  customerId: string
) {
  return row.owner_type === 'customer' && row.customer_id === customerId
}

function isTransferableAnonymousOwner(row: {
  owner_type: string | null
  customer_id: string | null
}) {
  return row.owner_type === 'anon' && !row.customer_id
}

function isSupportedOwnerType(value: string | null): value is OwnerType {
  return value === 'anon' || value === 'customer'
}

export async function recoverPurchasedCreationOwnership(
  customerId: string,
  store: PurchaseOwnershipRecoveryStore
): Promise<PurchaseOwnershipRecoveryResult> {
  if (!customerId) throw new Error('Customer ID is required for purchase recovery')

  const customerCartItems = await store.loadCustomerOrderedCartItems(customerId)
  const sourceOrderIds = uniqueValues(customerCartItems.map((item) => item.order_id))
  if (!sourceOrderIds.length) return { ...EMPTY_RESULT }

  const sourceOrders = await store.loadOrders(sourceOrderIds)
  const sourceOrderById = new Map(sourceOrders.map((order) => [order.order_id, order]))
  const eligibleCreationIds = uniqueValues(
    customerCartItems.map((item) => {
      const order = item.order_id ? sourceOrderById.get(item.order_id) : null
      const isCustomerOwnedItem = hasExpectedOwner(item, customerId)
      const isCustomerOwnedPaidOrder =
        order?.customer_id === customerId && isPaidLikeOrderStatus(order.order_status)
      return item.status === 'ordered' && isCustomerOwnedItem && isCustomerOwnedPaidOrder
        ? item.creation_id
        : null
    })
  )

  if (!eligibleCreationIds.length) return { ...EMPTY_RESULT }

  const [linkedCartItems, creations, jobs] = await Promise.all([
    store.loadCartItemsByCreation(eligibleCreationIds),
    store.loadCreations(eligibleCreationIds),
    store.loadCreationJobs(eligibleCreationIds),
  ])
  const linkedOrderIds = uniqueValues(linkedCartItems.map((item) => item.order_id))
  const linkedOrders = await store.loadOrders(linkedOrderIds)
  const linkedOrderById = new Map(linkedOrders.map((order) => [order.order_id, order]))
  const creationById = new Map(creations.map((creation) => [creation.creation_id, creation]))
  const conflictingCreationIds = new Set<string>()

  for (const creationId of eligibleCreationIds) {
    const hasCurrentPaidReference = linkedCartItems.some((item) => {
      if (item.creation_id !== creationId || item.status !== 'ordered' || !item.order_id) return false
      const order = linkedOrderById.get(item.order_id)
      return (
        hasExpectedOwner(item, customerId) &&
        order?.customer_id === customerId &&
        isPaidLikeOrderStatus(order.order_status)
      )
    })
    const creation = creationById.get(creationId)
    if (
      !hasCurrentPaidReference ||
      !creation ||
      !isSupportedOwnerType(creation.owner_type) ||
      (!hasExpectedOwner(creation, customerId) && !isTransferableAnonymousOwner(creation))
    ) {
      conflictingCreationIds.add(creationId)
    }
  }

  for (const item of linkedCartItems) {
    const creationId = String(item.creation_id || '')
    if (!eligibleCreationIds.includes(creationId) || !item.order_id) continue
    const order = linkedOrderById.get(item.order_id)
    if (!order || !isPaidLikeOrderStatus(order.order_status)) continue

    const itemOwnerConflicts =
      item.owner_type === 'customer'
        ? item.customer_id !== customerId
        : item.owner_type !== 'anon'
    if (order.customer_id !== customerId || itemOwnerConflicts) {
      conflictingCreationIds.add(creationId)
    }
  }

  for (const job of jobs) {
    if (
      !eligibleCreationIds.includes(job.creation_id) ||
      !isSupportedOwnerType(job.owner_type) ||
      (!hasExpectedOwner(job, customerId) && !isTransferableAnonymousOwner(job))
    ) {
      conflictingCreationIds.add(job.creation_id)
    }
  }

  if (conflictingCreationIds.size > 0) {
    throw new PurchaseOwnershipConflictError(Array.from(conflictingCreationIds).sort())
  }

  const alreadyOwnedCreationCount = creations.filter((creation) =>
    hasExpectedOwner(creation, customerId)
  ).length
  const jobCreationIdsToTransfer = uniqueValues(
    jobs
      .filter((job) => isTransferableAnonymousOwner(job))
      .map((job) => job.creation_id)
  )
  const creationIdsToTransfer = creations
    .filter((creation) => isTransferableAnonymousOwner(creation))
    .map((creation) => creation.creation_id)

  const recoveredCreationCount = await store.transferAnonymousCreations(
    creationIdsToTransfer,
    customerId
  )
  const verifiedCreations = await store.loadCreations(eligibleCreationIds)
  const verifiedCreationById = new Map(
    verifiedCreations.map((creation) => [creation.creation_id, creation])
  )
  const unverifiedCreationIds = eligibleCreationIds.filter((creationId) => {
    const creation = verifiedCreationById.get(creationId)
    return !creation || !hasExpectedOwner(creation, customerId)
  })
  if (unverifiedCreationIds.length > 0) {
    throw new PurchaseOwnershipConflictError(unverifiedCreationIds)
  }

  // Creation is the ownership gate. Jobs move only after that gate is verified for this customer.
  const recoveredJobCount = await store.transferAnonymousJobs(jobCreationIdsToTransfer, customerId)

  return {
    eligibleCreationCount: eligibleCreationIds.length,
    recoveredCreationCount,
    recoveredJobCount,
    alreadyOwnedCreationCount,
  }
}
