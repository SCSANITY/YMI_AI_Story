import assert from 'node:assert/strict'
import { access, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8')

async function collectSources(relativeDirectory) {
  const directory = path.join(root, relativeDirectory)
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = path.join(relativeDirectory, entry.name)
      if (entry.isDirectory()) return collectSources(relativePath)
      return /\.(?:ts|tsx|js|jsx)$/.test(entry.name) ? [relativePath] : []
    })
  )
  return nested.flat()
}

test('all runtime and prerender Catalog reads use the database authority', async () => {
  const sourceFiles = (
    await Promise.all(
      ['app', 'components', 'contexts', 'src'].map((directory) => collectSources(directory))
    )
  ).flat()
  const staticBookImports = []

  for (const file of sourceFiles) {
    const source = await read(file)
    if (/from ['"]@\/data\/books['"]/.test(source)) staticBookImports.push(file.replaceAll('\\', '/'))
  }

  assert.deepEqual(staticBookImports, [])

  const [personalizeRoute, personalizeClient, catalogServer] = await Promise.all([
    read('app/personalize/[bookID]/page.tsx'),
    read('components/PersonalizePage.tsx'),
    read('src/lib/template-catalog-server.ts'),
  ])
  assert.match(personalizeRoute, /loadActiveTemplateDetail/)
  assert.match(personalizeRoute, /initialBook=\{initialBook\}/)
  assert.doesNotMatch(personalizeClient, /useBookCatalog|fetch\([^\n]*\/api\/templates/)
  assert.match(catalogServer, /templateRowToBook/)
})

test('customer orders use one read model and one list and detail API contract', async () => {
  const [listRoute, detailRoute, readModel, nav, ordersPage, checkout, success] =
    await Promise.all([
      read('app/api/orders/route.ts'),
      read('app/api/orders/[orderId]/route.ts'),
      read('src/lib/customer-orders-server.ts'),
      read('components/navbar/useNavNoticeCounts.ts'),
      read('app/orders/page.tsx'),
      read('app/checkout/page.tsx'),
      read('app/checkout/success/page.tsx'),
    ])

  assert.match(listRoute, /loadCustomerOrders/)
  assert.match(detailRoute, /loadCustomerOrders/)
  assert.match(readModel, /CUSTOMER_ORDER_SELECT/)
  assert.match(nav, /fetch\('\/api\/user\/notice-counts'/)
  assert.doesNotMatch(nav, /\/api\/orders\?limit=10|\/api\/favourites\?customerId|\/api\/my-books\?customerId/)
  assert.match(ordersPage, /fetch\('\/api\/orders'/)

  for (const source of [nav, ordersPage, checkout, success]) {
    assert.doesNotMatch(source, /\/api\/orders\/list|\/api\/orders\?orderId|\/api\/orders\?customerId/)
  }

  await assert.rejects(
    access(path.join(root, 'app/api/orders/list/route.ts')),
    (error) => error?.code === 'ENOENT'
  )
})

test('Customize has one lifecycle authority and one Preview controller', async () => {
  const [personalize, stage, controller] = await Promise.all([
    read('components/PersonalizePage.tsx'),
    read('components/personalize/usePersonalizeStage.ts'),
    read('components/personalize/usePreviewController.ts'),
  ])

  assert.match(personalize, /usePreviewController/)
  assert.match(personalize, /getPersistedPersonalizeStep\(stage\)/)
  assert.doesNotMatch(personalize, /getJob\(|getPreviewPageAssets|pollForRemainingPreviewPages/)
  assert.match(stage, /export function getPersistedPersonalizeStep/)
  assert.match(controller, /activeWatchesRef/)
  assert.equal(controller.match(/await getPreviewJobState\(/g)?.length, 2)
  assert.doesNotMatch(controller, /await getJob\(|await getPreviewPageAssets\(/)
  assert.match(controller, /getPollDelayMs\(startedAt, doneAssetRetries\)/)
  assert.match(controller, /visibilitychange[\s\S]*pageshow[\s\S]*focus/)

  await assert.rejects(
    access(path.join(root, 'components/personalize/usePersonalizeFlow.ts')),
    (error) => error?.code === 'ENOENT'
  )
})

test('S-A quick wins keep one identity-owned badge read and bounded gates', async () => {
  const [noticeRoute, rewards, nav, myBooks, visibility, customizeServer, gate, jobs, reader] = await Promise.all([
    read('app/api/user/notice-counts/route.ts'),
    read('src/lib/reward-vouchers-server.ts'),
    read('components/navbar/useNavNoticeCounts.ts'),
    read('app/api/my-books/route.ts'),
    read('src/lib/my-books-visibility.ts'),
    read('src/lib/customize-access-server.ts'),
    read('components/CustomizeAccessGate.tsx'),
    read('app/api/jobs/route.js'),
    read('app/my-books/[creationId]/OwnedBookReader.tsx'),
  ])

  assert.match(noticeRoute, /resolveCheckoutOwner/)
  assert.match(noticeRoute, /Promise\.all\(/)
  assert.match(noticeRoute, /select\('favourite_id', \{ count: 'exact', head: true \}/)
  assert.match(noticeRoute, /select\('order_id', \{ count: 'exact', head: true \}/)
  assert.match(rewards, /\.is\('owner_customer_id', null\)/)
  assert.match(rewards, /\.eq\('owner_email', email\)/)
  assert.doesNotMatch(noticeRoute, /claimVouchersForCustomerEmail/)
  assert.match(nav, /fetch\('\/api\/user\/notice-counts'/)
  assert.match(nav, /\.catch\(\(\) => \{\s*if \(cancelled\) return\s*\}\)/)
  assert.match(myBooks, /isVisibleMyBookRow/)
  assert.match(visibility, /purchaseState !== 'unpurchased'/)
  assert.match(customizeServer, /unstable_cache/)
  assert.match(customizeServer, /revalidateTag\(CUSTOMIZE_ACCESS_CACHE_TAG/)
  assert.doesNotMatch(gate, /canEnterCustomize\(\{\s*force:/)
  assert.match(jobs, /getCustomizeAccessSettings/)
  assert.match(reader, /READER_REFRESH_COOLDOWN_MS/)
  assert.match(reader, /allowReleased/)
  assert.match(reader, /silentRefreshRef/)
})

test('retired compatibility surfaces cannot re-enter the production runtime', async () => {
  const [
    globalContext,
    i18n,
    useI18n,
    myBooks,
    previewRoute,
    previewContract,
    signatureVoice,
    jobsRoute,
    userAssetsRoute,
    navbarMenu,
    supportReply,
    kolReply,
  ] = await Promise.all([
    read('contexts/GlobalContext.tsx'),
    read('src/lib/i18n-messages.ts'),
    read('src/lib/useI18n.ts'),
    read('app/api/my-books/route.ts'),
    read('app/api/jobs/[jobId]/preview-url/route.ts'),
    read('src/lib/preview-page-contract.ts'),
    read('src/lib/signature-voice.ts'),
    read('app/api/jobs/route.js'),
    read('app/api/user-assets/route.ts'),
    read('components/navbar/NavbarUserMenu.tsx'),
    read('src/lib/support-ticket.ts'),
    read('src/lib/kol-partnership-email.ts'),
  ])

  assert.doesNotMatch(globalContext, /ymi_language|setLanguage|migrateLegacyLanguageToCurrency/)
  assert.doesNotMatch(i18n, /UI_MESSAGES|Record<Language/)
  assert.match(useI18n, /getUiMessage\(key, vars\)/)
  assert.match(useI18n, /const englishUi = Object\.freeze/)
  assert.match(useI18n, /return englishUi/)
  assert.doesNotMatch(useI18n, /useGlobalContext|\blanguage\b/)
  assert.doesNotMatch(myBooks, /baseSelect|fallbackQuery|Backward compatibility/)
  assert.doesNotMatch(previewRoute, /legacyStoragePath|outputAssets\?\.storage_path/)
  assert.doesNotMatch(previewContract, /legacyStoragePath|Array\.isArray\(value\.urls\)/)
  assert.doesNotMatch(signatureVoice + jobsRoute + userAssetsRoute, /signature-voice-consent-v[12]/)
  assert.match(navbarMenu, /onNavigate\('\/admin\/finals'\)/)
  assert.doesNotMatch(supportReply, /support\\\+|ticket-|replyToken/)
  assert.doesNotMatch(kolReply, /partners\\\+|collab-|replyToken/)

  for (const retiredPath of [
    'app/admin/page.tsx',
    'app/api/admin/inbox/messages/[inboundEmailId]/replies/route.ts',
    'src/lib/email-route-token.ts',
    'src/lib/footer-legal-content-traditional.ts',
  ]) {
    await assert.rejects(
      access(path.join(root, retiredPath)),
      (error) => error?.code === 'ENOENT'
    )
  }
})
