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
  'price_cents',
  'compare_at_price_cents',
  'discount_percent',
  'target_gender',
  'home_sections',
  'is_brand_new',
  'is_for_boys',
  'is_for_girls',
  'is_discount',
  'is_coming_soon',
  'magic_attributes',
].join(',')

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('templates')
    .select(TEMPLATE_LIST_COLUMNS)
    .eq('is_active', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as TemplateCatalogRow[]
  const response = NextResponse.json({ templates: templateRowsToBooks(rows) })
  response.headers.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=1800')
  return response
}
