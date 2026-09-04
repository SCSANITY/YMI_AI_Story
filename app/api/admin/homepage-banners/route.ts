import { noStoreJson as jsonNoStore } from '@/lib/http-response'
import { requireAdminCustomer } from '@/lib/adminAuth'
import {
  HOMEPAGE_BANNER_ADMIN_SELECT,
  buildAdminHomepageBannerSlot,
  normalizeHomepageBannerFields,
  parseHomepageBannerSlotKey,
  preserveBuiltinAsset,
  verifyStoredHomepageBannerAsset,
  type HomepageBannerAdminRow,
} from '@/lib/homepage-banner-admin'
import { invalidateHomepageBanners } from '@/lib/homepage-banner-cache'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

async function loadSlots() {
  const { data, error } = await supabaseAdmin
    .from('homepage_banner_slots')
    .select(HOMEPAGE_BANNER_ADMIN_SELECT)
    .order('slot_key')
  if (error) throw new Error(error.message || 'Failed to load Homepage banners')
  return (data ?? []).map((row) => buildAdminHomepageBannerSlot(row as unknown as HomepageBannerAdminRow))
}

export async function GET() {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Admin access required' }, { status: 403 })

  try {
    return jsonNoStore({ slots: await loadSlots() })
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Failed to load Homepage banners' },
      { status: 500 },
    )
  }
}
export async function PATCH(request: Request) {
  const admin = await requireAdminCustomer()
  if (!admin) return jsonNoStore({ error: 'Admin access required' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  let slotKey
  let fields
  try {
    slotKey = parseHomepageBannerSlotKey(body?.slotKey)
    fields = normalizeHomepageBannerFields({
      displayName: body?.displayName,
      altText: body?.altText,
      href: body?.href,
    })
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Invalid Banner update' },
      { status: 400 },
    )
  }

  const expectedVersion = Number(body?.expectedVersion)
  if (!Number.isInteger(expectedVersion) || expectedVersion <= 0) {
    return jsonNoStore({ error: 'Invalid Banner version' }, { status: 400 })
  }

  const { data: currentData, error: currentError } = await supabaseAdmin
    .from('homepage_banner_slots')
    .select(HOMEPAGE_BANNER_ADMIN_SELECT)
    .eq('slot_key', slotKey)
    .maybeSingle()
  if (currentError || !currentData) {
    return jsonNoStore(
      { error: currentError?.message || 'Homepage banner slot not found' },
      { status: 404 },
    )
  }

  const current = buildAdminHomepageBannerSlot(currentData as unknown as HomepageBannerAdminRow)
  try {
    const [desktop, mobile] = await Promise.all([
      body?.desktop?.source === 'storage'
        ? verifyStoredHomepageBannerAsset(String(body?.desktop?.path ?? ''))
        : Promise.resolve(preserveBuiltinAsset(body?.desktop ?? {}, current.desktop)),
      body?.mobile?.source === 'storage'
        ? verifyStoredHomepageBannerAsset(String(body?.mobile?.path ?? ''))
        : Promise.resolve(preserveBuiltinAsset(body?.mobile ?? {}, current.mobile)),
    ])

    const { error: publishError } = await supabaseAdmin.rpc('publish_homepage_banner_slot', {
      p_slot_key: slotKey,
      p_expected_version: expectedVersion,
      p_admin_customer_id: admin.customer_id,
      p_display_name: fields.displayName,
      p_desktop_asset_source: desktop.source,
      p_desktop_asset_path: desktop.path,
      p_desktop_width: desktop.width,
      p_desktop_height: desktop.height,
      p_mobile_asset_source: mobile.source,
      p_mobile_asset_path: mobile.path,
      p_mobile_width: mobile.width,
      p_mobile_height: mobile.height,
      p_alt_text: fields.altText,
      p_href: fields.href,
      p_is_visible: body?.isVisible === true,
    })
    if (publishError) {
      const conflict = /changed in another session/i.test(publishError.message)
      return jsonNoStore(
        { error: conflict ? 'This Banner changed in another session. Refresh and try again.' : publishError.message },
        { status: conflict ? 409 : 400 },
      )
    }

    invalidateHomepageBanners()
    const slots = await loadSlots()
    return jsonNoStore({ slot: slots.find((slot) => slot.slotKey === slotKey) })
  } catch (error) {
    return jsonNoStore(
      { error: error instanceof Error ? error.message : 'Failed to publish Homepage banner' },
      { status: 409 },
    )
  }
}
