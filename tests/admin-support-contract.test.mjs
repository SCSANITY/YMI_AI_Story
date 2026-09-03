import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const templates = path.resolve(root, 'tests', 'fixtures', 'external-contracts', 'sql')

async function read(relativePath, base = root) {
  return readFile(path.join(base, relativePath), 'utf8')
}

test('Support Admin remains a protected, independently scrolling conversation workspace', async () => {
  const [navigation, page, inbox, queue, conversation, context] = await Promise.all([
    read('components/admin/adminNavigation.ts'),
    read('app/admin/(protected)/support/page.tsx'),
    read('components/admin/sections/support/SupportInbox.tsx'),
    read('components/admin/sections/support/SupportTicketQueue.tsx'),
    read('components/admin/sections/support/SupportConversation.tsx'),
    read('components/admin/sections/support/SupportCustomerContext.tsx'),
  ])

  assert.match(navigation, /Support Inbox/)
  assert.match(navigation, /\/admin\/support/)
  assert.match(page, /xl:h-full/)
  assert.match(page, /AdminPage/)
  assert.match(page, /AdminPageHeader/)
  assert.doesNotMatch(page, /h-dvh|h-screen|calc\(100(?:d)?vh/)
  assert.match(inbox, /POLL_INTERVAL_MS = 15_000/)
  assert.match(inbox, /listIntentRef/)
  assert.match(inbox, /detailIntentRef/)
  assert.match(inbox, /admin-v2-comm-workspace/)
  assert.match(queue, /admin-v2-comm-queue/)
  assert.match(conversation, /admin-v2-comm-canvas/)
  assert.match(context, /admin-v2-comm-context/)
  assert.match(queue, /flex-1 overflow-y-auto overscroll-contain/)
  assert.match(conversation, /overflow-y-auto overscroll-contain/)
  assert.match(conversation, /const \[draft, setDraft\]/)
  assert.match(conversation, /Reply directly|Replies continue by email/)
  assert.match(context, /Recent orders/)
  assert.doesNotMatch(context, /fetch\(|onClick=|<button/)
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
  const [webhook, processor, routing, mailboxes, recovery, inbound, ticket, email, emailEvents, rootSql, directSql] = await Promise.all([
    read('app/api/webhooks/resend/route.ts'),
    read('src/lib/inbound-email-processing.ts'),
    read('src/lib/inbound-email-routing.ts'),
    read('src/lib/general-inbox-mailboxes.ts'),
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
  assert.match(mailboxes, /postmaster/)
  assert.match(mailboxes, /abuse/)
  assert.doesNotMatch(mailboxes, /['"]dmarc['"]|['"]noreply['"]|['"]no-reply['"]/)
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
  const [sql, processor, mailboxApi, threadsApi, threadApi, draftApi, legacyReplyApi, page, workspace, navigation] = await Promise.all([
    read('sql_root_email_general_inbox.sql', templates),
    read('src/lib/inbound-email-processing.ts'),
    read('app/api/admin/mail/mailboxes/route.ts'),
    read('app/api/admin/mail/threads/route.ts'),
    read('app/api/admin/mail/threads/[threadId]/route.ts'),
    read('app/api/admin/mail/drafts/[messageId]/route.ts'),
    read('app/api/admin/inbox/messages/[inboundEmailId]/replies/route.ts'),
    read('app/admin/(protected)/inbox/page.tsx'),
    read('components/admin/sections/inbox/GeneralInbox.tsx'),
    read('components/admin/adminNavigation.ts'),
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

  for (const api of [mailboxApi, threadsApi, threadApi, draftApi, legacyReplyApi]) {
    assert.match(api, /requireAdminCustomer/)
    assert.match(api, /Cache-Control['"]:\s*['"]no-store/)
  }
  assert.match(mailboxApi, /loadGeneralMailMailboxCounts/)
  assert.match(threadsApi, /loadGeneralMailThreadSummaries/)
  assert.match(threadApi, /loadGeneralMailThreadDetail/)
  assert.match(legacyReplyApi, /status:\s*410/)
  assert.doesNotMatch(legacyReplyApi, /sendGeneralInboxReplyEmail|projectGeneralMailLegacyReply/)
  assert.match(page, /GeneralInbox/)
  assert.match(page, /AdminPage/)
  assert.match(page, /AdminPageHeader/)
  assert.doesNotMatch(page, /h-dvh|h-screen|calc\(100(?:d)?vh/)
  assert.match(workspace, /GENERAL_MAILBOX_DEFINITIONS/)
  assert.match(workspace, /Mailboxes/)
  assert.match(workspace, /GeneralMailComposer/)
  assert.match(workspace, /admin-v2-comm-workspace/)
  assert.match(workspace, /admin-v2-comm-queue/)
  assert.match(workspace, /admin-v2-comm-canvas/)
  assert.match(navigation, /General Inbox/)
})

test('General Inbox workspace SQL is additive, private, and rerun-convergent', async () => {
  const sql = await read('sql_general_inbox_mail_workspace.sql', templates)

  assert.match(sql, /create table if not exists public\.general_mail_threads/)
  assert.match(sql, /create table if not exists public\.general_mail_messages/)
  assert.match(sql, /create table if not exists public\.general_mail_attachments/)
  assert.match(sql, /mailbox_key in \(['"]admin['"], ['"]hello['"], ['"]security['"], ['"]orders['"], ['"]delivery['"]\)/)
  assert.match(sql, /source_inbound_email_id uuid[\s\S]*references public\.inbound_email_envelopes/)
  assert.match(sql, /source_reply_id uuid[\s\S]*references public\.inbound_email_replies/)
  assert.match(sql, /source_inbound_attachment_id uuid[\s\S]*references public\.inbound_email_attachments/)
  assert.match(sql, /general_mail_messages_provider_key/)
  assert.match(sql, /general_mail_messages_internet_message_id_idx/)
  assert.match(sql, /general_mail_messages_outbound_internet_message_id_key/)
  assert.match(sql, /message_state in \([\s\S]*['"]draft['"][\s\S]*['"]delivery_delayed['"][\s\S]*['"]received['"]/)
  assert.match(sql, /general_mail_threads_folder_idx/)
  assert.match(sql, /general_mail_threads_unread_idx/)
  assert.match(sql, /bcc_addresses text\[\]/)
  assert.match(sql, /Never expose in thread readers or derive Reply\/Reply-All recipients/)
  assert.match(sql, /general_mail_messages_inbound_plaintext_only_check/)
  assert.match(sql, /direction = ['"]outbound['"] or body_html is null/)

  assert.match(sql, /insert into public\.general_mail_threads/)
  assert.match(sql, /insert into public\.general_mail_messages/)
  assert.match(sql, /insert into public\.general_mail_attachments/)
  assert.match(sql, /on conflict do nothing/g)
  assert.match(sql, /is distinct from rollup\.latest_message_at/)
  assert.doesNotMatch(sql, /delete\s+from\s+public\.inbound_email_/i)
  assert.doesNotMatch(sql, /update\s+public\.inbound_email_/i)
  assert.doesNotMatch(sql, /create\s+(?:temporary|temp)\s+table/i)
  assert.doesNotMatch(sql, /^\s*(?:begin|commit)\s*;/im)

  for (const table of ['general_mail_threads', 'general_mail_messages', 'general_mail_attachments']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`))
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`))
    assert.match(sql, new RegExp(`grant select, insert, update, delete on table public\\.${table} to service_role`))
  }
})

test('General mail S3 threads only by mailbox RFC headers and keeps send state server-owned', async () => {
  const [sql, processor, mailServer, mailPolicy, email, webhookEvents, legacyReply, ...adminApis] =
    await Promise.all([
      read('sql_general_inbox_standard_mail_backend.sql', templates),
      read('src/lib/inbound-email-processing.ts'),
      read('src/lib/general-mail-server.ts'),
      read('src/lib/general-mail.ts'),
      read('src/lib/email.tsx'),
      read('src/lib/resend-webhook-events.ts'),
      read('app/api/admin/inbox/messages/[inboundEmailId]/replies/route.ts'),
      read('app/api/admin/mail/drafts/route.ts'),
      read('app/api/admin/mail/drafts/[messageId]/route.ts'),
      read('app/api/admin/mail/drafts/[messageId]/send/route.ts'),
      read('app/api/admin/mail/threads/[threadId]/reply/route.ts'),
    ])

  assert.doesNotMatch(sql, /create\s+(?:temporary|temp)\s+table/i)
  assert.doesNotMatch(sql, /^\s*(?:begin|commit)\s*;/im)
  assert.match(sql, /create or replace function public\.project_general_mail_inbound/)
  assert.match(sql, /thread\.mailbox_key = v_mailbox_key/)
  assert.match(sql, /having count\(distinct message\.thread_id\) = 1/)
  assert.match(sql, /if v_thread_id is not null then\s+return v_thread_id;/)
  assert.match(sql, /create or replace function public\.project_general_mail_legacy_reply/)
  assert.match(sql, /create or replace function public\.claim_general_mail_send/)
  assert.match(sql, /create or replace function public\.reconcile_general_mail_delivery_event/)
  assert.match(sql, /grant execute on function public\.project_general_mail_inbound/)
  assert.match(sql, /grant execute on function public\.project_general_mail_legacy_reply/)
  assert.match(sql, /from public, anon, authenticated/)

  assert.match(
    processor,
    /processInboundEmailAttachments\(envelope, resend\)[\s\S]*projectGeneralMailInbound\([\s\S]*finishEnvelope\(envelope, null\)/
  )
  assert.match(mailServer, /sendGeneralMailboxMessage/)
  assert.match(mailServer, /p_expected_updated_at/)
  assert.doesNotMatch(mailServer, /project_general_mail_legacy_reply/)
  assert.match(mailPolicy, /buildGeneralMailReferenceCandidates/)
  assert.match(mailPolicy, /buildGeneralMailReplyEnvelope/)
  assert.doesNotMatch(mailPolicy, /source\.bcc|bccAddresses/)
  assert.match(email, /resend\.emails\.get\(providerMessageId\)/)
  assert.match(email, /general_mail_message:/)
  assert.match(webhookEvents, /email_key === ['"]general_mail_message['"]/)
  assert.doesNotMatch(webhookEvents, /email_key === ['"]general_inbox_reply['"]/)
  assert.match(legacyReply, /status:\s*410/)
  assert.doesNotMatch(legacyReply, /projectGeneralMailLegacyReply|sendGeneralInboxReplyEmail/)

  for (const api of adminApis) {
    assert.match(api, /requireAdminCustomer/)
    assert.match(api, /Cache-Control['"]:\s*['"]no-store/)
    assert.doesNotMatch(api, /body\?\.(from|fromAddress|replyTo|sender)/)
  }
})

test('General mail S5 exposes one mailbox workspace writer without leaking BCC or inbound HTML', async () => {
  const [server, workspace, composer, richText, legacyReply, mailboxApi, threadsApi, threadApi, draftApi] =
    await Promise.all([
      read('src/lib/general-mail-server.ts'),
      read('components/admin/sections/inbox/GeneralInbox.tsx'),
      read('components/admin/sections/inbox/GeneralMailComposer.tsx'),
      read('components/admin/sections/inbox/GeneralMailRichText.tsx'),
      read('app/api/admin/inbox/messages/[inboundEmailId]/replies/route.ts'),
      read('app/api/admin/mail/mailboxes/route.ts'),
      read('app/api/admin/mail/threads/route.ts'),
      read('app/api/admin/mail/threads/[threadId]/route.ts'),
      read('app/api/admin/mail/drafts/[messageId]/route.ts'),
    ])

  const readerFields = server.match(/const READER_MESSAGE_FIELDS\s*=\s*\n?\s*['"]([^'"]+)['"]/)?.[1] ?? ''
  assert.doesNotMatch(readerFields, /bcc_addresses|body_html|reply_to_addresses/)
  assert.match(server, /message\.direction === ['"]outbound['"] && message\.body_document/)
  assert.match(workspace, /Separate conversation/)
  assert.match(workspace, /mode: ['"]reply['"]/)
  assert.match(workspace, /mode: ['"]reply_all['"]/)
  assert.match(workspace, /mode: ['"]forward['"]/)
  assert.match(composer, /const allowBcc = !existingDraft\?\.in_reply_to && \(mode === ['"]new['"] \|\| mode === ['"]forward['"]\)/)
  assert.match(composer, /bcc:\s*allowBcc \? parseAddresses\(bccValue\) : \[\]/)
  assert.match(composer, /spec\.messageUpdatedAt/)
  assert.doesNotMatch(composer, /AdminFloatingDialog/)
  assert.match(workspace, /composer \? <GeneralMailComposer/)
  assert.match(composer, /type="file"\s+multiple/)
  assert.match(composer, /onDrop=\{\(event\) =>/)
  assert.match(composer, /handleUploads\(Array\.from\(event\.dataTransfer\.files\)\)/)
  assert.match(composer, /Attach files/)
  assert.match(composer, /ACCEPTED_ATTACHMENT_TYPES/)
  assert.match(composer, /MAX_ATTACHMENTS = 10/)
  assert.match(composer, /MAX_TOTAL_ATTACHMENT_BYTES = 25 \* 1024 \* 1024/)
  assert.match(richText, /from ['"]@tiptap\/react['"]/)
  assert.match(richText, /immediatelyRender:\s*false/)
  assert.match(richText, /listItem:\s*false/)
  assert.match(richText, /content:\s*['"]paragraph\+['"]/)
  assert.match(richText, /Tab:\s*\(\) => true/)
  assert.doesNotMatch(richText, /sinkListItem/)
  for (const command of ['toggleBold', 'toggleItalic', 'toggleUnderline', 'toggleHeading', 'toggleBlockquote', 'toggleBulletList', 'toggleOrderedList']) {
    assert.match(richText, new RegExp(`\\.${command}\\(`))
  }
  assert.doesNotMatch(richText, /execCommand/)
  assert.doesNotMatch(richText, /window\.prompt/)
  assert.doesNotMatch(richText, /dangerouslySetInnerHTML/)
  assert.match(legacyReply, /status:\s*410/)
  assert.doesNotMatch(legacyReply + server, /projectGeneralMailLegacyReply/)

  for (const api of [mailboxApi, threadsApi, threadApi, draftApi]) {
    assert.match(api, /requireAdminCustomer/)
    assert.match(api, /Cache-Control['"]:\s*['"]no-store/)
  }
})

test('General mail S6 enforces threaded BCC and paginates complete mailbox projections', async () => {
  const [sql, server, mailApi, threadsApi, workspace] = await Promise.all([
    read('sql_general_inbox_s6_hardening.sql', templates),
    read('src/lib/general-mail-server.ts'),
    read('src/lib/general-mail-api.ts'),
    read('app/api/admin/mail/threads/route.ts'),
    read('components/admin/sections/inbox/GeneralInbox.tsx'),
  ])

  assert.doesNotMatch(sql, /create\s+(?:temporary|temp)\s+table/i)
  assert.doesNotMatch(sql, /^\s*(?:begin|commit)\s*;/im)
  assert.match(sql, /general_mail_messages_threaded_bcc_check/)
  assert.match(sql, /in_reply_to is null or cardinality\(bcc_addresses\) = 0/)
  assert.match(sql, /create or replace function public\.get_general_mail_mailbox_counts/)
  assert.match(sql, /count\(distinct message\.thread_id\) filter/)
  assert.match(sql, /create or replace function public\.list_general_mail_thread_summaries/)
  assert.match(sql, /count\(\*\) over \(\)::bigint as total_count/)
  assert.match(sql, /limit p_limit\s+offset p_offset/)
  assert.match(sql, /grant execute on function public\.get_general_mail_mailbox_counts\(\) to service_role/)
  assert.match(sql, /grant execute on function public\.list_general_mail_thread_summaries/)

  assert.match(server, /rpc\(['"]get_general_mail_mailbox_counts['"]\)/)
  assert.match(server, /rpc\(['"]list_general_mail_thread_summaries['"]/)
  assert.doesNotMatch(server, /\.limit\(5000\)|\.limit\(1000\)/)
  assert.match(server, /existing\.in_reply_to && params\.draft\.bcc\.length > 0/)
  assert.match(server, /general_mail_bcc_not_allowed_on_reply/)
  assert.match(mailApi, /detail\.includes\(['"]not_allowed['"]\)/)
  assert.match(threadsApi, /search\.length > 100/)
  assert.match(threadsApi, /search,\s*\n\s*limit,\s*\n\s*offset/)
  assert.match(workspace, /useDeferredValue/)
  assert.match(workspace, /limit:\s*String\(THREAD_PAGE_SIZE\)/)
  assert.match(workspace, /replace\s*\?\s*next/)
  assert.match(workspace, /mergeGeneralMailThreadRefresh\(current, next\)/)
  assert.match(workspace, /loadThreads\(false, false, true\)/)
  assert.match(workspace, /loadThreads\(true\)/)
  assert.doesNotMatch(workspace, /loadThreads\(true, false, true\)/)
  assert.match(workspace, /Load more/)
  assert.match(workspace, /threads\.length} of \{totalThreads/)
  const draftApi = await read('app/api/admin/mail/drafts/[messageId]/route.ts')
  assert.match(draftApi, /bcc_addresses:\s*message\.in_reply_to \? \[\] : message\.bcc_addresses/)
})

test('General mail S4 keeps rich text server-generated and attachments private and bounded', async () => {
  const [sql, content, attachments, attachmentServer, server, email, replyApi, uploadApi, attachmentApi, downloadApi, cleanupApi, vercel] =
    await Promise.all([
      read('sql_general_inbox_outbound_content.sql', templates),
      read('src/lib/general-mail-content.ts'),
      read('src/lib/general-mail-attachments.ts'),
      read('src/lib/general-mail-attachment-server.ts'),
      read('src/lib/general-mail-server.ts'),
      read('src/lib/email.tsx'),
      read('app/api/admin/mail/threads/[threadId]/reply/route.ts'),
      read('app/api/admin/mail/drafts/[messageId]/attachments/upload-url/route.ts'),
      read('app/api/admin/mail/drafts/[messageId]/attachments/[attachmentId]/route.ts'),
      read('app/api/admin/mail/attachments/[attachmentId]/download/route.ts'),
      read('app/api/internal/email/general-mail/cleanup/route.ts'),
      read('vercel.json'),
    ])

  assert.doesNotMatch(sql, /create\s+(?:temporary|temp)\s+table/i)
  assert.doesNotMatch(sql, /^\s*(?:begin|commit)\s*;/im)
  assert.match(sql, /add column if not exists body_document jsonb/)
  assert.match(sql, /direction = 'outbound'/)
  assert.match(sql, /general-mail-private/)
  assert.match(sql, /public = false/)
  assert.match(sql, /create table if not exists public\.general_mail_storage_cleanup_queue/)
  assert.match(sql, /reason, next_attempt_at/)
  assert.match(sql, /general_mail_storage_cleanup_queue[\s\S]*enable row level security/)
  assert.match(sql, /insert into public\.general_mail_storage_cleanup_queue[\s\S]*draft_deleted/)
  assert.match(sql, /create_general_mail_rich_draft/)
  assert.match(sql, /update_general_mail_rich_draft/)
  assert.match(sql, /attachment_state not in \('stored', 'attached'\)/)
  assert.match(sql, /claim_general_mail_attachment_cleanup/)
  assert.match(sql, /message\.updated_at < p_cutoff/)
  assert.match(sql, /grant execute on function public\.create_general_mail_attachment_upload/)

  assert.match(content, /BLOCK_TYPES/)
  assert.match(content, /MARK_TYPES/)
  assert.match(content, /noopener noreferrer nofollow/)
  assert.match(content, /escapeHtml/)
  assert.doesNotMatch(content, /dangerouslySetInnerHTML|sanitize-html|DOMPurify/)
  assert.match(attachments, /MAX_GENERAL_MAIL_ATTACHMENTS = 10/)
  assert.match(attachments, /MAX_GENERAL_MAIL_TOTAL_ATTACHMENT_BYTES = 25 \* 1024 \* 1024/)
  assert.match(attachments, /attachmentBytesMatchContentType/)
  assert.match(attachments, /checksum mismatch/)
  assert.match(attachmentServer, /createSignedUploadUrl/)
  assert.match(attachmentServer, /upsert:\s*false/)
  assert.match(server, /create_general_mail_rich_draft/)
  assert.match(server, /loadGeneralMailOutboundAttachments/)
  assert.match(server, /content:\s*NormalizedGeneralMailContent/)
  assert.match(server, /createGeneralMailReplyDraft/)
  assert.match(email, /attachments:\s*params\.attachments/)
  assert.match(replyApi, /bodyDocument/)
  assert.match(replyApi, /saveDraft === true/)
  assert.doesNotMatch(replyApi, /body\?\.bcc/)

  for (const api of [uploadApi, attachmentApi, downloadApi]) {
    assert.match(api, /requireAdminCustomer/)
    assert.match(api, /Cache-Control/)
  }
  assert.match(uploadApi, /registerGeneralMailAttachmentUpload/)
  assert.match(attachmentApi, /confirmGeneralMailAttachmentUpload/)
  assert.match(downloadApi, /application\/octet-stream/)
  assert.match(downloadApi, /X-Content-Type-Options/)
  assert.doesNotMatch(downloadApi, /createSignedUrl|signedUrl/)
  assert.match(cleanupApi, /CRON_SECRET/)
  assert.match(cleanupApi, /processAbandonedGeneralMailAttachments/)
  const config = JSON.parse(vercel)
  assert.ok(config.crons.some((entry) => entry.path === '/api/internal/email/general-mail/cleanup'))
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
  assert.match(downloadApi, /kol_collaboration_messages/)
  assert.match(downloadApi, /association_state !== ['"]confirmed['"]/)
  assert.match(downloadApi, /Confirm this partnership sender before downloading attachments/)
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

test('root-domain inbound processing has bounded handlers and scheduled recovery', async () => {
  const [webhook, recovery, vercel] = await Promise.all([
    read('app/api/webhooks/resend/route.ts'),
    read('app/api/internal/email/inbound/process/route.ts'),
    read('vercel.json'),
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
})
