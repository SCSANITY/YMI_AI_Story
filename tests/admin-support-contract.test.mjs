import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const templates = path.resolve(root, '..', 'Template_folder')

async function read(relativePath, base = root) {
  return readFile(path.join(base, relativePath), 'utf8')
}

test('Support Admin remains a protected, independently scrolling conversation workspace', async () => {
  const [sidebar, page, inbox, queue, conversation, context] = await Promise.all([
    read('components/admin/AdminSidebar.tsx'),
    read('app/admin/(protected)/support/page.tsx'),
    read('components/admin/sections/support/SupportInbox.tsx'),
    read('components/admin/sections/support/SupportTicketQueue.tsx'),
    read('components/admin/sections/support/SupportConversation.tsx'),
    read('components/admin/sections/support/SupportCustomerContext.tsx'),
  ])

  assert.match(sidebar, /Support Inbox/)
  assert.match(sidebar, /\/admin\/support/)
  assert.match(page, /xl:h-\[calc\(100dvh-3rem\)\]/)
  assert.match(inbox, /POLL_INTERVAL_MS = 15_000/)
  assert.match(inbox, /listIntentRef/)
  assert.match(inbox, /detailIntentRef/)
  assert.match(queue, /flex-1 overflow-y-auto overscroll-contain/)
  assert.match(conversation, /overflow-y-auto overscroll-contain/)
  assert.match(conversation, /const \[draft, setDraft\]/)
  assert.match(conversation, /Reply directly|Replies continue by email/)
  assert.match(context, /Email replies are communication only/)
})

test('Support APIs keep Admin authority server-side and expose no cached private data', async () => {
  const [listApi, detailApi, replyApi] = await Promise.all([
    read('app/api/admin/support/tickets/route.ts'),
    read('app/api/admin/support/tickets/[questionId]/route.ts'),
    read('app/api/admin/support/tickets/[questionId]/messages/route.ts'),
  ])

  for (const source of [listApi, detailApi, replyApi]) {
    assert.match(source, /requireAdminCustomer/)
    assert.match(source, /Cache-Control['"]:\s*['"]no-store/)
  }
  assert.doesNotMatch(listApi + detailApi, /reply_token/)
  assert.match(replyApi, /buildSupportReplyAddress/)
  assert.match(replyApi, /support_messages/)
  assert.match(replyApi, /delivery_status:\s*['"]pending['"]/)
  assert.match(replyApi, /sendSupportReplyEmail/)
  assert.match(replyApi, /PENDING_STALE_MS/)
  assert.match(detailApi, /expectedLastMessageAt/)
})

test('Resend Inbound persists before deferred processing and keeps ticket authority intact', async () => {
  const [webhook, processor, routing, recovery, inbound, ticket, email, emailEvents, rootSql, directSql] = await Promise.all([
    read('app/api/webhooks/resend/route.ts'),
    read('src/lib/inbound-email-processing.ts'),
    read('src/lib/inbound-email-routing.ts'),
    read('app/api/internal/email/inbound/process/route.ts'),
    read('src/lib/support-inbound.ts'),
    read('src/lib/support-ticket.ts'),
    read('src/lib/email.tsx'),
    read('src/lib/emailEvents.ts'),
    read('sql_root_email_inbound_foundation.sql', templates),
    read('sql_root_email_direct_support.sql', templates),
  ])

  assert.match(webhook, /const rawPayload = await request\.text\(\)/)
  assert.match(webhook, /resend\.webhooks\.verify/)
  assert.match(webhook, /RESEND_INBOUND_WEBHOOK_SECRET/)
  assert.match(webhook, /persistInboundEmailEnvelope/)
  assert.match(webhook, /after\(async/)
  assert.match(webhook, /processInboundEmailEnvelope/)
  assert.doesNotMatch(webhook, /emails\.receiving\.get/)
  assert.ok(webhook.indexOf('persistInboundEmailEnvelope') < webhook.indexOf('after(async'))
  assert.match(processor, /resend\.emails\.receiving\.get/)
  assert.match(processor, /claim_inbound_email_envelope/)
  assert.match(processor, /sender_does_not_match_ticket/)
  assert.match(processor, /support_messages/)
  assert.match(processor, /create_inbound_support_ticket/)
  assert.match(processor, /route_kind === ['"]support_direct['"]/)
  assert.match(processor, /processing_checkpoint:\s*['"]route_applied['"]/)
  assert.match(processor, /processing_status:\s*['"]pending_route['"]/)
  assert.match(routing, /rejected_unknown/)
  assert.match(routing, /postmaster/)
  assert.match(routing, /abuse/)
  assert.match(routing, /noreply/)
  assert.match(routing, /rejected_ambiguous/)
  assert.match(recovery, /INTERNAL_API_SECRET/)
  assert.match(recovery, /CRON_SECRET/)
  assert.match(recovery, /processInboundEmailBacklog/)
  assert.match(rootSql, /create table if not exists public\.inbound_email_envelopes/)
  assert.match(rootSql, /inbound_email_envelopes_provider_email_id_key/)
  assert.match(rootSql, /inbound_email_envelopes_webhook_event_id_key/)
  assert.match(rootSql, /claim_inbound_email_envelope/)
  assert.match(rootSql, /processing_status = ['"]processing['"]/)
  assert.match(rootSql, /enable row level security/)
  assert.match(rootSql, /grant execute on function public\.claim_inbound_email_envelope/)
  assert.match(rootSql, /set search_path = ['"]{2}/)
  assert.match(directSql, /alter column customer_id drop not null/)
  assert.match(directSql, /create_inbound_support_ticket/)
  assert.match(directSql, /pg_advisory_xact_lock/)
  assert.match(directSql, /support_email_rate_limited/)
  assert.match(directSql, /where message\.provider_email_id = trim\(p_provider_email_id\)/)
  assert.doesNotMatch(directSql, /lower\([^\n]*subject|subject[^\n]*ilike/i)
  assert.match(directSql, /new\.source = ['"]web_form['"] or v_is_first_customer_message/)
  assert.match(directSql, /set search_path = ['"]{2}/)
  assert.match(inbound, /EmailReplyParser/)
  assert.match(inbound, /html-to-text/)
  assert.match(inbound, /normalizeInternetMessageId/)
  assert.match(ticket, /reply\.ymistory\.com/)
  assert.match(email, /replyTo/)
  assert.match(email, /support_reply:/)
  assert.match(email, /idempotencyKey \? \{ idempotencyKey \}/)
  assert.match(email, /retryPendingAfterMs:\s*2 \* 60 \* 1000/)
  assert.match(emailEvents, /existingRow\.status === ['"]pending['"]/)
  assert.match(emailEvents, /\.eq\(['"]updated_at['"], existingRow\.updated_at\)/)
  assert.match(email, /In-Reply-To/)
  assert.match(email, /References/)
})

test('Email-origin Support tickets remain account-neutral and Admin-safe', async () => {
  const [types, detailApi, replyApi, email] = await Promise.all([
    read('src/lib/support-types.ts'),
    read('app/api/admin/support/tickets/[questionId]/route.ts'),
    read('app/api/admin/support/tickets/[questionId]/messages/route.ts'),
    read('src/lib/email.tsx'),
  ])

  assert.match(types, /customer_id:\s*string \| null/)
  assert.match(detailApi, /ticket\.customer_id\s*\?/)
  assert.match(detailApi, /Promise\.resolve\(\{ data: \[\], error: null \}\)/)
  assert.match(replyApi, /customerId:\s*ticket\.customer_id/)
  assert.match(email, /customerId:\s*string \| null/)
})

test('Support SQL migrates existing questions into messages and locks tables to service role', async () => {
  const sql = await read('sql_support_ticket_center.sql', templates)

  assert.match(sql, /create table if not exists public\.support_messages/)
  assert.match(sql, /create table if not exists public\.support_webhook_events/)
  assert.match(sql, /insert into public\.support_messages[\s\S]*from public\.support_questions/)
  assert.match(sql, /create_support_question/)
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /support_rate_limited/)
  assert.match(sql, /sync_support_ticket_from_message/)
  assert.match(sql, /enable row level security/)
  assert.match(sql, /revoke all on table public\.support_messages from public, anon, authenticated/)
  assert.match(sql, /grant .*support_messages to service_role/)
})

test('General Inbox consumes recognized aliases through the canonical envelope', async () => {
  const [sql, processor, listApi, detailApi, replyApi, page, workspace, sidebar, email] = await Promise.all([
    read('sql_root_email_general_inbox.sql', templates),
    read('src/lib/inbound-email-processing.ts'),
    read('app/api/admin/inbox/messages/route.ts'),
    read('app/api/admin/inbox/messages/[inboundEmailId]/route.ts'),
    read('app/api/admin/inbox/messages/[inboundEmailId]/replies/route.ts'),
    read('app/admin/(protected)/inbox/page.tsx'),
    read('components/admin/sections/inbox/GeneralInbox.tsx'),
    read('components/admin/AdminSidebar.tsx'),
    read('src/lib/email.tsx'),
  ])

  assert.match(sql, /alter table public\.inbound_email_envelopes/)
  assert.match(sql, /create table if not exists public\.inbound_email_replies/)
  assert.match(sql, /route_kind in \(['"]general['"], ['"]operational_support['"]\)/)
  assert.match(sql, /processing_status = ['"]failed['"]/)
  assert.match(sql, /processing_status = ['"]pending_route['"]/)
  assert.match(sql, /enable row level security/)
  assert.match(sql, /grant .*inbound_email_replies to service_role/)
  assert.match(processor, /routeGeneralInbox/)
  assert.match(processor, /reason: ['"]general_inbox['"]/)
  assert.match(processor, /readInboundHeader/)
  assert.match(processor, /normalizeInternetMessageReferences/)

  for (const api of [listApi, detailApi, replyApi]) {
    assert.match(api, /requireAdminCustomer/)
    assert.match(api, /Cache-Control['"]:\s*['"]no-store/)
  }
  assert.match(listApi + detailApi, /inbound_email_envelopes/)
  assert.match(replyApi, /resolveGeneralInboxReplyIdentity\(inbound\.route_address\)/)
  assert.match(replyApi, /normalizeSupportEmail\(inbound\.from_email\)/)
  assert.doesNotMatch(replyApi, /body\?\.(to|from|replyTo|subject)/)
  assert.match(replyApi, /sendGeneralInboxReplyEmail/)
  assert.match(replyApi, /PENDING_STALE_MS/)
  assert.match(email, /general_inbox_reply:/)
  assert.match(page, /GeneralInbox/)
  assert.match(workspace, /Root mail/)
  assert.match(workspace, /From and Reply-To are selected by the server/)
  assert.match(sidebar, /General Inbox/)
})

test('Inbound attachments are bounded, privately persisted, and Admin-downloaded only', async () => {
  const [sql, processor, importer, policy, downloadApi, generalApi, supportApi, attachmentUi] =
    await Promise.all([
      read('sql_root_email_attachment_persistence.sql', templates),
      read('src/lib/inbound-email-processing.ts'),
      read('src/lib/inbound-email-attachments.ts'),
      read('src/lib/inbound-email-attachment-policy.ts'),
      read('app/api/admin/inbox/attachments/[attachmentId]/download/route.ts'),
      read('app/api/admin/inbox/messages/[inboundEmailId]/route.ts'),
      read('app/api/admin/support/tickets/[questionId]/route.ts'),
      read('components/admin/InboundAttachmentList.tsx'),
    ])

  assert.match(sql, /create table if not exists public\.inbound_email_attachments/)
  assert.match(sql, /inbound-email-private/)
  assert.match(sql, /public\s*=\s*false/)
  assert.match(sql, /application\/octet-stream/)
  assert.match(sql, /enable row level security/)
  assert.match(sql, /revoke all on table public\.inbound_email_attachments/)
  assert.match(sql, /processing_status = ['"]failed['"]/)
  assert.match(processor, /processInboundEmailAttachments/)
  assert.match(
    processor,
    /routeDirectSupport\(envelope\)[\s\S]*processInboundEmailAttachments\(envelope, resend\)[\s\S]*finishEnvelope\(envelope, questionId\)/,
    'the canonical Support route must exist before attachment import and final completion'
  )
  assert.match(importer, /emails\.receiving\.attachments\.list/)
  assert.match(importer, /emails\.receiving\.attachments\.get/)
  assert.match(importer, /redirect:\s*['"]error['"]/)
  assert.match(importer, /application\/octet-stream/)
  assert.match(importer, /attachment_status:\s*status/)
  assert.match(policy, /MAX_INBOUND_ATTACHMENTS\s*=\s*10/)
  assert.match(policy, /MAX_INBOUND_ATTACHMENT_BYTES\s*=\s*10 \* 1024 \* 1024/)
  assert.match(policy, /MAX_INBOUND_MESSAGE_ATTACHMENT_BYTES\s*=\s*25 \* 1024 \* 1024/)
  assert.match(policy, /content_signature_mismatch|attachmentBytesMatchContentType/)
  assert.match(downloadApi, /requireAdminCustomer/)
  assert.match(downloadApi, /\.download\(attachment\.storage_path\)/)
  assert.match(downloadApi, /Content-Disposition['"]:\s*`attachment;/)
  assert.match(downloadApi, /X-Content-Type-Options['"]:\s*['"]nosniff['"]/)
  assert.match(downloadApi, /private, no-store/)
  assert.doesNotMatch(downloadApi, /createSignedUrl|signedUrl/)
  assert.match(generalApi + supportApi, /inbound_email_attachments/)
  assert.match(attachmentUi, /status === ['"]stored['"]/)
  assert.match(attachmentUi, /rejection_reason/)
  assert.match(attachmentUi, /response\.blob\(\)/)
  assert.match(attachmentUi, /URL\.createObjectURL/)
  assert.match(attachmentUi, /URL\.revokeObjectURL/)
  assert.doesNotMatch(attachmentUi, /data\?\.url|signedUrl/)
  assert.doesNotMatch(attachmentUi, /<img|dangerouslySetInnerHTML/)
})

test('one signed Resend boundary isolates inbound, delivery, and ignored events', async () => {
  const [sql, priorityGuard, webhook, policy, processor, recovery, emailEventsPage, emailEventsPanel] =
    await Promise.all([
      read('sql_resend_event_operations.sql', templates),
      read('sql_resend_event_priority_guard.sql', templates),
      read('app/api/webhooks/resend/route.ts'),
      read('src/lib/resend-webhook-policy.ts'),
      read('src/lib/resend-webhook-events.ts'),
      read('app/api/internal/email/inbound/process/route.ts'),
      read('app/admin/(protected)/emails/page.tsx'),
      read('components/admin/sections/emails/EmailEventsPanel.tsx'),
    ])

  await assert.rejects(
    read('app/api/webhooks/resend/inbound/route.ts'),
    /ENOENT/,
    'the free-plan integration must expose only one Resend webhook endpoint'
  )
  assert.match(webhook, /const rawPayload = await request\.text\(\)/)
  assert.match(webhook, /resend\.webhooks\.verify/)
  const verifyCallIndex = webhook.indexOf('verified = await Promise.resolve')
  const normalizeCallIndex = webhook.indexOf('const event = normalizeResendWebhookEvent')
  assert.ok(verifyCallIndex >= 0 && verifyCallIndex < normalizeCallIndex)
  assert.match(webhook, /claimResendWebhookEvent/)
  assert.match(webhook, /persistInboundEmailEnvelope/)
  assert.match(webhook, /reconcileResendDeliveryEvent/)
  assert.match(webhook, /markResendWebhookEventIgnored/)
  assert.doesNotMatch(webhook, /email\.opened['"]\s*\)|email\.clicked['"]\s*\)/)

  assert.match(sql, /create table if not exists public\.resend_webhook_events/)
  assert.match(sql, /claim_resend_webhook_event/)
  assert.match(sql, /reconcile_resend_delivery_event/)
  assert.match(sql, /where resend_message_id = trim\(p_provider_email_id\)/)
  assert.match(sql, /provider_delivery_status/)
  for (const source of [sql, priorityGuard]) {
    assert.match(source, /v_priority > v_email_event\.provider_event_priority/)
    assert.match(source, /v_priority = v_email_event\.provider_event_priority/)
    assert.match(source, /p_event_created_at >= v_email_event\.provider_event_at/)
    assert.doesNotMatch(source, /p_event_created_at > v_email_event\.provider_event_at\s+or/)
  }
  assert.doesNotMatch(sql, /^\s*status\s*=\s*v_status/m)
  assert.match(sql, /enable row level security/)
  assert.match(sql, /grant execute on function public\.claim_resend_webhook_event/)

  assert.match(policy, /RESEND_DELIVERY_EVENT_TYPES/)
  assert.match(policy, /kind: ['"]ignored['"]/)
  assert.doesNotMatch(policy, /from:|to:|subject:/)
  assert.match(processor, /pending_match/)
  assert.match(processor, /PROCESSING_STALE_SECONDS/)
  assert.match(recovery, /processInboundEmailBacklog/)
  assert.match(recovery, /processResendDeliveryEventBacklog/)

  assert.match(emailEventsPage, /resend_webhook_events/)
  assert.match(emailEventsPage, /provider_delivery_status/)
  assert.match(emailEventsPanel, /dailyCombined >= 70/)
  assert.match(emailEventsPanel, /monthlyCombined >= 2400/)
  assert.match(emailEventsPanel, /optionalTrackingEvents/)
})

test('M6 rehearsal remains isolated from root MX and has bounded recovery', async () => {
  const [webhook, recovery, vercel, preflight, deliveryProbe, runbook] = await Promise.all([
    read('app/api/webhooks/resend/route.ts'),
    read('app/api/internal/email/inbound/process/route.ts'),
    read('vercel.json'),
    read('scripts/root-email-m6-preflight.mjs'),
    read('scripts/root-email-m6-delivery-probe.ts'),
    read('docs/ROOT_DOMAIN_EMAIL_M6_REHEARSAL.md'),
  ])

  assert.match(webhook, /export const maxDuration = 60/)
  assert.match(recovery, /export const maxDuration = 60/)

  const vercelConfig = JSON.parse(vercel)
  const recoveryCron = vercelConfig.crons.find(
    (entry) => entry.path === '/api/internal/email/inbound/process'
  )
  assert.deepEqual(recoveryCron, {
    path: '/api/internal/email/inbound/process',
    schedule: '30 0 * * *',
  })

  assert.match(preflight, /Root MX remains on Webmail/)
  assert.match(preflight, /mail\.ymistory\.com/)
  assert.match(preflight, /endsWith\('\.resend\.app'\)/)
  assert.match(preflight, /webhooks\.length !== 1/)
  assert.match(preflight, /email\.received/)
  assert.match(preflight, /email\.suppressed/)
  assert.match(preflight, /open_tracking === false/)
  assert.match(preflight, /click_tracking === false/)
  assert.match(preflight, /recoveryRoute\.status === 401/)
  assert.doesNotMatch(preflight, /domains\.update|webhooks\.create|webhooks\.update/)

  assert.match(deliveryProbe, /Refusing to send without --confirm/)
  assert.match(deliveryProbe, /delivered.*bounced.*complained.*suppressed/s)
  assert.match(deliveryProbe, /SUPPORT_INBOUND_DOMAIN must be the M6 managed/)
  assert.doesNotMatch(deliveryProbe, /example\.com|test\.com/)

  assert.match(runbook, /does not enable[\s\S]*Receiving on `ymistory\.com`/)
  assert.match(runbook, /Root MX after rehearsal[\s\S]*Still `5 mail\.ymistory\.com`/)
  assert.match(runbook, /M6 does not modify root DNS/)
})
