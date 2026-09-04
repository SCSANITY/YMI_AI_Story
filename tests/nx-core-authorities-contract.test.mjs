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

test('runtime Catalog reads use the database authority while static books stay build-only', async () => {
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

  assert.deepEqual(staticBookImports, ['app/personalize/[bookID]/page.tsx'])

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
  assert.match(nav, /fetch\('\/api\/orders\?limit=10'/)
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
  assert.equal(controller.match(/await getJob\(/g)?.length, 1)
  assert.match(controller, /getPollDelayMs\(startedAt, doneAssetRetries\)/)
  assert.match(controller, /visibilitychange[\s\S]*pageshow[\s\S]*focus/)

  await assert.rejects(
    access(path.join(root, 'components/personalize/usePersonalizeFlow.ts')),
    (error) => error?.code === 'ENOENT'
  )
})
