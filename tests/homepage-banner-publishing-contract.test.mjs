import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const readTemplateSql = (path) =>
  readFile(new URL(`../../Template_folder/${path}`, import.meta.url), 'utf8')

test('Homepage banners have exactly three database-owned fixed anchors', async () => {
  const [sql, core] = await Promise.all([
    readTemplateSql('sql_homepage_banner_publishing.sql'),
    read('src/lib/homepage-banners-core.ts'),
  ])

  for (const slot of ['after_hero', 'after_for_boys', 'after_in_discount']) {
    assert.match(sql, new RegExp(`'${slot}'`))
    assert.match(core, new RegExp(`'${slot}'`))
  }
  assert.doesNotMatch(sql, /after_brand_new|after_for_girls/)
  assert.doesNotMatch(core, /after_brand_new|after_for_girls/)
  assert.match(sql, /homepage_banner_slots_slot_key_check/)
})

test('desktop and mobile assets are independent, landscape, and service-only', async () => {
  const sql = await readTemplateSql('sql_homepage_banner_publishing.sql')

  assert.match(sql, /desktop_asset_source text not null/)
  assert.match(sql, /mobile_asset_source text not null/)
  assert.match(sql, /desktop_width::numeric \/ desktop_height >= 1\.5/)
  assert.match(sql, /mobile_width::numeric \/ mobile_height >= 1\.5/)
  assert.match(sql, /revoke all on table public\.homepage_banner_slots from public, anon, authenticated/)
  assert.match(sql, /'site-public'[\s\S]*true[\s\S]*5242880/)
})

test('publishing and position swapping are admin-authorized and atomic', async () => {
  const sql = await readTemplateSql('sql_homepage_banner_publishing.sql')

  assert.match(sql, /create or replace function public\.publish_homepage_banner_slot/)
  assert.match(sql, /slot\.row_version = p_expected_version/)
  assert.match(sql, /customer\.role = 'admin'/)
  assert.match(sql, /create or replace function public\.swap_homepage_banner_slots/)
  assert.match(sql, /order by slot\.slot_key[\s\S]*for update/)
  assert.match(sql, /v_first\.row_version <> p_first_expected_version/)
  assert.match(sql, /v_second\.row_version <> p_second_expected_version/)
})

test('the public loader is cached, invalidatable, and uses direct public asset URLs', async () => {
  const [loader, cache] = await Promise.all([
    read('src/lib/homepage-banners.ts'),
    read('src/lib/homepage-banner-cache.ts'),
  ])

  assert.match(loader, /unstable_cache/)
  assert.match(loader, /revalidate:\s*300/)
  assert.match(loader, /getPublicUrl\(path\)/)
  assert.doesNotMatch(loader, /next\/image/)
  assert.match(cache, /revalidateTag\(HOMEPAGE_BANNER_CACHE_TAG, \{ expire: 0 \}\)/)
  assert.match(cache, /revalidatePath\('\/'\)/)
})

test('Admin upload and publish verify real bytes before the CAS commit', async () => {
  const [uploadRoute, publishRoute, verifier, packageJson] = await Promise.all([
    read('app/api/admin/homepage-banners/upload-url/route.ts'),
    read('app/api/admin/homepage-banners/route.ts'),
    read('src/lib/homepage-banner-admin.ts'),
    read('package.json'),
  ])

  assert.match(uploadRoute, /await requireAdminCustomer\(\)/)
  assert.match(uploadRoute, /createSignedUploadUrl\(storagePath, \{ upsert: false \}\)/)
  assert.match(uploadRoute, /validateHomepageBannerUploadSpec/)
  assert.match(verifier, /HOMEPAGE_BANNER_MAX_BYTES = 5 \* 1024 \* 1024/)
  assert.match(verifier, /\.download\(storagePath\)/)
  assert.match(verifier, /sharp\(bytes/)
  assert.match(verifier, /metadata\.format !== expectedFormat/)
  assert.match(publishRoute, /verifyStoredHomepageBannerAsset/)
  assert.match(publishRoute, /publish_homepage_banner_slot/)
  assert.doesNotMatch(publishRoute, /p_desktop_width:\s*body/)
  assert.doesNotMatch(publishRoute, /p_mobile_width:\s*body/)
  assert.match(packageJson, /"dependencies"[\s\S]*"sharp": "\^0\.35\.3"/)
})

test('Admin preview keeps viewport drafts independent and publishing explicit', async () => {
  const [manager, page, navigation, swapRoute] = await Promise.all([
    read('components/admin/sections/banners/HomepageBannerManager.tsx'),
    read('app/admin/(protected)/banner/page.tsx'),
    read('components/admin/adminNavigation.ts'),
    read('app/api/admin/homepage-banners/swap/route.ts'),
  ])

  assert.match(page, /HomepageBannerManager/)
  assert.doesNotMatch(page, /Coming soon/i)
  assert.match(navigation, /label: 'Banner Manager'/)
  assert.doesNotMatch(navigation, /label: 'Banner Manager'[^\n]+soon: true/)
  assert.match(manager, /type Viewport = 'desktop' \| 'mobile'/)
  assert.match(manager, /style=\{\{ aspectRatio: `\$\{asset\.width\} \/ \$\{asset\.height\}` \}\}/)
  assert.match(manager, /Publish\s*<\/AdminButton>/)
  assert.match(manager, /Uploaded for preview/)
  assert.match(manager, /source: 'storage'/)
  assert.match(manager, /Replace \{viewport\}/)
  assert.match(manager, /Swap position/)
  assert.match(manager, /2xl:grid-cols-/)
  assert.match(manager, /min-w-0 space-y-4 overflow-hidden p-4 sm:p-5/)
  assert.match(manager, /grid min-w-0 grid-cols-1 gap-2 pt-1 sm:grid-cols-2 2xl:grid-cols-1/)
  assert.match(manager, /sm:grid-cols-\[minmax\(0,1fr\)_auto\] 2xl:grid-cols-1/)
  assert.doesNotMatch(manager, /AssetEditor|Published-output preview|quality recommendations/)
  assert.match(swapRoute, /swap_homepage_banner_slots/)
  assert.match(swapRoute, /invalidateHomepageBanners\(\)/)
})

test('Home renders only the three published banner anchors without hard-coded campaign art', async () => {
  const [page, categories, banner] = await Promise.all([
    read('app/page.tsx'),
    read('components/HomeBookCategories.tsx'),
    read('components/HomePosterBanner.tsx'),
  ])

  assert.match(page, /await getPublishedHomepageBanners\(\)/)
  assert.match(page, /banner=\{banners\.after_hero\}/)
  assert.match(categories, /banners\.after_for_boys/)
  assert.match(categories, /banners\.after_in_discount/)
  assert.doesNotMatch(page, /banners\/optimized\//)
  assert.doesNotMatch(categories, /banners\/optimized\/|afterBanner/)
  assert.doesNotMatch(page, /banner-02/)
  assert.match(banner, /<source[\s\S]*banner\.mobile\.src[\s\S]*width=\{banner\.mobile\.width\}/)
  assert.match(banner, /width=\{banner\.desktop\.width\}[\s\S]*className="block h-auto w-full"/)
  assert.doesNotMatch(banner, /rounded|border|shadow/)
})

test('Banner destinations reject slash-backslash protocol-relative forms', async () => {
  const [core, admin] = await Promise.all([
    read('src/lib/homepage-banners-core.ts'),
    read('src/lib/homepage-banner-admin.ts'),
  ])

  assert.match(core, /href\.startsWith\('\/\\\\'\)/)
  assert.match(admin, /href\.startsWith\('\/\\\\'\)/)
})
