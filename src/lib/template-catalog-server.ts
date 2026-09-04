import 'server-only'

import { cache } from 'react'
import {
  templateRowToBook,
  templateRowsToBooks,
  templateStorageUrl,
  type CatalogBook,
  type TemplateCatalogRow,
} from '@/lib/book-catalog'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  parseTemplateLockedPreviewPages,
  parseTemplatePreviewFirstSpreadPages,
} from '@/lib/template-locked-preview'

const PRODUCT_IMAGE_PATTERN = /^product(\d+)\.webp$/i

export const TEMPLATE_LIST_COLUMNS = [
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

export class TemplateCatalogLoadError extends Error {
  constructor(message: string, readonly status = 500) {
    super(message)
    this.name = 'TemplateCatalogLoadError'
  }
}

function normalizeTemplatePath(path: unknown) {
  return String(path ?? '')
    .trim()
    .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/public\/app-templates\//, '')
    .replace(/^app-templates\//, '')
    .replace(/^\/+/, '')
}

async function withProductShowcaseImages(row: TemplateCatalogRow) {
  const templateId = String(row.template_id ?? '').trim()
  if (!templateId) return row

  const { data, error } = await supabaseAdmin.storage
    .from('app-templates')
    .list(`${templateId}/products`, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    })
  if (error || !data?.length) return row

  const productPaths = data
    .flatMap((item) => {
      const match = item.name.match(PRODUCT_IMAGE_PATTERN)
      return match ? [{ name: item.name, order: Number(match[1]) }] : []
    })
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((item) => `${templateId}/products/${item.name}`)

  if (!productPaths.length) return row

  const primaryImagePath = normalizeTemplatePath(
    row.normalized_cover_image_path || row.cover_image_path
  )
  const currentShowcasePaths = Array.isArray(row.showcase_image_paths)
    ? row.showcase_image_paths.map(normalizeTemplatePath).filter(Boolean)
    : []

  return {
    ...row,
    showcase_image_paths: Array.from(
      new Set([
        primaryImagePath,
        ...productPaths,
        ...currentShowcasePaths.filter(
          (path) => path !== primaryImagePath && !productPaths.includes(path)
        ),
      ].filter(Boolean))
    ),
  }
}

async function loadLockedPreviewPages(templateId: string) {
  const { data, error } = await supabaseAdmin.storage
    .from('app-templates')
    .list(`${templateId}/preview-final`, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    })
  return error ? [] : parseTemplateLockedPreviewPages(templateId, data, templateStorageUrl)
}

async function loadPreviewFirstSpreadPages(templateId: string) {
  const { data, error } = await supabaseAdmin.storage
    .from('app-templates')
    .list(templateId, {
      limit: 10,
      search: 'preview1_',
      sortBy: { column: 'name', order: 'asc' },
    })
  return error
    ? []
    : parseTemplatePreviewFirstSpreadPages(templateId, data, templateStorageUrl)
}

export async function loadActiveTemplateCatalog(): Promise<CatalogBook[]> {
  const { data, error } = await supabaseAdmin
    .from('templates')
    .select(TEMPLATE_LIST_COLUMNS)
    .eq('is_active', true)

  if (error) throw new TemplateCatalogLoadError(error.message)

  return templateRowsToBooks((data ?? []) as TemplateCatalogRow[], (row, pricingError) => {
    console.error('[template-catalog] skipped template with invalid package pricing', {
      templateId: row.template_id,
      error: pricingError,
    })
  })
}

export const loadActiveTemplateDetail = cache(
  async (templateIdValue: string): Promise<CatalogBook | null> => {
    const templateId = String(templateIdValue || '').trim()
    if (!templateId) return null

    const { data, error } = await supabaseAdmin
      .from('templates')
      .select('*, package_prices:template_package_prices(package_type,list_price_usd,sale_price_usd,display_discount_percent,row_version,updated_at), home_placements:template_home_placements(section_key,position)')
      .eq('template_id', templateId)
      .eq('is_active', true)
      .maybeSingle()

    if (error) throw new TemplateCatalogLoadError(error.message)
    if (!data) return null

    const [productRow, lockedPreviewPages, previewFirstSpreadPages] = await Promise.all([
      withProductShowcaseImages(data),
      loadLockedPreviewPages(templateId),
      loadPreviewFirstSpreadPages(templateId),
    ])

    try {
      return templateRowToBook({
        ...productRow,
        locked_preview_pages: lockedPreviewPages,
        preview_first_spread_pages: previewFirstSpreadPages,
      })
    } catch (error) {
      console.error('[template-detail] invalid package pricing contract', error)
      throw new TemplateCatalogLoadError('Template pricing is not configured', 503)
    }
  }
)
