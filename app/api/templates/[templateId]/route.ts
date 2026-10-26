import { NextResponse } from 'next/server'
import { loadActiveTemplateDetail } from '@/lib/template-catalog-server'

export const dynamic = 'force-static'
export const revalidate = 60

export async function GET(
  _request: Request,
  context: { params: Promise<{ templateId: string }> }
) {
  const { templateId } = await context.params
  if (!templateId) {
    return NextResponse.json({ error: 'Missing templateId' }, { status: 400 })
  }

  // A thrown failure keeps the last good ISR entry; a cold failure is not cached.
  const template = await loadActiveTemplateDetail(templateId)
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  return NextResponse.json({ template })
}
