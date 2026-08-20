import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { invalidatePublicCatalogCache } from '@/lib/catalog-cache'
import { normalizeBookPackageType } from '@/lib/package-pricing'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}

export async function PATCH(request: Request) {
  const admin = await requireAdminCustomer()
  if (!admin) return json({ error: 'Forbidden' }, 403)

  const body = await request.json().catch(() => ({}))
  const packageType = normalizeBookPackageType(body?.catalogDisplayPackageType)
  const templateId = String(body?.templateId ?? '').trim()
  const applyToAll = body?.applyToAll === true

  if (!packageType || (!applyToAll && !templateId)) {
    return json({ error: 'Invalid catalog display package request' }, 400)
  }

  let query = supabaseAdmin
    .from('templates')
    .update({ catalog_display_package_type: packageType })

  if (!applyToAll) query = query.eq('template_id', templateId)

  const { data, error } = await query.select('template_id')
  if (error) {
    if (error.message?.includes('must be on sale')) {
      return json({ error: error.message }, 409)
    }
    return json({ error: 'Failed to update catalog display package' }, 500)
  }
  if (!data?.length) return json({ error: 'Template not found' }, 404)

  invalidatePublicCatalogCache()

  return json({
    templateIds: data.map((row) => String(row.template_id)),
    catalogDisplayPackageType: packageType,
  })
}
