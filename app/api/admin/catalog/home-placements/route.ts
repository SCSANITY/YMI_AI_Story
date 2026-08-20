import { NextResponse } from 'next/server'
import { requireAdminCustomer } from '@/lib/adminAuth'
import { invalidatePublicCatalogCache } from '@/lib/catalog-cache'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import type { HomeBookSectionKey } from '@/types'

const SECTION_KEYS: HomeBookSectionKey[] = ['brand_new', 'for_boys', 'for_girls', 'in_discount']
const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0' }

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS })
}

export async function PATCH(request: Request) {
  const admin = await requireAdminCustomer()
  if (!admin) return json({ error: 'Forbidden' }, 403)

  const body = await request.json().catch(() => ({}))
  const sectionKey = String(body?.sectionKey ?? '') as HomeBookSectionKey
  const expectedVersion = Number(body?.expectedVersion)
  const templateIds = Array.isArray(body?.templateIds)
    ? body.templateIds.map((value: unknown) => String(value ?? '').trim())
    : null

  if (
    !SECTION_KEYS.includes(sectionKey)
    || !Number.isSafeInteger(expectedVersion)
    || expectedVersion < 1
    || !templateIds
    || templateIds.length > 4
    || templateIds.some((value: string) => !value)
    || new Set(templateIds).size !== templateIds.length
  ) {
    return json({ error: 'Invalid Home placement request' }, 400)
  }

  const { data, error } = await supabaseAdmin.rpc('replace_template_home_section', {
    p_section_key: sectionKey,
    p_template_ids: templateIds,
    p_expected_version: expectedVersion,
    p_admin_customer_id: admin.customer_id,
  })

  if (error) {
    if (error.message?.includes('another session')) {
      return json({ error: 'This Home section changed in another session. Refresh before saving.' }, 409)
    }
    return json({ error: error.message || 'Failed to update Home placements' }, 400)
  }

  invalidatePublicCatalogCache()

  return json({ sectionKey, templateIds, version: Number(data) })
}
