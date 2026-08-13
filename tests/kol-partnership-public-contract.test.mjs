import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('the Collaboration page is account-gated and no longer renders self-service promo', async () => {
  const page = await read('app/collaboration/page.tsx')

  assert.match(page, /isAuthResolved/)
  assert.match(page, /openLoginModal\('login'\)/)
  assert.match(page, /openLoginModal\('signup'\)/)
  assert.match(page, /aria-hidden="true"/)
  assert.match(page, /pointer-events-none select-none/)
  assert.match(page, /user \? \([\s\S]*<CollaborationLeadFormSection user=\{user\}/)
  assert.doesNotMatch(page, /CreatorPromoSection/)
})

test('legacy Creator Promo runtime and copy are physically retired', async () => {
  const [messages, service, packageJson, sql, uat] = await Promise.all([
    read('src/lib/i18n-messages.ts'),
    read('components/admin/sections/ServiceControlSection.tsx'),
    read('package.json'),
    read('../Template_folder/sql_kol_partnership_foundation.sql'),
    read('docs/ADMIN_UAT_MATRIX.md'),
  ])

  assert.doesNotMatch(messages, /creatorPromo|Creator Promo|creator promo/)
  assert.doesNotMatch(service, /CreatorPromo|creator-promo/)
  assert.doesNotMatch(packageJson, /creator-promo-contract/)
  assert.match(sql, /delete from public\.admin_settings\s+where setting_key = 'creator_promo_config'/)
  assert.match(uat, /retired[\s\S]*Creator Promo setting and control are absent/)

  for (const retiredPath of [
    'app/collaboration/CreatorPromoSection.tsx',
    'app/api/creator-promo/my-code/route.ts',
    'app/api/admin/creator-promo-config/route.ts',
    'components/admin/sections/service/CreatorPromoControl.tsx',
    'src/lib/creator-promo-policy.ts',
    'tests/creator-promo-contract.test.mjs',
  ]) {
    await assert.rejects(read(retiredPath), { code: 'ENOENT' })
  }
})

test('the public application collects KOL facts without gender or client-owned identity', async () => {
  const [form, types] = await Promise.all([
    read('app/collaboration/CollaborationLeadFormSection.tsx'),
    read('types/index.ts'),
  ])

  for (const field of [
    'contact_email',
    'country_region',
    'primary_market',
    'audience_size',
    'content_focus',
    'website_url',
    'instagram',
    'tiktok',
    'youtube',
    'xiaohongshu',
  ]) {
    assert.match(types, new RegExp(`${field}: string`))
  }
  assert.doesNotMatch(types, /CollaborationLeadGender/)
  assert.doesNotMatch(form, /gender/i)
  assert.doesNotMatch(form, /customerId|customer_id/)
  assert.match(form, /user\.email/)
  assert.match(form, /cache: 'no-store'/)
  assert.match(form, /AbortController/)
  assert.match(form, /submitIntentRef/)
})

test('the application API authenticates before parsing input and owns customer identity', async () => {
  const route = await read('app/api/collaboration-leads/route.ts')

  const postStart = route.indexOf('export async function POST')
  const authIndex = route.indexOf('resolveAuthenticatedApplicant()', postStart)
  const bodyIndex = route.indexOf('request.json()', postStart)
  assert.ok(authIndex > postStart)
  assert.ok(bodyIndex > authIndex)
  assert.match(route, /supabase\.auth\.getUser\(\)/)
  assert.match(route, /\.eq\('auth_user_id', user\.id\)/)
  assert.match(route, /customer_id: auth\.applicant\.customerId/)
  assert.match(route, /account_email_snapshot: auth\.applicant\.accountEmail/)
  assert.doesNotMatch(route, /body\.customer|body\?\.customer/i)
  assert.doesNotMatch(route, /send.*email|resend/i)
})

test('one open application is enforced by the database and reconciled in the UI', async () => {
  const [route, form] = await Promise.all([
    read('app/api/collaboration-leads/route.ts'),
    read('app/collaboration/CollaborationLeadFormSection.tsx'),
  ])

  assert.match(route, /OPEN_REVIEW_STATUSES = \['new', 'reviewing', 'contacting', 'partnered'\]/)
  assert.match(route, /error\?\.code === '23505'/)
  assert.match(route, /kol_collaboration_leads_one_open_per_customer_key/)
  assert.match(route, /open_application_exists/)
  assert.match(route, /unread_admin_count: 1/)
  assert.match(form, /response\.status === 409/)
  assert.match(form, /await loadApplication\(\)/)
  assert.match(form, /application\.review_status/)
})
