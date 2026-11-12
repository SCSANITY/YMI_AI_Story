import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('Preview warms Checkout and uses the current durable version directly', async () => {
  const personalize = await read('components/PersonalizePage.tsx')

  assert.match(
    personalize,
    /if \(!viewState\.showPreview\) return;\s*router\.prefetch\('\/checkout'\)/
  )
  assert.match(personalize, /const currentPreviewJobId = purchaseConfiguration\.previewJobId/)
  assert.doesNotMatch(personalize, /commitSelectedPreviewForExit|commitPreviewVariant\(/)
  assert.match(personalize, /setCheckoutTransitionPhase\('preparing'\)/)
  assert.match(personalize, /router\.push\(orderId \? `\/checkout\?orderId=\$\{orderId\}` : '\/checkout'\)/)

  const loading = await read('app/checkout/loading.tsx')
  assert.match(loading, /CheckoutLoadingShell/)
})

test('Order Start persists the reminder after cart writes and submits to the provider after the response', async () => {
  const orderStart = await read('app/api/orders/start/route.ts')
  const cartPersistenceIndex = orderStart.indexOf('for (const item of resolvedItems)')
  const deferredReminderIndex = orderStart.indexOf('after(async () =>')
  const durableReminderIndex = orderStart.indexOf('await registerUnpaidReminder(reminderOrderId)')
  const responseIndex = orderStart.lastIndexOf('return NextResponse.json')

  assert.match(orderStart, /import \{ after, NextResponse \} from 'next\/server'/)
  assert.doesNotMatch(orderStart, /order_reminder_schedules/)
  assert.ok(durableReminderIndex > cartPersistenceIndex)
  assert.ok(deferredReminderIndex > durableReminderIndex)
  assert.ok(responseIndex > deferredReminderIndex)
})

test('direct Checkout only reuses a cart item for the exact current Creation', async () => {
  const personalize = await read('components/PersonalizePage.tsx')

  assert.match(personalize, /cart\.find\(item => item\.creationId === ensuredCreationId\)/)
  assert.match(personalize, /cartItemId: existingItem\?\.id \?\? null/)
  assert.match(personalize, /creationId: ensuredCreationId \?\? null/)
})
