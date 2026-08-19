import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolvePublishedHomepageBanner,
  resolvePublishedHomepageBanners,
  type HomepageBannerSlotRow,
} from './homepage-banners-core'

const validRow: HomepageBannerSlotRow = {
  slot_key: 'after_hero',
  display_name: 'How YMI Story Works',
  desktop_asset_source: 'builtin',
  desktop_asset_path: 'banners/optimized/workflow-desktop.webp',
  desktop_width: 2400,
  desktop_height: 1200,
  mobile_asset_source: 'storage',
  mobile_asset_path: 'homepage-banners/mobile/example.webp',
  mobile_width: 1100,
  mobile_height: 550,
  alt_text: 'How YMI Story works',
  href: '/books',
  is_visible: true,
}

const resolveUrl = (source: 'builtin' | 'storage', path: string) =>
  source === 'builtin' ? `/${path}` : `https://assets.example/${path}`

test('keeps desktop and mobile assets and geometry independent', () => {
  const banner = resolvePublishedHomepageBanner(validRow, resolveUrl)
  assert.ok(banner)
  assert.equal(banner.desktop.src, '/banners/optimized/workflow-desktop.webp')
  assert.deepEqual(
    { width: banner.desktop.width, height: banner.desktop.height },
    { width: 2400, height: 1200 },
  )
  assert.equal(
    banner.mobile.src,
    'https://assets.example/homepage-banners/mobile/example.webp',
  )
  assert.deepEqual(
    { width: banner.mobile.width, height: banner.mobile.height },
    { width: 1100, height: 550 },
  )
})

test('rejects unknown anchors, cross-origin links, and square assets', () => {
  assert.throws(
    () => resolvePublishedHomepageBanner({ ...validRow, slot_key: 'after_brand_new' }, resolveUrl),
    /Unsupported Homepage banner slot/,
  )
  assert.throws(
    () => resolvePublishedHomepageBanner({ ...validRow, href: 'https://example.com' }, resolveUrl),
    /same-origin path/,
  )
  assert.throws(
    () => resolvePublishedHomepageBanner({ ...validRow, href: '/\\evil.example' }, resolveUrl),
    /same-origin path/,
  )
  assert.throws(
    () => resolvePublishedHomepageBanner({ ...validRow, desktop_height: 2400 }, resolveUrl),
    /aspect ratio/,
  )
})

test('a hidden or invalid optional banner cannot take down the valid slots', () => {
  const invalid = { ...validRow, slot_key: 'after_for_boys', desktop_height: 2400 }
  const hidden = { ...validRow, slot_key: 'after_in_discount', is_visible: false }
  const errors: string[] = []
  const banners = resolvePublishedHomepageBanners(
    [validRow, invalid, hidden],
    resolveUrl,
    (_row, error) => errors.push(error.message),
  )

  assert.deepEqual(Object.keys(banners), ['after_hero'])
  assert.equal(errors.length, 1)
})
