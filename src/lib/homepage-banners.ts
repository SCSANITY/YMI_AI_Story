import { unstable_cache } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { HOMEPAGE_BANNER_CACHE_TAG } from '@/lib/homepage-banner-cache'
import {
  resolvePublishedHomepageBanners,
  type HomepageBannerAssetSource,
  type HomepageBannerSlotRow,
} from '@/lib/homepage-banners-core'

export const HOMEPAGE_BANNER_BUCKET = 'site-public'

function resolveAssetUrl(source: HomepageBannerAssetSource, path: string) {
  if (source === 'builtin') return `/${path.replace(/^\/+/, '')}`
  return supabaseAdmin.storage.from(HOMEPAGE_BANNER_BUCKET).getPublicUrl(path).data.publicUrl
}

const loadPublishedHomepageBanners = unstable_cache(
  async () => {
    const { data, error } = await supabaseAdmin
      .from('homepage_banner_slots')
      .select([
        'slot_key',
        'display_name',
        'desktop_asset_source',
        'desktop_asset_path',
        'desktop_width',
        'desktop_height',
        'mobile_asset_source',
        'mobile_asset_path',
        'mobile_width',
        'mobile_height',
        'alt_text',
        'href',
        'is_visible',
      ].join(', '))
      .order('slot_key')

    if (error) {
      throw new Error(error.message || 'Failed to load Homepage banners')
    }

    return resolvePublishedHomepageBanners(
      (data ?? []) as unknown as HomepageBannerSlotRow[],
      resolveAssetUrl,
      (row, bannerError) => {
        console.error('[homepage-banners] skipped invalid slot', {
          slotKey: row.slot_key,
          error: bannerError.message,
        })
      },
    )
  },
  ['ymi-homepage-banners-v1'],
  {
    revalidate: 300,
    tags: [HOMEPAGE_BANNER_CACHE_TAG],
  },
)

export function getPublishedHomepageBanners() {
  return loadPublishedHomepageBanners()
}
