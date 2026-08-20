import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { invalidatePublicCatalogCache } from '@/lib/catalog-cache'
import {
  normalizeBookPackageType,
  packagePriceRowsToPricing,
  packagePriceRowToModel,
} from '@/lib/package-pricing'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { templateStorageUrl } from '@/lib/book-catalog'

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}

function parsePrice(value: unknown, field: string, options?: { nullable?: boolean }) {
  if (options?.nullable && (value === null || value === undefined || value === '')) return null
  const price = Number(value)
  const roundedPrice = Math.round((price + Number.EPSILON) * 100) / 100
  if (!Number.isFinite(price) || roundedPrice < 0.01 || roundedPrice > 10000) {
    throw new Error(`${field} must be between USD 0.01 and USD 10,000`)
  }
  return roundedPrice
}

function parseDisplayDiscount(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const percent = Number(value)
  if (!Number.isSafeInteger(percent) || percent < 1 || percent > 99) {
    throw new Error('Marketing discount must be a whole percentage from 1 to 99')
  }
  return percent
}

export async function GET() {
  const admin = await requireAdminCustomer()
  if (!admin) return json({ error: 'Forbidden' }, 403)

  const [templateResult, sectionStateResult, placementResult] = await Promise.all([
    supabaseAdmin
      .from('templates')
      .select(`
        template_id,
        name,
        is_active,
        display_order,
        catalog_display_package_type,
        normalized_cover_image_path,
        cover_image_path,
        package_prices:template_package_prices(
          package_type,
          list_price_usd,
          sale_price_usd,
          display_discount_percent,
          row_version,
          updated_at
        )
      `)
      .order('is_active', { ascending: false })
      .order('display_order', { ascending: true, nullsFirst: false })
      .order('name', { ascending: true }),
    supabaseAdmin
      .from('template_home_section_state')
      .select('section_key, row_version, updated_at'),
    supabaseAdmin
      .from('template_home_placements')
      .select('section_key, position, template_id')
      .order('position', { ascending: true }),
  ])

  if (templateResult.error || sectionStateResult.error || placementResult.error) {
    return json({ error: 'Failed to load catalog management data' }, 500)
  }

  try {
    const templates = (templateResult.data ?? []).map((row) => ({
      templateId: String(row.template_id),
      name: String(row.name || row.template_id),
      isActive: Boolean(row.is_active),
      coverUrl: templateStorageUrl(row.normalized_cover_image_path || row.cover_image_path),
      catalogDisplayPackageType: normalizeBookPackageType(row.catalog_display_package_type) ?? 'digital',
      packagePricing: packagePriceRowsToPricing(row.package_prices),
    }))
    const homeSections = (sectionStateResult.data ?? []).map((section) => ({
      sectionKey: String(section.section_key),
      version: Number(section.row_version),
      templateIds: (placementResult.data ?? [])
        .filter((placement) => placement.section_key === section.section_key)
        .map((placement) => String(placement.template_id)),
    }))
    return json({ templates, homeSections })
  } catch (pricingError) {
    console.error('[admin/catalog] invalid package pricing contract', pricingError)
    return json({ error: 'Package pricing migration is incomplete' }, 503)
  }
}

export async function PATCH(request: Request) {
  const admin = await requireAdminCustomer()
  if (!admin) return json({ error: 'Forbidden' }, 403)

  const body = await request.json().catch(() => ({}))
  const templateId = String(body?.templateId ?? '').trim()
  const packageType = normalizeBookPackageType(body?.packageType)
  const expectedVersion = Number(body?.expectedVersion)

  if (!templateId || templateId.length > 160 || !packageType) {
    return json({ error: 'Invalid template or package' }, 400)
  }
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1) {
    return json({ error: 'Invalid expected version' }, 400)
  }

  let listPriceUsd: number
  let salePriceUsd: number | null
  let displayDiscountPercent: number | null
  try {
    listPriceUsd = parsePrice(body?.listPriceUsd, 'List price')!
    salePriceUsd = parsePrice(body?.salePriceUsd, 'Sale price', { nullable: true })
    displayDiscountPercent = parseDisplayDiscount(body?.displayDiscountPercent)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Invalid price' }, 400)
  }

  if (salePriceUsd !== null && salePriceUsd >= listPriceUsd) {
    return json({ error: 'Sale price must be lower than list price' }, 400)
  }
  if (displayDiscountPercent !== null && salePriceUsd === null) {
    return json({ error: 'Marketing discount requires a sale price' }, 400)
  }

  const now = new Date().toISOString()
  const { data: updated, error } = await supabaseAdmin
    .from('template_package_prices')
    .update({
      list_price_usd: listPriceUsd,
      sale_price_usd: salePriceUsd,
      display_discount_percent: displayDiscountPercent,
      row_version: expectedVersion + 1,
      updated_by_customer_id: admin.customer_id,
      updated_at: now,
    })
    .eq('template_id', templateId)
    .eq('package_type', packageType)
    .eq('row_version', expectedVersion)
    .select('package_type, list_price_usd, sale_price_usd, display_discount_percent, row_version, updated_at')
    .maybeSingle()

  if (error) {
    if (error.message?.includes('must stay on sale')) {
      return json({ error: error.message }, 409)
    }
    return json({ error: 'Failed to update package price' }, 500)
  }
  if (!updated) {
    return json({ error: 'This price changed in another session. Refresh and review the latest value.' }, 409)
  }

  invalidatePublicCatalogCache()

  return json({
    templateId,
    packagePrice: packagePriceRowToModel(updated),
    updatedAt: updated.updated_at,
  })
}
