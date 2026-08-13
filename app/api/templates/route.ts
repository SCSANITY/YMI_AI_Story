import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { templateRowsToBooks, type TemplateCatalogRow } from '@/lib/book-catalog'

const TEMPLATE_LIST_COLUMNS = [
  'template_id',
  'name',
  'description',
  'inner_description',
  'story_type',
  'cover_image_path',
  'normalized_cover_image_path',
  'created_at',
  'book_type',
  'default_config_path',
  'is_active',
  'age_group',
  'display_order',
  'target_gender',
  'catalog_display_package_type',
  'is_coming_soon',
  'magic_attributes',
  'package_prices:template_package_prices(package_type,list_price_usd,sale_price_usd,display_discount_percent,row_version,updated_at)',
  'home_placements:template_home_placements(section_key,position)',
].join(',')

const TEMPLATE_CATALOG_CACHE_CONTROL = 'public, max-age=0, s-maxage=60'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('templates')
    .select(TEMPLATE_LIST_COLUMNS)
    .eq('is_active', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as TemplateCatalogRow[]
  const templates = templateRowsToBooks(rows, (row, pricingError) => {
    console.error('[template-catalog] skipped template with invalid package pricing', {
      templateId: row.template_id,
      error: pricingError,
    })
  })

  const response = NextResponse.json({ templates })
  response.headers.set('Cache-Control', TEMPLATE_CATALOG_CACHE_CONTROL)
  return response
}
