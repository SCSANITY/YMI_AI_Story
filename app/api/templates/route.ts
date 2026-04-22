import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { templateRowsToBooks } from '@/lib/book-catalog'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('templates')
    .select('*')
    .eq('is_active', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ templates: templateRowsToBooks(data) })
}
