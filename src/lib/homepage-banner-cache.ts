import { revalidatePath, revalidateTag } from 'next/cache'

export const HOMEPAGE_BANNER_CACHE_TAG = 'ymi-homepage-banners-v2'

export function invalidateHomepageBanners() {
  revalidateTag(HOMEPAGE_BANNER_CACHE_TAG, { expire: 0 })
  revalidatePath('/')
}
