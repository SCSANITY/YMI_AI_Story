import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { templateRowToBook, type TemplateCatalogRow } from '@/lib/book-catalog'

const PRODUCT_IMAGE_PATTERN = /^product(\d+)\.webp$/i
const FINAL_PREVIEW_IMAGE_PATTERN = /^page_(\d+)\.png$/i
const TEMPLATE_DETAIL_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=86400'

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

export async function GET(_request: Request, context: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await context.params

  if (!templateId) {
    return NextResponse.json({ error: 'Missing templateId' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('templates')
    .select('*')
    .eq('template_id', templateId)
    .eq('is_active', true)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const row = data
    ? await Promise.all([withProductShowcaseImages(data), withFinalPreviewImages(data)]).then(
        ([productRow, finalRow]) => ({
          ...productRow,
          final_preview_paths: finalRow.final_preview_paths,
        })
      )
    : null
  const template = row ? templateRowToBook(row) : null
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  const response = NextResponse.json({ template })
  response.headers.set('Cache-Control', TEMPLATE_DETAIL_CACHE_CONTROL)
  return response
}
