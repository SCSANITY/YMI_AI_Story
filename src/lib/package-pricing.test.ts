import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getBookPackagePrice,
  getCatalogDisplayPrice,
  packagePriceRowsToPricing,
  packageTypeToProductType,
  resolveBookPackageTypeFromSnapshot,
} from './package-pricing'
import { templateRowsToBooks, type TemplateCatalogRow } from './book-catalog'

test('builds only two physical packages while excluding retired database rows', () => {
  const pricing = packagePriceRowsToPricing([
    { package_type: 'digital', list_price_usd: 29.99, sale_price_usd: 19.99, row_version: 2 },
    { package_type: 'basic', list_price_usd: 49.99, sale_price_usd: null, row_version: 1 },
    { package_type: 'supreme', list_price_usd: 99.99, sale_price_usd: 79.99, row_version: 4 },
  ])

  assert.deepEqual(Object.keys(pricing), ['basic', 'supreme'])
  assert.equal(pricing.basic.effectivePriceUsd, 49.99)
  assert.equal(pricing.supreme.version, 4)
})

test('retired pricing cannot leak into public cards or bypass direct price validation', () => {
  const rows = [
    { package_type: 'digital', list_price_usd: 'invalid', row_version: null },
    { package_type: 'basic', list_price_usd: 35.9, row_version: 1 },
    { package_type: 'supreme', list_price_usd: 65.9, row_version: 2 },
  ]
  const pricing = packagePriceRowsToPricing(rows)
  assert.equal(getCatalogDisplayPrice(pricing, 'digital').effectivePriceUsd, 35.9)
  const [book] = templateRowsToBooks([{
    template_id: 'retirement_story', name: 'Story',
    catalog_display_package_type: 'digital', package_prices: rows,
  }])
  assert.equal(book.catalogDisplayPackageType, 'basic')
  assert.equal(book.price, 35.9)
  assert.throws(() => getBookPackagePrice(book, 'digital'), /Unsupported package type/)
  assert.throws(() => packagePriceRowsToPricing([...rows, rows[1]]), /duplicate/)
  assert.throws(() => packagePriceRowsToPricing([...rows, { package_type: 'unknown' }]), /Unsupported/)
})

test('fails closed when one sellable package is missing or sale price is invalid', () => {
  assert.throws(() => packagePriceRowsToPricing([
    { package_type: 'digital', list_price_usd: 20, row_version: 1 },
    { package_type: 'basic', list_price_usd: 40, row_version: 1 },
  ]), /Missing supreme/)

  assert.throws(() => packagePriceRowsToPricing([
    { package_type: 'basic', list_price_usd: 40, sale_price_usd: 40, row_version: 1 },
    { package_type: 'supreme', list_price_usd: 80, row_version: 1 },
  ]), /must be below list price/)
})

test('keeps marketing discount display separate from the computed and charged sale price', () => {
  const pricing = packagePriceRowsToPricing([
    {
      package_type: 'basic',
      list_price_usd: 9.9,
      sale_price_usd: 5.9,
      display_discount_percent: 45,
      row_version: 1,
    },
    { package_type: 'supreme', list_price_usd: 99.99, row_version: 1 },
  ])

  assert.equal(pricing.basic.effectivePriceUsd, 5.9)
  assert.equal(pricing.basic.computedDiscountPercent, 40)
  assert.equal(pricing.basic.displayDiscountPercent, 45)
  assert.equal(pricing.basic.discountPercent, 45)

  assert.throws(() => packagePriceRowsToPricing([
    { package_type: 'basic', list_price_usd: 9.9, display_discount_percent: 40, row_version: 1 },
    { package_type: 'supreme', list_price_usd: 99.99, row_version: 1 },
  ]), /requires a sale price/)
})

test('projects the selected public package and explicit Home placement positions', () => {
  const [book] = templateRowsToBooks([{
    template_id: 'display_story',
    name: 'Display Story',
    catalog_display_package_type: 'basic',
    package_prices: [
      { package_type: 'digital', list_price_usd: 9.99, row_version: 1 },
      { package_type: 'basic', list_price_usd: 49.99, sale_price_usd: 29.99, display_discount_percent: 50, row_version: 2 },
      { package_type: 'supreme', list_price_usd: 99.99, row_version: 1 },
    ],
    home_placements: [
      { section_key: 'brand_new', position: 3 },
      { section_key: 'in_discount', position: 1 },
    ],
  }])

  assert.equal(book.catalogDisplayPackageType, 'basic')
  assert.equal(book.price, 29.99)
  assert.equal(book.compareAtPrice, 49.99)
  assert.equal(book.discountPercent, 50)
  assert.equal(book.isDiscount, true)
  assert.deepEqual(book.homePlacementPositions, { brand_new: 3, in_discount: 1 })
})

test('reads the package from the creation snapshot and excludes legacy premium', () => {
  assert.equal(resolveBookPackageTypeFromSnapshot({ textOverrides: { book_type: 'supreme' } }), 'supreme')
  assert.equal(resolveBookPackageTypeFromSnapshot({ bookType: 'digital' }), null)
  assert.equal(resolveBookPackageTypeFromSnapshot({ text_overrides: { bookType: 'premium' } }), null)
  assert.equal(packageTypeToProductType('basic'), 'physical')
  assert.equal(packageTypeToProductType('supreme'), 'physical')
})

test('does not derive package prices from legacy static book fields', () => {
  assert.throws(() => getBookPackagePrice({
    bookID: 'story',
    title: 'Story',
    author: 'YMI',
    price: 25,
    compareAtPrice: 40,
    coverUrl: '',
    showcaseImages: [],
    description: '',
    category: 'Story',
    ageRange: '2+',
    gender: 'Neutral',
  }, 'supreme'), /Missing supreme package price on book/)
})

test('isolates one unpriced template without breaking the catalog list', () => {
  const validPricing = [
    { package_type: 'digital', list_price_usd: 20, row_version: 1 },
    { package_type: 'basic', list_price_usd: 40, row_version: 1 },
    { package_type: 'supreme', list_price_usd: 90, row_version: 1 },
  ]
  const rows: TemplateCatalogRow[] = [
    { template_id: 'ready_story', name: 'Ready Story', package_prices: validPricing },
    { template_id: 'unpriced_story', name: 'Unpriced Story', package_prices: [] },
  ]
  const skipped: string[] = []

  const books = templateRowsToBooks(rows, (row) => skipped.push(String(row.template_id)))

  assert.deepEqual(books.map((book) => book.bookID), ['ready_story'])
  assert.deepEqual(skipped, ['unpriced_story'])
})
