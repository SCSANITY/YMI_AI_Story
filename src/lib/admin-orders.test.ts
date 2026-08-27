import assert from 'node:assert/strict'
import test from 'node:test'
import {
  adminOrderMatchesView,
  aggregateAdminOrderProgress,
  normalizeAdminOrderPage,
  normalizeAdminOrderPageSize,
  normalizeAdminOrderSearch,
  normalizeAdminOrderView,
} from '@/lib/admin-orders'

test('admin order views keep active production separate from delivered history', () => {
  assert.equal(normalizeAdminOrderView('active'), 'active')
  assert.equal(normalizeAdminOrderView('unknown'), 'active')
  assert.equal(adminOrderMatchesView('paid', 'active'), true)
  assert.equal(adminOrderMatchesView('production', 'active'), true)
  assert.equal(adminOrderMatchesView('shipped', 'active'), true)
  assert.equal(adminOrderMatchesView('delivered', 'active'), false)
  assert.equal(adminOrderMatchesView('delivered', 'delivered'), true)
})

test('admin order query inputs are bounded before reaching PostgREST', () => {
  assert.equal(normalizeAdminOrderSearch('  Mia,(test)% / 王小明  '), 'Mia test 王小明')
  assert.equal(normalizeAdminOrderPage('-2'), 1)
  assert.equal(normalizeAdminOrderPage('3'), 3)
  assert.equal(normalizeAdminOrderPageSize('2'), 10)
  assert.equal(normalizeAdminOrderPageSize('100'), 50)
})

test('production progress follows cart item job links and deduplicates reused jobs', () => {
  const progress = aggregateAdminOrderProgress(
    [
      {
        cart_item_id: 'item-a',
        creation_id: 'creation-a',
        generation_job_id: 'job-shared',
        product_type: 'physical',
        package_type: 'basic',
        quantity: 2,
      },
      {
        cart_item_id: 'item-b',
        creation_id: 'creation-b',
        generation_job_id: 'job-shared',
        product_type: 'physical',
        package_type: 'supreme',
        quantity: 1,
      },
      {
        cart_item_id: 'item-c',
        creation_id: null,
        generation_job_id: null,
        product_type: 'ebook',
        package_type: 'digital',
        quantity: 1,
      },
    ],
    [
      {
        final_job_id: 'final-review-shared',
        job_id: 'job-shared',
        review_status: 'released',
        released_at: null,
        print_status: 'released',
        print_released_at: null,
      },
    ]
  )

  assert.deepEqual(progress, {
    itemCount: 4,
    assetCount: 2,
    missingJobCount: 1,
    pdfReleasedCount: 1,
    pdfTotalCount: 2,
    printReleasedCount: 1,
    printTotalCount: 1,
  })
})
