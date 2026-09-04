import { NextResponse } from 'next/server'
import {
  loadActiveTemplateDetail,
  TemplateCatalogLoadError,
} from '@/lib/template-catalog-server'

const TEMPLATE_DETAIL_CACHE_CONTROL = 'public, max-age=0, s-maxage=60'

export async function GET(
  _request: Request,
  context: { params: Promise<{ templateId: string }> }
) {
  const { templateId } = await context.params
  if (!templateId) {
    return NextResponse.json({ error: 'Missing templateId' }, { status: 400 })
  }

  let template
  try {
    template = await loadActiveTemplateDetail(templateId)
  } catch (error) {
    const status = error instanceof TemplateCatalogLoadError ? error.status : 500
    const message = error instanceof Error ? error.message : 'Failed to load template'
    return NextResponse.json({ error: message }, { status })
  }
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  const response = NextResponse.json({ template })
  response.headers.set('Cache-Control', TEMPLATE_DETAIL_CACHE_CONTROL)
  return response
}
