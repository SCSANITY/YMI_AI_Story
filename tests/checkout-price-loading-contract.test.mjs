import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('checkout keeps unresolved prices blank while order items are restored', async () => {
  const [page, summary, paymentActions] = await Promise.all([
    read('app/checkout/page.tsx'),
    read('app/checkout/CheckoutSummaryPanel.tsx'),
    read('app/checkout/PaymentActions.tsx'),
  ])

  assert.match(page, /const isCheckoutPriceReady = items\.length > 0/)
  assert.doesNotMatch(page, /isCheckoutPriceReady = total > 0/)

  assert.match(
    page,
    /<CheckoutSummaryPanel[\s\S]{0,500}isPriceReady=\{summaryPriceReady\}/
  )
  assert.match(
    page,
    /<MobilePaymentBar[\s\S]{0,220}isPriceReady=\{Boolean\(paymentQuote\)\}/
  )

  assert.match(summary, /isPriceReady: boolean/)
  assert.match(
    summary,
    /aria-busy=\{!isSubtotalReady\}[\s\S]{0,220}\{isSubtotalReady \? formattedSubtotal : null\}/
  )
  assert.match(
    summary,
    /aria-busy=\{!isPriceReady\}[\s\S]{0,220}\{isPriceReady \? formattedTotal : t\('checkout.totalPending'\)\}/
  )

  assert.match(paymentActions, /isPriceReady: boolean/)
  assert.match(
    paymentActions,
    /aria-busy=\{!isPriceReady\}[\s\S]{0,220}\{isPriceReady \? totalLabel : null\}/
  )
})
