import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const readTemplateSql = (path) => readFile(new URL(`../../Template_folder/${path}`, import.meta.url), 'utf8')

test('cart and order-start derive package and price from the owned creation', async () => {
  const [cartRoute, orderStart, store] = await Promise.all([
    read('app/api/cart/route.ts'),
    read('app/api/orders/start/route.ts'),
    read('src/lib/package-pricing-store.ts'),
  ])

  assert.match(cartRoute, /loadAuthoritativeCreationPackagePrice/)
  assert.doesNotMatch(cartRoute, /body\?\.priceAtPurchase/)
  assert.doesNotMatch(cartRoute, /body\?\.productType/)
  assert.match(orderStart, /loadAuthoritativeCreationPackagePrice/)
  assert.doesNotMatch(orderStart, /item\?\.priceAtPurchase/)
  assert.doesNotMatch(orderStart, /item\?\.productType/)
  assert.match(store, /resolveBookPackageTypeFromSnapshot\(creation\.customize_snapshot\)/)
  assert.match(store, /creationBelongsToOwner/)
})

test('paid rows stay immutable while unpaid checkout receives authoritative item prices', async () => {
  const [cartRoute, orderStart, checkoutSession] = await Promise.all([
    read('app/api/cart/route.ts'),
    read('app/api/orders/start/route.ts'),
    read('app/api/checkout/session/route.ts'),
  ])

  assert.match(cartRoute, /Paid cart items cannot be changed/)
  assert.match(cartRoute, /requireCheckoutOrderAccess\(String\(existingItem\.order_id\), owner, \{ requireUnpaid: true \}\)/)
  assert.match(orderStart, /items: pricedItems/)
  assert.match(checkoutSession, /price_at_purchase/)
  assert.match(checkoutSession, /allocateProductDiscountToLineItems/)
  assert.doesNotMatch(checkoutSession, /body\?\.priceAtPurchase/)
})

test('Admin Catalog pricing is admin-only and uses row-version CAS', async () => {
  const [route, navigation] = await Promise.all([
    read('app/api/admin/catalog/pricing/route.ts'),
    read('components/admin/adminNavigation.ts'),
  ])

  assert.match(route, /requireAdminCustomer\(\)/)
  assert.match(route, /\.eq\('row_version', expectedVersion\)/)
  assert.match(route, /row_version: expectedVersion \+ 1/)
  assert.match(route, /return json\(\{ error: 'This price changed in another session/)
  assert.match(navigation, /label: 'Catalog Pricing'/)
  assert.doesNotMatch(navigation, /label: 'Catalog Pricing'[^\n]+soon: true/)
})

test('new templates are seeded while one invalid list row stays isolated', async () => {
  const [sql, catalogRoute] = await Promise.all([
    readTemplateSql('sql_template_package_pricing.sql'),
    read('app/api/templates/route.ts'),
  ])

  assert.match(sql, /create trigger template_package_prices_seed_after_insert/)
  assert.match(sql, /after insert on public\.templates/)
  assert.match(sql, /'digital'::text/)
  assert.match(sql, /'basic'::text/)
  assert.match(sql, /'supreme'::text/)
  assert.match(catalogRoute, /templateRowsToBooks\(rows, \(row, pricingError\) =>/)
  assert.match(catalogRoute, /skipped template with invalid package pricing/)
  assert.doesNotMatch(catalogRoute, /return NextResponse\.json\(\{ error: 'Template pricing is not configured' \}, \{ status: 503 \}\)/)
})

test('catalog merchandising has one price source and explicit owner-curated Home slots', async () => {
  const [foundationSql, cleanupSql, catalogRoute, homeCategories, settingsRoute, placementsRoute] = await Promise.all([
    readTemplateSql('sql_catalog_merchandising_foundation.sql'),
    readTemplateSql('sql_catalog_legacy_columns_cleanup.sql'),
    read('app/api/templates/route.ts'),
    read('components/HomeBookCategories.tsx'),
    read('app/api/admin/catalog/settings/route.ts'),
    read('app/api/admin/catalog/home-placements/route.ts'),
  ])

  assert.match(foundationSql, /display_discount_percent smallint/)
  assert.match(foundationSql, /create table if not exists public\.template_home_placements/)
  assert.match(foundationSql, /create or replace function public\.replace_template_home_section/)
  assert.match(foundationSql, /price\.package_type = templates\.catalog_display_package_type/)
  assert.match(foundationSql, /price\.sale_price_usd is not null/)
  assert.match(foundationSql, /template_package_prices_discount_placement_guard/)
  assert.match(foundationSql, /templates_home_placement_guard/)
  assert.match(cleanupSql, /drop column if exists price_cents/)
  assert.match(cleanupSql, /drop column if exists is_discount/)
  assert.doesNotMatch(catalogRoute, /price_cents|compare_at_price_cents|is_discount|home_sections/)
  assert.match(homeCategories, /homePlacementPositions/)
  assert.doesNotMatch(homeCategories, /Planet_story|Music_story|Explorer_story/)
  assert.match(settingsRoute, /requireAdminCustomer\(\)/)
  assert.match(placementsRoute, /requireAdminCustomer\(\)/)
  assert.match(placementsRoute, /replace_template_home_section/)
})

test('Admin public-card package bulk apply reconciles every story and invalidates public catalog views', async () => {
  const [manager, settingsRoute, pricingRoute, placementsRoute, cache, clientCatalog] = await Promise.all([
    read('components/admin/CatalogPricingManager.tsx'),
    read('app/api/admin/catalog/settings/route.ts'),
    read('app/api/admin/catalog/pricing/route.ts'),
    read('app/api/admin/catalog/home-placements/route.ts'),
    read('src/lib/catalog-cache.ts'),
    read('components/useBookCatalog.ts'),
  ])

  assert.match(settingsRoute, /if \(!applyToAll\) query = query\.eq\('template_id', templateId\)/)
  assert.match(manager, /applyToAll \|\| updatedIds\.has\(template\.templateId\)/)
  assert.match(manager, /All stories use \$\{displayPackageName\}/)
  assert.match(manager, /Apply \$\{displayPackageName\} to all/)
  assert.match(manager, /tone="primary"/)
  assert.match(manager, /applyAllBlockingTemplates/)
  assert.match(manager, /Add a \{displayPackageName\} sale price before applying to all/)

  assert.match(cache, /revalidatePath\('\/'\)/)
  assert.match(cache, /revalidatePath\('\/books'\)/)
  assert.match(cache, /revalidatePath\('\/api\/templates'\)/)
  assert.match(settingsRoute, /invalidatePublicCatalogCache\(\)/)
  assert.match(pricingRoute, /invalidatePublicCatalogCache\(\)/)
  assert.match(placementsRoute, /invalidatePublicCatalogCache\(\)/)
  assert.match(clientCatalog, /export function invalidateBookCatalogClientCache\(\)/)
  assert.match(clientCatalog, /\?refresh=\$\{catalogRefreshVersion\}/)
})

test('customer-facing saved books and Reader do not fall back to legacy template prices', async () => {
  const [myBooksPage, myBooksTypes, reader] = await Promise.all([
    read('app/my-books/page.tsx'),
    read('app/my-books/myBooksTypes.ts'),
    read('app/my-books/[creationId]/OwnedBookReader.tsx'),
  ])
  const source = `${myBooksPage}\n${myBooksTypes}\n${reader}`

  assert.match(source, /packagePriceRowsToPricing/)
  assert.doesNotMatch(source, /price_cents|compare_at_price_cents|templates\?\.is_discount/)
  assert.doesNotMatch(source, /getBookPackagePrice\(fallbackBook/)
})
