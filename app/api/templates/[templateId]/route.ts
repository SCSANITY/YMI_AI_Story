import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import {
  templateRowToBook,
  templateStorageUrl,
  type TemplateCatalogRow,
} from '@/lib/book-catalog'
import { parseTemplateFinalPreviewPages } from '@/lib/template-final-preview'

const PRODUCT_IMAGE_PATTERN = /^product(\d+)\.webp$/i
const FINAL_PREVIEW_IMAGE_PATTERN = /^page_(\d+)\.png$/i
const TEMPLATE_DETAIL_CACHE_CONTROL = 'public, max-age=0, s-maxage=60'

type ProductImageEntry = {
  name: string
  order: number
}

type OrderedImageEntry = {
  name: string
  order: number
}

function isProductImageEntry(value: ProductImageEntry | null): value is ProductImageEntry {
  return value !== null
}

function isOrderedImageEntry(value: OrderedImageEntry | null): value is OrderedImageEntry {
  return value !== null
}

function normalizeTemplatePath(path: unknown): string {
  return String(path ?? '')
    .trim()
    .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/public\/app-templates\//, '')
    .replace(/^app-templates\//, '')
    .replace(/^\/+/, '')
}

async function withProductShowcaseImages(row: TemplateCatalogRow): Promise<TemplateCatalogRow> {
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
    .flatMap((item): ProductImageEntry[] => {
      const match = item.name.match(PRODUCT_IMAGE_PATTERN)
      return match ? [{ name: item.name, order: Number(match[1]) }] : []
    })
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((item) => `${templateId}/products/${item.name}`)

  if (!productPaths.length) return row

  const primaryImagePath = normalizeTemplatePath(row.normalized_cover_image_path || row.cover_image_path)
  const currentShowcasePaths = Array.isArray(row.showcase_image_paths)
    ? row.showcase_image_paths.map(normalizeTemplatePath).filter(Boolean)
    : []

  const orderedPaths = [
    primaryImagePath,
    ...productPaths,
    ...currentShowcasePaths.filter((path) => path !== primaryImagePath && !productPaths.includes(path)),
  ].filter(Boolean)

  return {
    ...row,
    showcase_image_paths: Array.from(new Set(orderedPaths)),
  }
}

async function withFinalPreviewImages(row: TemplateCatalogRow): Promise<TemplateCatalogRow> {
  const templateId = String(row.template_id ?? '').trim()
  if (!templateId) return row

  const { data, error } = await supabaseAdmin.storage
    .from('app-templates')
    .list(`${templateId}/final`, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    })

  if (error || !data?.length) return row

  const finalPreviewPaths = data
    .map((item) => {
      const match = item.name.match(FINAL_PREVIEW_IMAGE_PATTERN)
      return match ? { name: item.name, order: Number(match[1]) } : null
    })
    .filter(isOrderedImageEntry)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((item) => `${templateId}/final/${item.name}`)

  if (!finalPreviewPaths.length) return row

  return {
    ...row,
    final_preview_paths: finalPreviewPaths,
  }
}

async function withStructuredFinalPreviewPages(row: TemplateCatalogRow): Promise<TemplateCatalogRow> {
  const configPath = normalizeTemplatePath(row.default_config_path)
  if (!configPath) return row

  const { data, error } = await supabaseAdmin.storage.from('app-templates').download(configPath)
  if (error || !data) return row

  let config: unknown
  try {
    config = JSON.parse(await data.text())
  } catch {
    return row
  }

  const finalPreviewPages = parseTemplateFinalPreviewPages(config, templateStorageUrl)
  return finalPreviewPages.length ? { ...row, final_preview_pages: finalPreviewPages } : row
}

export async function GET(_request: Request, context: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await context.params

  if (!templateId) {
    return NextResponse.json({ error: 'Missing templateId' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('templates')
    .select('*, package_prices:template_package_prices(package_type,list_price_usd,sale_price_usd,display_discount_percent,row_version,updated_at), home_placements:template_home_placements(section_key,position)')
    .eq('template_id', templateId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const row = data
    ? await Promise.all([
        withProductShowcaseImages(data),
        withFinalPreviewImages(data),
        withStructuredFinalPreviewPages(data),
      ]).then(
        ([productRow, finalRow, structuredRow]) => ({
          ...productRow,
          final_preview_paths: finalRow.final_preview_paths,
          final_preview_pages: structuredRow.final_preview_pages,
        })
      )
    : null
  let template = null
  try {
    template = row ? templateRowToBook(row) : null
  } catch (pricingError) {
    console.error('[template-detail] invalid package pricing contract', pricingError)
    return NextResponse.json({ error: 'Template pricing is not configured' }, { status: 503 })
  }
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  const response = NextResponse.json({ template })
  response.headers.set('Cache-Control', TEMPLATE_DETAIL_CACHE_CONTROL)
  return response
}
