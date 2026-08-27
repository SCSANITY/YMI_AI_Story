import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('S6 uses one factual Signature Voice notice without offering digital playback', async () => {
  const [notice, messages] = await Promise.all([
    read('components/SignatureVoiceEditionNotice.tsx'),
    read('src/lib/i18n-messages.ts'),
  ])

  assert.match(notice, /variant: 'preview' \| 'checkout' \| 'postPurchase'/)
  assert.match(messages, /'signatureVoice\.badge': 'Signature Voice'/)
  assert.match(messages, /preview shows the visual book/)
  assert.match(messages, /narration is prepared for the printed edition/)
  assert.match(messages, /downloadable PDF is visual only and does not play audio/)
  assert.match(messages, /will arrive inside the printed book/)
  assert.match(messages, /online reader are visual only and do not play audio/)
  assert.match(messages, /We'll email you when (?:the narrated printed book|the book|it) ships/)
  assert.doesNotMatch(notice, /<audio|Audio\(|playbackUrl|audioUrl|signedUrl/)
})

test('S6 Preview and Checkout identify Signature Voice from their local authoritative state', async () => {
  const [personalize, checkout, context] = await Promise.all([
    read('components/PersonalizePage.tsx'),
    read('app/checkout/CheckoutItemsSection.tsx'),
    read('contexts/GlobalContext.tsx'),
  ])

  assert.match(personalize, /isSupreme \? <SignatureVoiceEditionNotice variant="preview"/)
  assert.match(checkout, /items\.some\([^\n]*isSignatureVoicePackage\(item\.personalization\?\.bookType\)\)/)
  assert.match(checkout, /SignatureVoiceBadge/)
  assert.match(checkout, /SignatureVoiceEditionNotice variant="checkout"/)
  assert.match(context, /row\.package_type \?\? overrides\.book_type \?\? creation\.customize_snapshot\?\.bookType/)
})

test('S6 order surfaces use the purchased cart-item package snapshot', async () => {
  const [ordersApi, orderDetailApi, success, detail, detailTypes] = await Promise.all([
    read('app/api/orders/route.ts'),
    read('app/api/orders/[orderId]/route.ts'),
    read('app/checkout/success/CheckoutSuccessCard.tsx'),
    read('app/orders/[orderID]/OrderDetailPanels.tsx'),
    read('app/orders/[orderID]/orderDetailTypes.ts'),
  ])

  assert.match(ordersApi, /cart_items[\s\S]*package_type/)
  assert.match(orderDetailApi, /cart_items[\s\S]*package_type/)
  assert.match(success, /order\?\.items\?\.some\([^\n]*isSignatureVoicePackage\(item\.package_type\)\)/)
  assert.match(detail, /items\.some\([^\n]*isSignatureVoicePackage\(item\.package_type\)\)/)
  assert.match(detail, /isSignatureVoicePackage\(item\.package_type\)[\s\S]*SignatureVoiceBadge/)
  assert.match(detailTypes, /package_type\?: string \| null/)
})

test('S6 My Books and Reader retain the latest paid package type end to end', async () => {
  const [purchaseState, myBooksRoute, grid, readerRoute, reader] = await Promise.all([
    read('src/lib/purchase-state.ts'),
    read('app/api/my-books/route.ts'),
    read('app/my-books/PurchasedBooksGrid.tsx'),
    read('app/api/my-books/[creationId]/reader/route.ts'),
    read('app/my-books/[creationId]/OwnedBookReader.tsx'),
  ])

  assert.match(purchaseState, /latestPackageType: BookPackageType \| null/)
  assert.match(purchaseState, /select\('cart_item_id, creation_id, order_id, final_job_id, package_type, status, created_at'\)/)
  assert.match(purchaseState, /latestPackageType: normalizeBookPackageType\(latest\?\.cartItem\.package_type\) \?\? null/)
  assert.match(myBooksRoute, /\.\.\.purchaseSummary/)
  assert.match(grid, /isSignatureVoicePackage\(item\.latestPackageType\)/)
  assert.ok((readerRoute.match(/latestPackageType: purchaseSummary\.latestPackageType/g) ?? []).length >= 4)
  assert.match(reader, /buildCartContext\(creation, reader\?\.latestPackageType\)/)
  assert.match(reader, /isSignatureVoicePackage\(reader\.latestPackageType\)/)
  assert.match(reader, /SignatureVoiceEditionNotice variant="postPurchase"/)
})
