import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const readTemplateSql = (path) =>
  readFile(new URL(`./fixtures/external-contracts/sql/${path}`, import.meta.url), 'utf8')

test('S3 stores two independent source decisions and immutable actor-attributed history', async () => {
  const sql = await readTemplateSql('sql_signature_voice_admin_surface.sql')

  assert.doesNotMatch(sql, /^\s*begin\s*;/im)
  assert.doesNotMatch(sql, /create\s+(?:temporary|temp)\s+table/i)
  assert.match(sql, /create table if not exists public\.signature_voice_production_states/)
  assert.match(sql, /technical_status text not null default 'pending'/)
  assert.match(sql, /adult_declaration_status text not null default 'pending'/)
  assert.match(sql, /signature_voice_technical_rejection_reason_required/)
  assert.match(sql, /signature_voice_adult_rejection_reason_required/)
  assert.match(sql, /p_expected_updated_at[\s\S]*signature_voice_triage_changed[\s\S]*errcode = '40001'/)
  assert.match(sql, /event_type in \([\s\S]*'source_accessed'[\s\S]*'source_replaced'/)
  assert.match(sql, /before update or delete on public\.signature_voice_audit_events/)
  assert.match(sql, /signature_voice_audit_is_immutable/)
  assert.match(sql, /revoke all on table public\.signature_voice_audit_events from public, anon, authenticated/)
})

test('S3 triage and source access require an exact paid Signature Voice order item', async () => {
  const sql = await readTemplateSql('sql_signature_voice_admin_surface.sql')
  const triage = sql.match(/create or replace function public\.set_signature_voice_source_triage[\s\S]*?\n\$\$;/)?.[0] ?? ''
  const access = sql.match(/create or replace function public\.record_signature_voice_source_access[\s\S]*?\n\$\$;/)?.[0] ?? ''

  for (const fn of [triage, access]) {
    assert.match(fn, /purchase_order\.payment_id is not null/)
    assert.match(fn, /item\.cart_item_id = p_cart_item_id/)
    assert.match(fn, /item\.status::text = 'ordered'/)
    assert.match(fn, /lower\(coalesce\(item\.package_type::text, ''\)\) = 'supreme'/)
    assert.match(fn, /creation\.creation_id = p_creation_id/)
  }
  assert.match(access, /creation\.voice_asset_id = p_asset_id/)
  assert.match(access, /actor_customer_id[\s\S]*p_admin_customer_id[\s\S]*'source_accessed'/)
})

test('S3 replacement re-verifies private bytes and atomically resets source triage', async () => {
  const [sql, uploadRoute, confirmRoute, sourceRoute] = await Promise.all([
    readTemplateSql('sql_signature_voice_admin_surface.sql'),
    read('app/api/admin/orders/[orderId]/signature-voice/[creationId]/replacement/upload-url/route.ts'),
    read('app/api/admin/orders/[orderId]/signature-voice/[creationId]/replacement/confirm/route.ts'),
    read('app/api/admin/orders/[orderId]/signature-voice/[creationId]/source/route.ts'),
  ])
  const replace = sql.match(/create or replace function public\.replace_signature_voice_source[\s\S]*?\n\$\$;/)?.[0] ?? ''

  assert.match(uploadRoute, /requireAdminCustomer\(\)/)
  assert.match(uploadRoute, /requireAdminSignatureVoiceOrderItem/)
  assert.match(uploadRoute, /createSignedUploadUrl\(storagePath, \{ upsert: false \}\)/)
  assert.match(uploadRoute, /signature_voice_replacement_uploads/)
  assert.match(confirmRoute, /requireAdminCustomer\(\)/)
  assert.match(confirmRoute, /\.from\('raw-private'\)[\s\S]*\.download\(input\.storagePath\)/)
  assert.match(confirmRoute, /parseBuffer\(bytes/)
  assert.match(confirmRoute, /assertSignatureVoiceAudioContainer/)
  assert.match(confirmRoute, /bytes\.length !== verified\.sizeBytes/)
  assert.match(confirmRoute, /createHash\('sha256'\)/)
  assert.match(confirmRoute, /duration < SIGNATURE_VOICE_MIN_SAMPLE_SECONDS[\s\S]*duration > SIGNATURE_VOICE_MAX_SAMPLE_SECONDS/)
  assert.match(confirmRoute, /reconcileReplacementResult[\s\S]*status === 'committed'[\s\S]*status === 'unknown'[\s\S]*discardReplacementUpload/)
  const discard = confirmRoute.match(/async function discardReplacementUpload[\s\S]*?\n}/)?.[0] ?? ''
  assert.match(discard, /\.from\('creations'\)[\s\S]*\.eq\('voice_asset_id', assetId\)[\s\S]*bindingError \|\| binding[\s\S]*return[\s\S]*\.remove\(\[storagePath\]\)/)

  assert.match(replace, /for update of creation/)
  assert.match(replace, /v_creation\.voice_asset_id is distinct from p_expected_asset_id[\s\S]*errcode = '40001'/)
  assert.match(replace, /insert into public\.user_assets[\s\S]*update public\.creations[\s\S]*voice_asset_id = p_new_asset_id/)
  assert.match(replace, /technical_status = 'pending'[\s\S]*adult_declaration_status = 'pending'/)
  assert.match(replace, /'source_replaced'[\s\S]*'old_asset_id'[\s\S]*'new_asset_id'/)
  assert.match(replace, /v_now \+ interval '30 days'/)
  assert.match(replace, /select exists \([\s\S]*other_creation\.voice_asset_id = v_old_asset\.asset_id/)

  assert.match(sourceRoute, /requireAdminCustomer\(\)/)
  assert.match(sourceRoute, /record_signature_voice_source_access/)
  assert.match(sourceRoute, /\.from\(access\.out_bucket_name\)[\s\S]*\.download\(access\.out_storage_path\)/)
  assert.match(sourceRoute, /'Cache-Control': 'private, no-store, max-age=0'/)
  assert.doesNotMatch(sourceRoute, /createSignedUrl|createSignedUrls|signed_url|signedUrl/)
})

test('S3 abandoned replacement uploads enter the durable cleanup outbox before staging deletion', async () => {
  const [sql, cleanupServer] = await Promise.all([
    readTemplateSql('sql_signature_voice_admin_surface.sql'),
    read('src/lib/user-asset-cleanup-server.ts'),
  ])
  const cleanup = sql.match(/create or replace function public\.enqueue_expired_signature_voice_replacement_uploads[\s\S]*?\n\$\$;/)?.[0] ?? ''

  assert.match(cleanup, /upload\.expires_at <= p_cutoff/)
  assert.match(cleanup, /insert into public\.user_asset_cleanup_outbox[\s\S]*delete from public\.signature_voice_replacement_uploads/)
  assert.match(cleanup, /v_enqueued <> v_removed[\s\S]*signature_voice_replacement_cleanup_count_mismatch/)
  assert.match(cleanupServer, /enqueue_expired_signature_voice_replacement_uploads/)
  assert.match(cleanupServer, /claim_user_asset_cleanup/)
})

test('S3 Admin UI is order-scoped and exposes dedicated audio controls without mail inference', async () => {
  const [ordersRoute, card, workspace, server] = await Promise.all([
    read('app/api/admin/orders/route.ts'),
    read('components/admin/sections/orders/OrderManagementCard.tsx'),
    read('components/admin/sections/orders/SignatureVoiceWorkspace.tsx'),
    read('src/lib/signature-voice-admin-server.ts'),
  ])

  assert.match(ordersRoute, /signature_voice_item_count:\s*order\.payment_id[\s\S]*item\.package_type === 'supreme'/)
  assert.match(card, /savedOrder\.signature_voice_item_count > 0/)
  assert.match(card, /<SignatureVoiceWorkspace[\s\S]*orderId=\{savedOrder\.order_id\}/)
  assert.match(workspace, /Technical usability/)
  assert.match(workspace, /Authorization review/)
  assert.match(workspace, /Authorization \{item\.triage\.adultDeclarationStatus\}/)
  assert.doesNotMatch(workspace, /Adult declaration check|Adult check/)
  assert.match(workspace, /Replace source recording/)
  assert.match(workspace, /onDrop=/)
  assert.match(workspace, /uploadToSignedUrl/)
  assert.match(workspace, /item\.source\.playbackUrl/)
  assert.match(server, /\.eq\('order_id', orderId\)[\s\S]*\.eq\('status', 'ordered'\)[\s\S]*\.eq\('package_type', 'supreme'\)/)
  assert.match(server, /normalizedItems\.length !== signatureItems\.length[\s\S]*missing its authoritative source binding/)

  for (const source of [workspace, server]) {
    assert.doesNotMatch(source, /subject.*match|sender.*match|from_email|fromEmail/i)
  }
})

test('S4 archives exactly fifteen logical narration slots without visual page coupling', async () => {
  const [sql, adminLib, server] = await Promise.all([
    readTemplateSql('sql_signature_voice_narration_archive.sql'),
    read('src/lib/signature-voice-admin.ts'),
    read('src/lib/signature-voice-admin-server.ts'),
  ])

  assert.doesNotMatch(sql, /^\s*begin\s*;/im)
  assert.doesNotMatch(sql, /create\s+(?:temporary|temp)\s+table/i)
  assert.doesNotMatch(sql, /page_index/)
  assert.match(sql, /create table if not exists public\.signature_voice_narration_tracks/)
  assert.match(sql, /create table if not exists public\.signature_voice_narration_uploads/)
  assert.match(sql, /\^narration_\(0\[1-9\]\|1\[0-5\]\)\$/)
  assert.match(sql, /drop constraint if exists signature_voice_audit_events_event_type_check/)
  assert.doesNotMatch(sql, /pg_get_constraintdef|drop constraint %I/)
  assert.match(adminLib, /SIGNATURE_VOICE_NARRATION_SLOTS = Array\.from\([\s\S]*length: 15/)
  assert.match(server, /SIGNATURE_VOICE_NARRATION_SLOTS\.map\(\(slotKey, index\)/)
  assert.doesNotMatch(server, /final_job_pages|page_index/)
})

test('S4 confirmation is byte-verified and atomically replaces one slot through the durable outbox', async () => {
  const [sql, confirmRoute] = await Promise.all([
    readTemplateSql('sql_signature_voice_narration_archive.sql'),
    read('app/api/admin/orders/[orderId]/signature-voice/[creationId]/narration/[slotKey]/confirm/route.ts'),
  ])
  const commit = sql.match(/create or replace function public\.commit_signature_voice_narration_track[\s\S]*?\n\$\$;/)?.[0] ?? ''

  assert.match(confirmRoute, /requireAdminCustomer\(\)/)
  assert.match(confirmRoute, /\.from\('raw-private'\)[\s\S]*\.info\(input\.storagePath\)/)
  assert.match(confirmRoute, /\.from\('raw-private'\)[\s\S]*\.download\(input\.storagePath\)/)
  assert.match(confirmRoute, /bytes\.length !== verified\.sizeBytes \|\| bytes\.length === 0/)
  assert.match(confirmRoute, /parseBuffer\(bytes/)
  assert.match(confirmRoute, /assertSignatureVoiceAudioContainer/)
  assert.match(confirmRoute, /createHash\('sha256'\)/)
  assert.match(confirmRoute, /SIGNATURE_VOICE_NARRATION_MIN_SECONDS[\s\S]*SIGNATURE_VOICE_NARRATION_MAX_SECONDS/)
  assert.match(confirmRoute, /status === 'committed'[\s\S]*status === 'unknown'[\s\S]*discardNarrationUpload/)
  const discard = confirmRoute.match(/async function discardNarrationUpload[\s\S]*?\n}/)?.[0] ?? ''
  assert.match(discard, /signature_voice_narration_tracks[\s\S]*\.eq\('asset_id', assetId\)[\s\S]*bindingError \|\| binding[\s\S]*return[\s\S]*\.remove\(\[storagePath\]\)/)

  assert.match(commit, /purchase_order\.payment_id is not null/)
  assert.match(commit, /item\.status::text = 'ordered'/)
  assert.match(commit, /lower\(coalesce\(item\.package_type::text, ''\)\) = 'supreme'/)
  assert.match(commit, /creation\.voice_asset_id is distinct from p_source_asset_id[\s\S]*errcode = '40001'/)
  assert.match(commit, /p_expected_track_asset_id[\s\S]*signature_voice_narration_track_changed[\s\S]*errcode = '40001'/)
  assert.match(commit, /insert into public\.user_asset_cleanup_outbox[\s\S]*insert into public\.signature_voice_narration_tracks/)
  assert.match(commit, /size_bytes[\s\S]*duration_seconds[\s\S]*sha256[\s\S]*verified_by[\s\S]*verified_at/)
})

test('S4 private narration access rechecks archive integrity and never returns a signed URL', async () => {
  const [sql, sourceRoute] = await Promise.all([
    readTemplateSql('sql_signature_voice_narration_archive.sql'),
    read('app/api/admin/orders/[orderId]/signature-voice/[creationId]/narration/[slotKey]/source/route.ts'),
  ])
  const access = sql.match(/create or replace function public\.record_signature_voice_narration_access[\s\S]*?\n\$\$;/)?.[0] ?? ''

  assert.match(access, /purchase_order\.payment_id is not null/)
  assert.match(access, /track\.slot_key = p_slot_key/)
  assert.match(access, /track\.source_asset_id = p_source_asset_id/)
  assert.match(access, /track\.asset_id = p_track_asset_id/)
  assert.match(access, /'narration_accessed'/)
  assert.match(sourceRoute, /requireAdminCustomer\(\)/)
  assert.match(sourceRoute, /record_signature_voice_narration_access/)
  assert.match(sourceRoute, /bytes\.byteLength !== Number\(access\.out_size_bytes\)/)
  assert.match(sourceRoute, /actualSha256 !== access\.out_sha256/)
  assert.match(sourceRoute, /'Cache-Control': 'private, no-store, max-age=0'/)
  assert.doesNotMatch(sourceRoute, /createSignedUrl|createSignedUrls|signed_url|signedUrl/)
})

test('S4 invalidates old-source narration and cleans abandoned staging through the durable outbox', async () => {
  const [sql, cleanupServer, workspace] = await Promise.all([
    readTemplateSql('sql_signature_voice_narration_archive.sql'),
    read('src/lib/user-asset-cleanup-server.ts'),
    read('components/admin/sections/orders/SignatureVoiceWorkspace.tsx'),
  ])
  const invalidation = sql.match(/create or replace function public\.invalidate_signature_voice_narration_on_source_change[\s\S]*?\n\$\$;/)?.[0] ?? ''
  const cleanup = sql.match(/create or replace function public\.enqueue_expired_signature_voice_narration_uploads[\s\S]*?\n\$\$;/)?.[0] ?? ''

  assert.match(invalidation, /old\.voice_asset_id is not distinct from new\.voice_asset_id/)
  assert.match(invalidation, /insert into public\.user_asset_cleanup_outbox[\s\S]*delete from public\.signature_voice_narration_uploads[\s\S]*delete from public\.signature_voice_narration_tracks/)
  assert.match(sql, /after update of voice_asset_id on public\.creations/)
  assert.match(cleanup, /upload\.upload_status = 'pending'/)
  assert.match(cleanup, /not exists \([\s\S]*signature_voice_narration_tracks/)
  assert.match(cleanup, /insert into public\.user_asset_cleanup_outbox[\s\S]*delete from public\.signature_voice_narration_uploads/)
  assert.match(cleanupServer, /enqueue_expired_signature_voice_narration_uploads/)
  assert.match(workspace, /item\.narration\.map\(\(slot\)/)
  assert.match(workspace, /uploadToSignedUrl/)
  assert.match(workspace, /slot\.track\.playbackUrl/)
})

test('S5 gates Print Release on both source decisions without touching PDF Release', async () => {
  const [sql, printRoute, pdfRoute] = await Promise.all([
    readTemplateSql('sql_signature_voice_fulfillment_gates.sql'),
    read('app/api/admin/final-jobs/[finalJobId]/release-print/route.ts'),
    read('app/api/admin/final-jobs/[finalJobId]/release/route.ts'),
  ])
  const gate = sql.match(/create or replace function public\.enforce_signature_voice_print_triage[\s\S]*?\n\$\$;/)?.[0] ?? ''

  assert.match(gate, /new\.print_status::text <> 'released'/)
  assert.match(gate, /item\.cart_item_id = new\.cart_item_id/)
  assert.match(gate, /item\.order_id = new\.order_id/)
  assert.match(gate, /v_item_creation_id is distinct from new\.creation_id/)
  assert.match(gate, /v_payment_id is null[\s\S]*v_item_status <> 'ordered'/)
  assert.match(gate, /v_package_type <> 'supreme'/)
  assert.match(gate, /technical_status <> 'accepted'[\s\S]*adult_declaration_status <> 'accepted'/)
  assert.match(sql, /before update of print_status, print_released_at on public\.final_jobs/)
  assert.match(printRoute, /signature voice\|triage/i)
  assert.doesNotMatch(pdfRoute, /signature.voice|narration|hardware/i)
  assert.doesNotMatch(sql, /final_job_pages|page_index/)
})

test('S5 verifies all fifteen private narration objects before a Signature Voice shipment', async () => {
  const [sql, fulfillment, logistics] = await Promise.all([
    readTemplateSql('sql_signature_voice_fulfillment_gates.sql'),
    read('src/lib/signature-voice-fulfillment-server.ts'),
    read('app/api/admin/orders/[orderId]/logistics/route.ts'),
  ])
  const shipmentGate = sql.match(/create or replace function public\.enforce_signature_voice_shipment_readiness[\s\S]*?\n\$\$;/)?.[0] ?? ''

  assert.match(fulfillment, /\.eq\('status', 'ordered'\)[\s\S]*\.eq\('package_type', 'supreme'\)/)
  assert.match(fulfillment, /rows\.length !== SIGNATURE_VOICE_NARRATION_SLOTS\.length/)
  assert.match(fulfillment, /Promise\.all\(rows\.map\(async \(row\)/)
  assert.match(fulfillment, /\.from\('raw-private'\)[\s\S]*\.download\(storagePath\)/)
  assert.match(fulfillment, /bytes\.length !== sizeBytes[\s\S]*createHash\('sha256'\)/)
  assert.match(fulfillment, /parseBuffer\(bytes[\s\S]*assertSignatureVoiceAudioContainer/)
  assert.match(fulfillment, /SIGNATURE_VOICE_NARRATION_MIN_SECONDS[\s\S]*SIGNATURE_VOICE_NARRATION_MAX_SECONDS/)

  const stampIndex = logistics.indexOf('stampSignatureVoiceShipmentIntegrity')
  const updateIndex = logistics.indexOf(".from('orders')", stampIndex)
  assert.ok(stampIndex >= 0 && updateIndex > stampIndex, 'shipment bytes must be verified before the order update')
  assert.match(logistics, /nextStatus === 'shipped' \|\| nextStatus === 'delivered'/)
  assert.match(logistics, /previousStatus !== 'shipped'[\s\S]*previousStatus !== 'delivered'/)
  assert.match(logistics, /Signature Voice\|narration\|hardware\|shipment/)

  assert.match(shipmentGate, /for v_item in[\s\S]*package_type::text[\s\S]*= 'supreme'/)
  assert.match(shipmentGate, /new\.order_status::text not in \('shipped', 'delivered'\)/)
  assert.match(shipmentGate, /old\.order_status::text in \('shipped', 'delivered'\)/)
  assert.match(shipmentGate, /perform pg_advisory_xact_lock/)
  assert.match(shipmentGate, /v_track_count <> 15/)
  assert.match(shipmentGate, /technical_status <> 'accepted'[\s\S]*adult_declaration_status <> 'accepted'/)
  assert.match(shipmentGate, /narration_manifest_sha256 is distinct from v_manifest_sha256/)
  assert.match(shipmentGate, /shipment_integrity_checked_at < clock_timestamp\(\) - interval '15 minutes'/)
})

test('S5 hardware attestation is explicit, actor-attributed and invalidated by any track change', async () => {
  const [sql, requestParser, route, workspace, server] = await Promise.all([
    readTemplateSql('sql_signature_voice_fulfillment_gates.sql'),
    read('src/lib/signature-voice-admin.ts'),
    read('app/api/admin/orders/[orderId]/signature-voice/[creationId]/hardware-attestation/route.ts'),
    read('components/admin/sections/orders/SignatureVoiceWorkspace.tsx'),
    read('src/lib/signature-voice-admin-server.ts'),
  ])
  const attest = sql.match(/create or replace function public\.attest_signature_voice_hardware_loaded[\s\S]*?\n\$\$;/)?.[0] ?? ''

  assert.match(requestParser, /parseSignatureVoiceHardwareAttestationRequest[\s\S]*input\.accepted !== true/)
  assert.match(route, /requireAdminCustomer\(\)/)
  assert.match(route, /verifySignatureVoiceItemNarrationIntegrity/)
  assert.match(route, /attest_signature_voice_hardware_loaded/)
  assert.match(attest, /role::text = 'admin'/)
  assert.match(attest, /v_track_count <> 15/)
  assert.match(attest, /technical_status <> 'accepted'[\s\S]*adult_declaration_status <> 'accepted'/)
  assert.match(attest, /'hardware_loaded_attested'/)
  assert.match(sql, /after insert or update or delete on public\.signature_voice_narration_tracks/)
  assert.match(sql, /delete from public\.signature_voice_hardware_attestations/)
  assert.match(workspace, /I confirm all 15 verified narration tracks are loaded/)
  assert.match(workspace, /accepted: true/)
  assert.match(server, /signature_voice_hardware_attestations/)
  assert.match(server, /attestedByName/)
})

test('S5 narration checks reject placeholders and source replacement retains generated audio for rollback', async () => {
  const [s4Sql, s5Sql, adminLib] = await Promise.all([
    readTemplateSql('sql_signature_voice_narration_archive.sql'),
    readTemplateSql('sql_signature_voice_fulfillment_gates.sql'),
    read('src/lib/signature-voice-admin.ts'),
  ])

  assert.match(adminLib, /SIGNATURE_VOICE_NARRATION_MIN_SECONDS = 3/)
  assert.match(s4Sql, /duration_seconds between 3 and 600/)
  assert.match(s4Sql, /p_new_duration_seconds not between 3 and 600/)
  assert.match(s5Sql, /signature_voice_narration_tracks_duration_v2_check[\s\S]*duration_seconds between 3 and 600/)
  assert.match(s5Sql, /v_narration_retention_until timestamptz := now\(\) \+ interval '30 days'/)
  assert.match(s5Sql, /track\.asset_id[\s\S]*v_narration_retention_until/)
  assert.match(s5Sql, /Signature Voice narration is immutable after shipment/i)
  assert.doesNotMatch(s5Sql, /^\s*begin\s*;/im)
  assert.doesNotMatch(s5Sql, /create\s+(?:temporary|temp)\s+table/i)
})
