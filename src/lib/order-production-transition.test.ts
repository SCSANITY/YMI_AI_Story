import assert from 'node:assert/strict'
import test from 'node:test'
import {
  advanceOrdersToProductionAfterPdfRelease,
  areAllOrderPdfsReleased,
  type OrderProductionTransitionStore,
} from './order-production-transition'

function released(jobId: string) {
  return { job_id: jobId, review_status: 'released', released_at: '2026-07-27T00:00:00.000Z' }
}

test('requires every ordered item to have a released final job', () => {
  assert.equal(
    areAllOrderPdfsReleased(
      [
        { cart_item_id: 'item-a', final_job_id: 'job-a' },
        { cart_item_id: 'item-b', final_job_id: 'job-b' },
      ],
      [released('job-a'), { job_id: 'job-b', review_status: 'pending', released_at: null }]
    ),
    false
  )
  assert.equal(
    areAllOrderPdfsReleased(
      [
        { cart_item_id: 'item-a', final_job_id: 'job-a' },
        { cart_item_id: 'item-b', final_job_id: 'job-b' },
      ],
      [released('job-a'), released('job-b')]
    ),
    true
  )
  assert.equal(
    areAllOrderPdfsReleased([{ cart_item_id: 'item-a', final_job_id: null }], []),
    false
  )
})

test('promotes each affected paid order once and records the automatic transition', async () => {
  const promoted: string[] = []
  const events: string[] = []
  const store: OrderProductionTransitionStore = {
    async loadAffectedOrderIds() {
      return ['order-a', 'order-a']
    },
    async loadOrder(orderId) {
      return { order_id: orderId, order_status: 'paid' }
    },
    async loadOrderedCartItems() {
      return [{ cart_item_id: 'item-a', final_job_id: 'job-a' }]
    },
    async loadFinalJobs() {
      return [released('job-a')]
    },
    async promotePaidOrder(orderId) {
      promoted.push(orderId)
      return true
    },
    async recordTransition({ orderId }) {
      events.push(orderId)
    },
  }

  const result = await advanceOrdersToProductionAfterPdfRelease(
    { jobId: 'job-a', orderIds: ['order-a'], changedByAdminId: 'admin-a' },
    store
  )

  assert.deepEqual(result.promotedOrderIds, ['order-a'])
  assert.deepEqual(promoted, ['order-a'])
  assert.deepEqual(events, ['order-a'])
})

test('does not overwrite non-paid order states or advance an incomplete multi-item order', async () => {
  const promoted: string[] = []
  const store: OrderProductionTransitionStore = {
    async loadAffectedOrderIds() {
      return []
    },
    async loadOrder(orderId) {
      return {
        order_id: orderId,
        order_status: orderId === 'shipped-order' ? 'shipped' : 'paid',
      }
    },
    async loadOrderedCartItems() {
      return [
        { cart_item_id: 'item-a', final_job_id: 'job-a' },
        { cart_item_id: 'item-b', final_job_id: 'job-b' },
      ]
    },
    async loadFinalJobs() {
      return [released('job-a')]
    },
    async promotePaidOrder(orderId) {
      promoted.push(orderId)
      return true
    },
    async recordTransition() {},
  }

  const result = await advanceOrdersToProductionAfterPdfRelease(
    { orderIds: ['shipped-order', 'partial-order'] },
    store
  )

  assert.deepEqual(result.promotedOrderIds, [])
  assert.deepEqual(promoted, [])
})

test('a lost compare-and-set race does not create a duplicate status event', async () => {
  let eventCount = 0
  const store: OrderProductionTransitionStore = {
    async loadAffectedOrderIds() {
      return []
    },
    async loadOrder(orderId) {
      return { order_id: orderId, order_status: 'paid' }
    },
    async loadOrderedCartItems() {
      return [{ cart_item_id: 'item-a', final_job_id: 'job-a' }]
    },
    async loadFinalJobs() {
      return [released('job-a')]
    },
    async promotePaidOrder() {
      return false
    },
    async recordTransition() {
      eventCount += 1
    },
  }

  const result = await advanceOrdersToProductionAfterPdfRelease(
    { orderIds: ['order-a'] },
    store
  )

  assert.deepEqual(result.readyOrderIds, ['order-a'])
  assert.deepEqual(result.promotedOrderIds, [])
  assert.equal(eventCount, 0)
})
