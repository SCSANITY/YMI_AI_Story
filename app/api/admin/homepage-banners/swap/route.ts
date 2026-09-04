import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  HOMEPAGE_BANNER_ADMIN_SELECT,
  buildAdminHomepageBannerSlot,
  parseHomepageBannerSlotKey,
  type HomepageBannerAdminRow,
} from '@/lib/homepage-banner-admin'
import { invalidateHomepageBanners } from '@/lib/homepage-banner-cache'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: Request) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Admin access required' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  let firstSlotKey
  let secondSlotKey
  try {
    firstSlotKey = parseHomepageBannerSlotKey(body?.firstSlotKey)
    secondSlotKey = parseHomepageBannerSlotKey(body?.secondSlotKey)
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Invalid Banner position' },
      { status: 400 },
    )
  }

  const firstExpectedVersion = Number(body?.firstExpectedVersion)
  const secondExpectedVersion = Number(body?.secondExpectedVersion)
  if (
    !Number.isInteger(firstExpectedVersion) || firstExpectedVersion <= 0 ||
    !Number.isInteger(secondExpectedVersion) || secondExpectedVersion <= 0
  ) {
    return jsonNoStore({ error: 'Invalid Banner versions' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.rpc('swap_homepage_banner_slots', {
    p_first_slot_key: firstSlotKey,
    p_first_expected_version: firstExpectedVersion,
    p_second_slot_key: secondSlotKey,
    p_second_expected_version: secondExpectedVersion,
    p_admin_customer_id: admin.customer_id,
  })
  if (error) {
    const conflict = /changed in another session/i.test(error.message)
    return jsonNoStore(
      { error: conflict ? 'A Banner changed in another session. Refresh and try again.' : error.message },
      { status: conflict ? 409 : 400 },
    )
  }

  invalidateHomepageBanners()
  const { data, error: loadError } = await supabaseAdmin
    .from('homepage_banner_slots')
    .select(HOMEPAGE_BANNER_ADMIN_SELECT)
    .order('slot_key')
  if (loadError) {
    return jsonNoStore({ error: loadError.message || 'Banners swapped but reload failed' }, { status: 500 })
  }

  return jsonNoStore({
    slots: (data ?? []).map((row) =>
      buildAdminHomepageBannerSlot(row as unknown as HomepageBannerAdminRow)),
  })
}
