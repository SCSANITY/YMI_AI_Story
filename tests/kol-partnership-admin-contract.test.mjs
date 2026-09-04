import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8')
}

test('Admin KOL queue is protected, uncached, filtered, and attention-counted', async () => {
  const [listRoute, detailRoute, page, navigation, sidebar] = await Promise.all([
    read('app/api/admin/kol-partnerships/route.ts'),
    read('app/api/admin/kol-partnerships/[leadId]/route.ts'),
    read('app/admin/(protected)/partnerships/page.tsx'),
    read('components/admin/adminNavigation.ts'),
    read('components/admin/AdminSidebar.tsx'),
  ])

  assert.match(listRoute, /await\s+requireAdminCustomer\s*\(\s*\)/)
  assert.match(detailRoute, /await\s+requireAdminCustomer\s*\(\s*\)/g)
  assert.match(listRoute, /noStoreJson as (?:jsonNoStore|privateJson)/)
  assert.match(detailRoute, /noStoreJson as (?:jsonNoStore|privateJson)/)
  assert.match(listRoute, /view['"]\) === ['"]attention_count/)
  assert.match(listRoute, /review_status\.eq\.new,unread_admin_count\.gt\.0/)
  assert.match(listRoute, /KOL_OPEN_STATUSES/)
  assert.match(page, /KolPartnershipWorkspace/)
  assert.match(navigation, /KOL Partnerships/)
  assert.match(navigation, /attention:\s*['"]kol-partnerships['"]/)
  assert.match(sidebar, /ADMIN_KOL_ATTENTION_REFRESH_EVENT/)
  assert.match(sidebar, /setInterval\(refresh,\s*30_000\)/)
})

test('KOL detail mutations use server Admin identity and updated-at CAS', async () => {
  const detailRoute = await read('app/api/admin/kol-partnerships/[leadId]/route.ts')

  assert.equal(
    [...detailRoute.matchAll(/await\s+requireAdminCustomer\s*\(\s*\)/g)].length,
    2,
    'GET and PATCH must authorize independently'
  )
  assert.match(detailRoute, /expectedUpdatedAt/)
  assert.match(detailRoute, /\.eq\(['"]updated_at['"],\s*expectedUpdatedAt\)/)
  assert.match(detailRoute, /assigned_admin_customer_id\s*=\s*admin\.customer_id/)
  assert.match(detailRoute, /action === ['"]save_notes['"]/)
  assert.match(detailRoute, /action === ['"]mark_read['"]/)
  assert.match(detailRoute, /Closed partnership applications are read-only/)
  assert.doesNotMatch(detailRoute, /body\?\.assigned_admin_customer_id|body\?\.customer_id/)
})

test('KOL Admin keeps public profiles inert and Code management lead-scoped', async () => {
  const [detail, workspace, serverProjection, codePanel, codeRoute] = await Promise.all([
    read('components/admin/sections/kol/KolLeadDetail.tsx'),
    read('components/admin/sections/kol/KolPartnershipWorkspace.tsx'),
    read('src/lib/admin-kol-partnerships-server.ts'),
    read('components/admin/sections/kol/KolPartnershipCodePanel.tsx'),
    read('app/api/admin/kol-partnerships/[leadId]/codes/route.ts'),
  ])

  assert.match(detail, /Applicant-supplied values are shown as text/)
  assert.doesNotMatch(detail, /href=\{lead\.(website_url|instagram|tiktok|youtube|xiaohongshu)/)
  assert.match(detail, /KolPartnershipConversation/)
  assert.match(detail, /KolPartnershipCodePanel/)
  assert.match(detail, /function BackToApplicationsButton/)
  assert.match(detail, />\s*Applications\s*<\/AdminButton>/)
  assert.doesNotMatch(detail, /absolute left-3 top-3/)
  assert.doesNotMatch(detail, /title="Back to partnership list"/)
  assert.match(workspace, /\/messages/)
  assert.doesNotMatch(serverProjection, /reply_token/)
  assert.match(workspace, /listIntentRef/)
  assert.match(workspace, /detailIntentRef/)
  assert.match(workspace, /expectedUpdatedAt/)
  assert.match(codePanel, /\/api\/admin\/kol-partnerships\/\$\{leadId\}\/codes/)
  assert.match(codePanel, /leadStatus !== ['"]partnered['"]/)
  assert.match(codePanel, /requestIntentRef/)
  assert.match(codePanel, /leadIdRef/)
  assert.match(codePanel, /Old Code will be permanently retired/)
  assert.equal(
    [...codeRoute.matchAll(/await\s+requireAdminCustomer\s*\(\s*\)/g)].length,
    2,
    'POST and PATCH must authorize independently'
  )
  assert.match(codeRoute, /noStoreJson as (?:jsonNoStore|privateJson)/)
  assert.doesNotMatch(codeRoute, /body\.(customerId|ownerCustomerId|collaborationLeadId)/)
})

test('S4a partnership email is Admin-only, idempotent, threaded, and delivery-observable', async () => {
  const [route, email, emailBoundary, conversation, detailRoute] = await Promise.all([
    read('app/api/admin/kol-partnerships/[leadId]/messages/route.ts'),
    read('src/lib/email.tsx'),
    read('src/lib/kol-partnership-email.ts'),
    read('components/admin/sections/kol/KolPartnershipConversation.tsx'),
    read('app/api/admin/kol-partnerships/[leadId]/route.ts'),
  ])

  assert.match(route, /await\s+requireAdminCustomer\s*\(\s*\)/)
  assert.match(route, /noStoreJson as (?:jsonNoStore|privateJson)/)
  assert.match(route, /requestId/)
  assert.match(route, /insertError\?\.code === ['"]23505['"]/)
  assert.match(route, /PENDING_STALE_MS/)
  assert.match(route, /buildSupportReferences/)
  assert.match(route, /inReplyTo/)
  assert.match(route, /references/)
  assert.match(route, /buildKolPartnershipReplyAddress/)
  assert.match(route, /\.eq\(['"]review_status['"],\s*params\.observedStatus\)/)
  assert.match(route, /review_status === ['"]declined['"]|review_status === ['"]archived['"]/)
  assert.doesNotMatch(route, /body\?\.(customerId|leadCode|replyToken|recipient|to)/)

  assert.match(email, /EMAIL_FROM_COLLABORATION/)
  assert.match(email, /emailKey:\s*['"]kol_partnership_reply['"]/)
  assert.match(email, /kol_partnership_reply:\$\{params\.messageId\}/)
  assert.match(email, /retryFailed:\s*true/)
  assert.match(email, /KolPartnershipEmail/)
  assert.match(email, /buildKolPartnershipEmailText/)
  assert.match(emailBoundary, /partner-\$\{formatEmailRouteAlias\(replyAlias\)\}@\$\{domain\}/)
  assert.doesNotMatch(emailBoundary, /partners\\\+|collab-|replyToken/)

  assert.match(detailRoute, /loadAdminKolCorrespondence/)
  assert.match(conversation, /provider_delivery_status/)
  assert.match(conversation, /Delivered/)
  assert.match(conversation, /Retry send/)
  assert.doesNotMatch(route, /inbound_email_envelopes|inbound_email_attachments/)
})

test('S4b KOL replies use opaque routing, sender quarantine, and Admin-only association review', async () => {
  const [routing, processor, associationRoute, detailRoute, conversation, downloadRoute, sql] = await Promise.all([
    read('src/lib/inbound-email-routing.ts'),
    read('src/lib/inbound-email-processing.ts'),
    read('app/api/admin/kol-partnerships/[leadId]/messages/[messageId]/association/route.ts'),
    read('app/api/admin/kol-partnerships/[leadId]/route.ts'),
    read('components/admin/sections/kol/KolPartnershipConversation.tsx'),
    read('app/api/admin/inbox/attachments/[attachmentId]/download/route.ts'),
    read('tests/fixtures/external-contracts/sql/sql_kol_partnership_foundation.sql'),
  ])

  assert.match(routing, /kind:\s*['"]kol_reply['"]/)
  assert.match(routing, /parseKolPartnershipReplyAddress/)
  assert.match(routing, /distinctTickets\.length > 0 && distinctKolLeads\.length > 0/)
  assert.match(routing, /kind:\s*['"]rejected_ambiguous['"]/)
  assert.match(processor, /\.eq\(['"]reply_alias['"], routedAddress\.replyAlias\)/)
  assert.doesNotMatch(processor, /routedAddress\.replyToken|matchesKolPartnershipReplyToken/)
  assert.match(processor, /customerResult\.data\?\.email/)
  assert.match(processor, /lead\.account_email_snapshot/)
  assert.match(processor, /lead\.contact_email/)
  assert.match(processor, /classifyKolPartnershipSender/)
  assert.match(processor, /loadExistingKolInboundMessage/)
  assert.match(processor, /kol_reply_quarantined/)

  assert.match(associationRoute, /await\s+requireAdminCustomer\s*\(\s*\)/)
  assert.match(associationRoute, /noStoreJson as (?:jsonNoStore|privateJson)/)
  assert.match(associationRoute, /source !== ['"]email_inbound['"]/)
  assert.match(associationRoute, /\.eq\(['"]association_state['"],\s*['"]pending['"]\)/)
  assert.match(associationRoute, /association_reviewed_by:\s*admin\.customer_id/)
  assert.match(detailRoute, /loadAdminKolCorrespondence/)
  assert.match(conversation, /Sender confirmation required/)
  assert.match(conversation, /Downloads unlock only after sender confirmation/)
  assert.match(downloadRoute, /association_state !== ['"]confirmed['"]/)
  assert.match(sql, /'ticket_reply',[\s\S]*'kol_reply',[\s\S]*'support_direct'/)
})

test('S5 KOL Code management keeps edit and rotation inside dedicated transactions', async () => {
  const [route, loader, panel, detailRoute, sql, genericDiscounts, checkoutDiscounts] =
    await Promise.all([
      read('app/api/admin/kol-partnerships/[leadId]/codes/route.ts'),
      read('src/lib/admin-kol-codes-server.ts'),
      read('components/admin/sections/kol/KolPartnershipCodePanel.tsx'),
      read('app/api/admin/kol-partnerships/[leadId]/route.ts'),
      read('tests/fixtures/external-contracts/sql/sql_kol_partnership_foundation.sql'),
      read('app/api/admin/discounts/route.ts'),
      read('src/lib/discounts.ts'),
    ])

  assert.match(route, /create_kol_collaboration_code/)
  assert.match(route, /update_kol_collaboration_code/)
  assert.match(route, /rotate_kol_collaboration_code/)
  assert.match(route, /p_admin_customer_id:\s*admin\.customer_id/)
  assert.match(route, /p_lead_id:\s*leadId/)
  assert.match(route, /expectedUpdatedAt/)
  assert.match(loader, /\.eq\(['"]collaboration_lead_id['"],\s*leadId\)/)
  assert.match(loader, /\.eq\(['"]source['"],\s*['"]collaboration['"]\)/)
  assert.match(detailRoute, /loadAdminKolCodes/)
  assert.match(panel, /Code is active/)
  assert.match(panel, /Code history/)
  assert.match(panel, /unpaid checkout/)
  assert.match(panel, /sm:grid-cols-2 xl:grid-cols-3/)
  assert.match(panel, /flex flex-wrap justify-end/)
  assert.doesNotMatch(panel, /h-screen|h-dvh|min-w-\[[0-9]/)

  assert.match(sql, /create or replace function public\.update_kol_collaboration_code/)
  assert.match(sql, /create or replace function public\.rotate_kol_collaboration_code/)
  assert.match(sql, /v_instrument\.updated_at is distinct from p_expected_updated_at/)
  assert.match(sql, /v_current\.updated_at is distinct from p_expected_updated_at/)
  assert.match(sql, /update public\.discount_instruments[\s\S]*status = 'disabled'[\s\S]*from public\.create_kol_collaboration_code/)
  assert.match(sql, /grant execute on function public\.update_kol_collaboration_code[\s\S]*to service_role/)
  assert.match(sql, /grant execute on function public\.rotate_kol_collaboration_code[\s\S]*to service_role/)

  assert.match(genericDiscounts, /\.neq\('source', 'collaboration'\)/)
  assert.doesNotMatch(genericDiscounts, /update_kol_collaboration_code|rotate_kol_collaboration_code/)
  assert.match(checkoutDiscounts, /apply_discount_instrument/)
})
