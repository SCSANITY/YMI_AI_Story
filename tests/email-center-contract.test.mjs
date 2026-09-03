import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('Admin Email Center exposes overview, templates, and delivery events without editing', async () => {
  const [page, tabs, library, navigation] = await Promise.all([
    read('app/admin/(protected)/emails/page.tsx'),
    read('components/admin/sections/emails/EmailCenterTabs.tsx'),
    read('components/admin/sections/emails/EmailTemplateLibrary.tsx'),
    read('components/admin/adminNavigation.ts'),
  ])

  assert.match(page, /Email Center/)
  assert.match(page, /renderEmailTemplatePreview/)
  assert.match(tabs, /Overview/)
  assert.match(tabs, /Template Library/)
  assert.match(tabs, /Delivery Events/)
  assert.match(library, /Read only/)
  assert.match(library, /No editable controls/)
  assert.match(library, /sandbox=""/)
  assert.doesNotMatch(`${page}\n${library}`, /contentEditable|Save Template|Publish Template|Send Test/)
  assert.match(navigation, /Email Center/)
})

test('one catalog owns all active email families and excludes the retired General Inbox sender', async () => {
  const [catalog, email, webhook, packageJson] = await Promise.all([
    read('src/lib/email-template-catalog.tsx'),
    read('src/lib/email.tsx'),
    read('src/lib/resend-webhook-events.ts'),
    read('package.json'),
  ])

  for (const key of [
    'guest_otp',
    'newsletter_confirmation',
    'order_confirmation',
    'final_delivery',
    'unpaid_reminder',
    'logistics_update',
    'support_reply',
    'kol_partnership_reply',
    'general_mail_message',
    'stripe_receipt',
    'supabase_signup_otp',
    'supabase_password_recovery',
  ]) {
    assert.match(catalog, new RegExp(`emailKey: ['"]${key}['"]`))
  }

  assert.doesNotMatch(email, /sendGeneralInboxReplyEmail|GeneralInboxReplyEmail/)
  assert.doesNotMatch(webhook, /email_key === ['"]general_inbox_reply['"]/)
  assert.doesNotMatch(packageJson, /GeneralInboxReplyEmail\.test/)
})
