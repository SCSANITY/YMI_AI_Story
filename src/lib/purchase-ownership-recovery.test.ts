import assert from 'node:assert/strict'
import test from 'node:test'
import {
  PurchaseOwnershipConflictError,
  recoverPurchasedCreationOwnership,
  type PurchaseOwnershipRecoveryStore,
  type PurchaseRecoveryCartItem,
  type PurchaseRecoveryOrder,
  type PurchaseRecoveryOwnedRow,
} from './purchase-ownership-recovery'

const customerA = 'customer-a'
const customerB = 'customer-b'
const creationA = 'creation-a'
const creationB = 'creation-b'
const orderA = 'order-a'
const orderB = 'order-b'

function cartItem(params: Partial<PurchaseRecoveryCartItem> = {}): PurchaseRecoveryCartItem {
  return {
    creation_id: creationA,
    order_id: orderA,
    owner_type: 'customer',
    customer_id: customerA,
    status: 'ordered',
    ...params,
  }
}

function order(params: Partial<PurchaseRecoveryOrder> = {}): PurchaseRecoveryOrder {
  return {
    order_id: orderA,
    customer_id: customerA,
    order_status: 'paid',
    ...params,
  }
}

function ownedRow(params: Partial<PurchaseRecoveryOwnedRow> = {}): PurchaseRecoveryOwnedRow {
  return {
    creation_id: creationA,
    owner_type: 'anon',
    customer_id: null,
    ...params,
  }
}

class FakeRecoveryStore implements PurchaseOwnershipRecoveryStore {
  cartItems: PurchaseRecoveryCartItem[]
  orders: PurchaseRecoveryOrder[]
  creations: PurchaseRecoveryOwnedRow[]
  jobs: PurchaseRecoveryOwnedRow[]
  transferredJobCreationIds: string[] = []
  transferredCreationIds: string[] = []

  constructor(params?: {
    cartItems?: PurchaseRecoveryCartItem[]
    orders?: PurchaseRecoveryOrder[]
    creations?: PurchaseRecoveryOwnedRow[]
    jobs?: PurchaseRecoveryOwnedRow[]
  }) {
    this.cartItems = params?.cartItems ?? [cartItem()]
    this.orders = params?.orders ?? [order()]
    this.creations = params?.creations ?? [ownedRow()]
    this.jobs = params?.jobs ?? [ownedRow()]
  }

  async loadCustomerOrderedCartItems(customerId: string) {
    return this.cartItems.filter(
      (item) =>
        item.owner_type === 'customer' &&
        item.customer_id === customerId &&
        item.status === 'ordered'
    )
  }

  async loadOrders(orderIds: string[]) {
    return this.orders.filter((row) => orderIds.includes(row.order_id))
  }

  async loadCartItemsByCreation(creationIds: string[]) {
    return this.cartItems.filter((item) =>
      creationIds.includes(String(item.creation_id || ''))
    )
  }

  async loadCreations(creationIds: string[]) {
    return this.creations.filter((row) => creationIds.includes(row.creation_id))
  }

  async loadCreationJobs(creationIds: string[]) {
    return this.jobs.filter((row) => creationIds.includes(row.creation_id))
  }

  async transferAnonymousJobs(creationIds: string[], customerId: string) {
    this.transferredJobCreationIds.push(...creationIds)
    let count = 0
    this.jobs = this.jobs.map((row) => {
      if (
        creationIds.includes(row.creation_id) &&
        row.owner_type === 'anon' &&
        !row.customer_id
      ) {
        count += 1
        return { ...row, owner_type: 'customer', customer_id: customerId }
      }
      return row
    })
    return count
  }

  async transferAnonymousCreations(creationIds: string[], customerId: string) {
    this.transferredCreationIds.push(...creationIds)
    let count = 0
    this.creations = this.creations.map((row) => {
      if (
        creationIds.includes(row.creation_id) &&
        row.owner_type === 'anon' &&
        !row.customer_id
      ) {
        count += 1
        return { ...row, owner_type: 'customer', customer_id: customerId }
      }
      return row
    })
    return count
  }
}

test('same-email authenticated customer recovers its paid Creation and anonymous Preview Job', async () => {
  const store = new FakeRecoveryStore({
    jobs: [
      ownedRow(),
      ownedRow({ owner_type: 'customer', customer_id: customerA }),
    ],
  })

  const result = await recoverPurchasedCreationOwnership(customerA, store)

  assert.deepEqual(result, {
    eligibleCreationCount: 1,
    recoveredCreationCount: 1,
    recoveredJobCount: 1,
    alreadyOwnedCreationCount: 0,
  })
  assert.deepEqual(store.transferredJobCreationIds, [creationA])
  assert.deepEqual(store.transferredCreationIds, [creationA])
})

test('a different authenticated customer cannot discover or claim another customer purchase', async () => {
  const store = new FakeRecoveryStore()

  const result = await recoverPurchasedCreationOwnership(customerB, store)

  assert.deepEqual(result, {
    eligibleCreationCount: 0,
    recoveredCreationCount: 0,
    recoveredJobCount: 0,
    alreadyOwnedCreationCount: 0,
  })
  assert.deepEqual(store.transferredJobCreationIds, [])
  assert.deepEqual(store.transferredCreationIds, [])
})

test('untrusted customer-like rows cannot widen the authenticated customer candidate set', async () => {
  const store = new FakeRecoveryStore({
    cartItems: [cartItem({ customer_id: customerB })],
    orders: [order()],
  })

  const result = await recoverPurchasedCreationOwnership(customerA, store)

  assert.equal(result.eligibleCreationCount, 0)
  assert.deepEqual(store.transferredCreationIds, [])
})

test('unpaid and unrelated anonymous drafts are never transferred', async () => {
  const store = new FakeRecoveryStore({
    cartItems: [
      cartItem(),
      cartItem({ creation_id: creationB, order_id: orderB }),
    ],
    orders: [order(), order({ order_id: orderB, order_status: 'unpaid' })],
    creations: [ownedRow(), ownedRow({ creation_id: creationB })],
    jobs: [ownedRow(), ownedRow({ creation_id: creationB })],
  })

  await recoverPurchasedCreationOwnership(customerA, store)

  assert.deepEqual(store.transferredJobCreationIds, [creationA])
  assert.deepEqual(store.transferredCreationIds, [creationA])
})

test('a paid reference owned by another customer fails closed before every write', async () => {
  const store = new FakeRecoveryStore({
    cartItems: [
      cartItem(),
      cartItem({ order_id: orderB, customer_id: customerB }),
    ],
    orders: [
      order(),
      order({ order_id: orderB, customer_id: customerB }),
    ],
  })

  await assert.rejects(
    () => recoverPurchasedCreationOwnership(customerA, store),
    (error: unknown) =>
      error instanceof PurchaseOwnershipConflictError &&
      error.creationIds.join(',') === creationA
  )
  assert.deepEqual(store.transferredJobCreationIds, [])
  assert.deepEqual(store.transferredCreationIds, [])
})

test('already recovered ownership is an idempotent no-op', async () => {
  const store = new FakeRecoveryStore({
    creations: [ownedRow({ owner_type: 'customer', customer_id: customerA })],
    jobs: [ownedRow({ owner_type: 'customer', customer_id: customerA })],
  })

  const result = await recoverPurchasedCreationOwnership(customerA, store)

  assert.deepEqual(result, {
    eligibleCreationCount: 1,
    recoveredCreationCount: 0,
    recoveredJobCount: 0,
    alreadyOwnedCreationCount: 1,
  })
  assert.deepEqual(store.transferredJobCreationIds, [])
  assert.deepEqual(store.transferredCreationIds, [])
})

test('the recovery gate follows shared paid-like status semantics', async () => {
  const store = new FakeRecoveryStore({
    orders: [order({ order_status: 'processing' })],
  })

  const result = await recoverPurchasedCreationOwnership(customerA, store)

  assert.equal(result.eligibleCreationCount, 1)
  assert.equal(result.recoveredCreationCount, 1)
})
