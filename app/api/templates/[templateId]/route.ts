import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { templateRowToBook } from '@/lib/book-catalog'

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

  const template = templateRowToBook(data)
  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  return NextResponse.json({ template })
}
