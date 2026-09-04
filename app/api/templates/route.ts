import { NextResponse } from 'next/server'
import { loadActiveTemplateCatalog } from '@/lib/template-catalog-server'

const TEMPLATE_CATALOG_CACHE_CONTROL = 'public, max-age=0, s-maxage=60'

export async function GET() {
  let templates
  try {
    templates = await loadActiveTemplateCatalog()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load templates'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  const response = NextResponse.json({ templates })
  response.headers.set('Cache-Control', TEMPLATE_CATALOG_CACHE_CONTROL)
  return response
}
