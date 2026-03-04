import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('order_reviews')
    .select('template_id, rating')

  if (error) {
    // If table is not created yet, fail gracefully for UI.
    if (error.code === 'PGRST205' || error.code === '42P01') {
      return NextResponse.json({ summary: {} })
    }
    return NextResponse.json({ error: 'Failed to load review summary' }, { status: 500 })
  }

  const buckets = new Map<string, { total: number; count: number }>()
  for (const row of data ?? []) {
    const templateId = String(row.template_id ?? '')
    if (!templateId) continue
    const rating = Number(row.rating ?? 0)
    if (!Number.isFinite(rating) || rating <= 0) continue
    const prev = buckets.get(templateId) ?? { total: 0, count: 0 }
    buckets.set(templateId, { total: prev.total + rating, count: prev.count + 1 })
  }

  const summary: Record<string, { average: number; count: number }> = {}
  for (const [templateId, bucket] of buckets.entries()) {
    if (!bucket.count) continue
    summary[templateId] = {
      average: Number((bucket.total / bucket.count).toFixed(2)),
      count: bucket.count,
    }
  }

  return NextResponse.json({ summary })
}

