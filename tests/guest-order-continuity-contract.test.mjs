import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('Checkout email ownership guidance waits for resolved auth state', async () => {
  const hint = await read('app/checkout/CheckoutEmailOwnershipHint.tsx')

  assert.match(hint, /if \(!isAuthResolved\) return null/)
  assert.match(hint, /isSignedIn[\s\S]*checkout\.emailAccountDeliveryHint/)
  assert.match(hint, /checkout\.emailGuestOwnershipHint/)
  assert.doesNotMatch(hint, /identityMode|checkoutEmail|localStorage/)
})

test('physical and digital Checkout email inputs share the ownership guidance', async () => {
  const address = await read('app/checkout/AddressFormSection.tsx')
  const checkout = await read('app/checkout/page.tsx')
  const messages = await read('src/lib/i18n-messages.ts')

  assert.match(address, /<CheckoutEmailOwnershipHint[\s\S]*isAuthResolved=\{isAuthResolved\}[\s\S]*isSignedIn=\{Boolean\(userCustomerId\)\}/)
  assert.match(checkout, /id="digital-checkout-email"[\s\S]*<CheckoutEmailOwnershipHint[\s\S]*isAuthResolved=\{isAuthResolved\}[\s\S]*isSignedIn=\{Boolean\(user\?\.customerId\)\}/)
  assert.match(messages, /checkout\.emailGuestOwnershipHint/)
  assert.match(messages, /checkout\.emailAccountDeliveryHint/)
})

test('order detail API authenticates before looking up an order', async () => {
  const route = await read('app/api/orders/[orderId]/route.ts')
  const ownerGuardIndex = route.indexOf('if (!owner)')
  const orderLookupIndex = route.indexOf(".from('orders')")

  assert.ok(ownerGuardIndex >= 0)
  assert.ok(orderLookupIndex > ownerGuardIndex)
  assert.match(route.slice(ownerGuardIndex, orderLookupIndex), /status: 401/)
})

test('order detail renders secure, mismatch, and not-found states without client ownership inference', async () => {
  const page = await read('app/orders/[orderID]/page.tsx')

  assert.match(page, /status === 401[\s\S]*'secure_access'/)
  assert.match(page, /status === 403[\s\S]*'account_mismatch'/)
  assert.match(page, /status === 404[\s\S]*'not_found'/)
  assert.match(page, /openLoginModal\('login'\)/)
  assert.match(page, /openLoginModal\('signup'\)/)
  assert.doesNotMatch(page, /checkoutEmail|localStorage/)
})

test('order detail waits for resolved auth and refetches against the merged customer identity', async () => {
  const page = await read('app/orders/[orderID]/page.tsx')

  assert.match(page, /const customerId = user\?\.customerId \?\? ''/)
  assert.match(page, /const requestKey = `\$\{orderId\}:\$\{sessionId\}:\$\{customerId \|\| 'guest'\}`/)
  assert.match(page, /if \(!isAuthResolved \|\| !orderId\) return/)
  assert.match(page, /fetch\(detailUrl, \{ credentials: 'include', cache: 'no-store' \}\)/)
  assert.match(page, /loadResult\?\.requestKey === requestKey/)
  assert.match(page, /\[customerId, isAuthResolved, orderId, requestKey, sessionId\]/)
  assert.doesNotMatch(page, /checkoutEmail|localStorage/)
})

test('customer merge derives claim authority from the authenticated email only', async () => {
  const route = await read('app/api/customer/merge/route.ts')
  const context = await read('contexts/GlobalContext.tsx')
  const authLookupIndex = route.indexOf('await supabase.auth.getUser()')
  const authEmailIndex = route.indexOf("const email = String(user.email ?? '')")
  const customerLookupIndex = route.indexOf(".from('customers')")
  const finalizeStart = context.indexOf('const finalizeAuth = useCallback')
  const finalizeEnd = context.indexOf('const syncSupabaseUser = useCallback', finalizeStart)
  const finalizeAuth = context.slice(finalizeStart, finalizeEnd)
  const mergeRequestIndex = finalizeAuth.indexOf("await fetch('/api/customer/merge'")
  const mergeBodyStart = finalizeAuth.indexOf('body: JSON.stringify({', mergeRequestIndex)
  const mergeBodyEnd = finalizeAuth.indexOf('}),', mergeBodyStart)
  const mergeBody = finalizeAuth.slice(mergeBodyStart, mergeBodyEnd)
  const publishUserIndex = finalizeAuth.indexOf('setUser(')

  assert.ok(authLookupIndex >= 0)
  assert.ok(authEmailIndex > authLookupIndex)
  assert.ok(customerLookupIndex > authEmailIndex)
  assert.doesNotMatch(route, /body\?\.email|body\?\.customerId|body\?\.orderId|body\?\.displayId/)
  assert.ok(mergeRequestIndex >= 0)
  assert.ok(mergeBodyStart > mergeRequestIndex)
  assert.ok(mergeBodyEnd > mergeBodyStart)
  assert.ok(publishUserIndex > mergeRequestIndex)
  assert.doesNotMatch(mergeBody, /\b(email|authUserId)\s*[:,]/)
})

test('OAuth preserves the exact order path and query through a full-document callback', async () => {
  const context = await read('contexts/GlobalContext.tsx')
  const modal = await read('components/LoginModal.tsx')
  const callback = await read('app/auth/callback/route.ts')

  assert.match(context, /const fallbackNext = `\$\{window\.location\.pathname\}\$\{window\.location\.search\}`/)
  assert.match(context, /\/auth\/callback\?next=\$\{encodeURIComponent\(safeNext\)\}/)
  assert.match(modal, /loginWithOAuth\(option\.provider\)/)
  assert.match(callback, /NextResponse\.redirect\(resolveSafeRedirect\(next, origin\)\)/)
  assert.doesNotMatch(callback, /router\.(push|replace)/)
})

test('exactly the three order-link emails share the secure access notice', async () => {
  const confirmation = await read('components/emails/OrderReceiptEmail.tsx')
  const delivery = await read('components/emails/DeliveryEmail.tsx')
  const logistics = await read('components/emails/LogisticsUpdateEmail.tsx')
  const unpaid = await read('components/emails/AbandonmentEmail.tsx')
  const emailService = await read('src/lib/email.tsx')
  const notice = await read('components/emails/OrderAccessNotice.tsx')

  for (const template of [confirmation, delivery, logistics]) {
    assert.match(template, /import \{ OrderAccessNotice \}/)
    assert.match(template, /<OrderAccessNotice \/>/)
  }
  assert.doesNotMatch(unpaid, /OrderAccessNotice/)
  assert.match(notice, /To securely view this order on another device, sign in or create an account using this email address\./)
  assert.match(emailService, /sendOrderConfirmationEmail[\s\S]*\/orders\/\$\{params\.orderId\}/)
  assert.match(emailService, /sendOrderDeliveryEmail[\s\S]*\/orders\/\$\{params\.orderId\}/)
  assert.match(emailService, /sendLogisticsUpdateEmail[\s\S]*\/orders\/\$\{params\.orderId\}/)
  assert.match(emailService, /sendUnpaidReminderEmail[\s\S]*\/checkout\?orderId=\$\{params\.orderId\}/)
})

test('cookie-free purchase recovery stays scoped to purchased creations and generated jobs', async () => {
  const recovery = await read('src/lib/purchase-ownership-recovery.ts')
  const store = await read('src/lib/purchase-ownership-recovery-store.ts')
  const mergeRoute = await read('app/api/customer/merge/route.ts')

  assert.match(mergeRoute, /recoverPurchasedCreationOwnership\([\s\S]*customer\.customer_id/)
  assert.match(store, /transferAnonymousCreations/)
  assert.match(store, /transferAnonymousJobs/)
  assert.match(store, /\.in\('job_type', \['preview', 'final'\]\)/)
  assert.doesNotMatch(recovery, /user_assets|face_source|voice/i)
  assert.doesNotMatch(store, /user_assets|face_source|voice/i)
})
