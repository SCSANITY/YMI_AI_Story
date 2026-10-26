import { NextResponse } from 'next/server'
import { loadActiveTemplateCatalog } from '@/lib/template-catalog-server'

export const dynamic = 'force-static'
export const revalidate = 60

export async function GET() {
  // Throw on load failure so ISR does not cache an error as the public entry.
  const templates = await loadActiveTemplateCatalog({ strict: true })
  return NextResponse.json({ templates })
}
