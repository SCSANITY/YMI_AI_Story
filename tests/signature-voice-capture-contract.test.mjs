import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const readTemplateSql = (path) => readFile(new URL(`../../Template_folder/${path}`, import.meta.url), 'utf8')

test('S7 authorizes child or adult capture before upload and sends only the asset to Preview', async () => {
  const [action, recorder, page, jobsClient, uploadRoute, confirmRoute, cleanupServer, sql, ownerHotfix] = await Promise.all([
    read('components/personalize/GeneratePreviewAction.tsx'),
    read('components/personalize/VoiceRecorderPanel.tsx'),
    read('components/PersonalizePage.tsx'),
    read('src/services/jobs.ts'),
    read('app/api/upload-url/route.ts'),
    read('app/api/user-assets/confirm/route.ts'),
    read('src/lib/user-asset-cleanup-server.ts'),
    readTemplateSql('sql_signature_voice_consent_v2.sql'),
    readTemplateSql('sql_signature_voice_capture_owner_hotfix.sql'),
  ])

  assert.doesNotMatch(action, /Coming Soon|isDisabled\s*=\s*!isFormValid\s*\|\|\s*isSupreme/)
  assert.doesNotMatch(action, /voiceSubjectName|voiceSubjectRelationship|SIGNATURE_VOICE_CONSENT_VERSION/)
  assert.match(recorder, /SIGNATURE_VOICE_CONSENT_VERSION/)
  assert.match(recorder, /'current_child'[\s\S]*'adult'/)
  assert.match(recorder, /if \(!isAuthorizationAccepted\)[\s\S]*authorizationRequired/)
  assert.match(recorder, /voiceAuthorization:[\s\S]*accepted: true[\s\S]*speakerKind/)
  assert.match(recorder, /href="\/privacy"/)
  assert.match(recorder, /addEventListener\('ended', handleEnded\)/)
  assert.match(recorder, /const canSaveRecording =[\s\S]*seconds >= MIN_SECONDS[\s\S]*seconds <= MAX_SECONDS[\s\S]*Boolean\(recordedBlob\)[\s\S]*isAuthorizationAccepted/)
  assert.doesNotMatch(recorder, /playbackCompleted|analyzeVoiceSampleBlob|AudioContext|client_quality/)
  assert.doesNotMatch(page, /signatureVoiceGenerateConsentRef/)
  assert.match(page, /bookType === 'supreme'[\s\S]*!voiceAssetId \|\| !isVoiceReadyForPreview/)

  const requestBody = jobsClient.match(/voice_binding: voiceBinding[\s\S]*?\n\s*: null,/)?.[0] ?? ''
  assert.match(requestBody, /asset_id:/)
  assert.doesNotMatch(requestBody, /consent:|subject_name:|subject_relationship:|accepted_at|duration_seconds|storage_path/)

  const parseAt = uploadRoute.indexOf('parseSignatureVoiceCaptureAuthorization')
  const signedUploadAt = uploadRoute.indexOf('createSignedUploadUrl')
  assert.ok(parseAt >= 0 && signedUploadAt > parseAt, 'authorization must be parsed before upload credentials are issued')
  assert.match(uploadRoute, /reserve_signature_voice_capture_authorization/)
  assert.match(uploadRoute, /p_storage_path: storagePath/)
  assert.match(confirmRoute, /confirm_signature_voice_capture/)
  assert.match(sql, /accepted_at timestamptz not null default clock_timestamp\(\)/)
  assert.match(sql, /reserved_storage_path text not null unique/)
  assert.match(sql, /v_authorization\.reserved_storage_path is distinct from p_storage_path/)
  assert.match(sql, /speaker_kind in \('current_child', 'adult'\)/)
  assert.match(sql, /v_voice_subject_name := nullif\(btrim\(coalesce\(p_text_overrides ->> 'child_name'/)
  assert.match(sql, /v_voice_subject_name := 'Adult narrator'/)
  assert.match(sql, /signature-voice-consent-v1[\s\S]*signature_voice_binding_invalid/)
  assert.match(sql, /create or replace function public\.enqueue_stale_signature_voice_capture_uploads/)
  assert.match(sql, /capture_auth\.confirmed_at is null[\s\S]*capture_auth\.created_at < p_cutoff/)
  assert.match(sql, /insert into public\.user_asset_cleanup_outbox[\s\S]*delete from public\.signature_voice_capture_authorizations/)
  assert.match(ownerHotfix, /if p_owner_type not in \('anon', 'customer'\)[\s\S]*signature_voice_capture_owner_invalid/)
  assert.match(ownerHotfix, /p_owner_type = 'anon' and \(p_anon_session_id is null or p_customer_id is not null\)[\s\S]*signature_voice_capture_owner_invalid/)
  assert.match(ownerHotfix, /p_owner_type = 'customer' and \(p_customer_id is null or p_anon_session_id is not null\)[\s\S]*signature_voice_capture_owner_invalid/)
  assert.doesNotMatch(ownerHotfix, /p_owner_type\s*=\s*'(?:anon|customer)'[\s\S]{0,160}?then\s+null\s*;/i)
  assert.match(cleanupServer, /enqueue_stale_signature_voice_capture_uploads/)
  assert.match(cleanupServer, /Date\.now\(\) - DAY_MS/)
})

test('S7 consent migration remains safe to execute from the SQL Editor', async () => {
  const sql = await readTemplateSql('sql_signature_voice_consent_v2.sql')

  assert.doesNotMatch(sql, /&(?:#x?[0-9a-f]+|[a-z]+);/i)
  assert.doesNotMatch(sql, /\bauthorization\s*\./i)
  assert.match(
    sql,
    /select\s+capture_auth\.authorization_id,[\s\S]*capture_auth\.created_at\s+into v_authorization/,
  )
})

test('S7C discloses synthetic voice creation and retention before child or adult capture', async () => {
  const [messages, privacy, legalDocuments, workspace] = await Promise.all([
    read('src/lib/i18n-messages.ts'),
    read('src/lib/footer-legal-content.ts'),
    read('src/lib/legal-documents.ts'),
    read('components/admin/sections/orders/SignatureVoiceWorkspace.tsx'),
  ])

  assert.match(messages, /authorizationChild[\s\S]*synthetic version of this child's voice[\s\S]*retention schedule[\s\S]*never used to train models/)
  assert.match(messages, /authorizationAdult[\s\S]*synthetic version of my voice[\s\S]*retention schedule[\s\S]*never used to train models/)
  assert.match(privacy, /same retention schedule applies whether the narrator is the child in the book or an adult/)
  assert.match(privacy, /access limited to authorized personnel/)
  assert.match(privacy, /cannot remotely erase narration already loaded onto and delivered inside a physical book/)
  assert.match(legalDocuments, /version: '2026-08-27-v2'/)
  assert.match(workspace, /Authorization review/)
  assert.doesNotMatch(workspace, /Adult declaration check|Adult check/)
})

test('S2 verifies real private audio bytes and derives duration on the server', async () => {
  const [confirmRoute, jobsRoute] = await Promise.all([
    read('app/api/user-assets/confirm/route.ts'),
    read('app/api/jobs/route.js'),
  ])

  assert.match(confirmRoute, /\.from\('raw-private'\)[\s\S]*\.download\(storagePath\)/)
  assert.match(confirmRoute, /parseBuffer\(bytes/)
  assert.match(confirmRoute, /duration < SIGNATURE_VOICE_MIN_SAMPLE_SECONDS[\s\S]*duration > SIGNATURE_VOICE_MAX_SAMPLE_SECONDS/)
  assert.match(confirmRoute, /duration_seconds: verifiedVoiceDuration/)
  assert.doesNotMatch(confirmRoute, /client_quality|normalizeClientVoiceQuality|clientMetadata/)

  assert.match(jobsRoute, /parseSignatureVoiceBindingRequest\(body\?\.voice_binding\)/)
  assert.match(jobsRoute, /\.eq\('asset_id', requestedBinding\.assetId\)[\s\S]*\.eq\('owner_type', voiceOwnerFilter\.owner_type\)[\s\S]*\.eq\(voiceOwnerFilter\.column, voiceOwnerFilter\.value\)/)
  assert.match(jobsRoute, /Number\(voiceAsset\.metadata\?\.duration_seconds\)/)
  assert.match(jobsRoute, /Signature Voice binding is only accepted for the Signature Voice package/)
  assert.doesNotMatch(jobsRoute, /body\?\.voice_binding\?\.duration|body\?\.voice_binding\?\.accepted_at/)
})

test('S2 binds consent, source asset and Preview job in one database statement', async () => {
  const sql = await readTemplateSql('sql_signature_voice_capture_hardening.sql')
  const dropLegacyFunctionAt = sql.indexOf('drop function if exists public.create_preview_job(')
  const createReplacementFunctionAt = sql.indexOf('create or replace function public.create_preview_job(')

  assert.doesNotMatch(sql, /^\s*begin\s*;/im)
  assert.doesNotMatch(sql, /create\s+(?:temporary|temp)\s+table/i)
  assert.ok(dropLegacyFunctionAt >= 0, 'legacy create_preview_job overload must be removed')
  assert.ok(createReplacementFunctionAt >= 0, 'replacement create_preview_job function must exist')
  assert.ok(
    dropLegacyFunctionAt < createReplacementFunctionAt,
    'legacy create_preview_job overload must be dropped before the replacement is created',
  )
  assert.match(sql, /create or replace function public\.create_preview_job\([\s\S]*security definer[\s\S]*set search_path = ''/)
  assert.match(sql, /if p_selected_book_type = 'Signature Voice'[\s\S]*signature_voice_binding_invalid/)
  assert.match(sql, /v_voice_accepted_at := clock_timestamp\(\)/)
  assert.match(sql, /insert into public\.creations[\s\S]*voice_asset_id[\s\S]*voice_consent_accepted_at[\s\S]*voice_bound_at[\s\S]*insert into public\.jobs/)
  assert.match(sql, /p_voice_asset_id[\s\S]*p_voice_sample_duration_seconds[\s\S]*p_voice_consent_version[\s\S]*v_voice_accepted_at/)
  assert.match(sql, /grant execute on function public\.create_preview_job[\s\S]*to service_role/)
})

test('S2 orphan cleanup includes historical rows but cannot select a bound recording', async () => {
  const [sql, cleanupServer, cleanupRoute, vercel] = await Promise.all([
    readTemplateSql('sql_signature_voice_capture_hardening.sql'),
    read('src/lib/user-asset-cleanup-server.ts'),
    read('app/api/internal/user-assets/cleanup/route.ts'),
    read('vercel.json'),
  ])

  const enqueue = sql.match(/create or replace function public\.enqueue_expired_unbound_voice_assets[\s\S]*?\n\$\$;/)?.[0] ?? ''
  assert.match(enqueue, /asset\.created_at < p_cutoff/)
  assert.match(enqueue, /not exists \([\s\S]*creation\.voice_asset_id = asset\.asset_id/)
  assert.doesNotMatch(enqueue, /deployed_at|migration_date|created_at\s*>/)
  assert.match(enqueue, /insert into public\.user_asset_cleanup_outbox[\s\S]*delete from public\.user_assets/)
  assert.match(cleanupServer, /orphanAgeDays \?\? 30/)
  assert.match(cleanupServer, /claim_user_asset_cleanup/)
  assert.match(cleanupRoute, /INTERNAL_API_SECRET[\s\S]*CRON_SECRET/)
  assert.match(vercel, /\/api\/internal\/user-assets\/cleanup/)
})

test('S2 source playback is an owner-or-bound-Creation byte proxy, never a credential', async () => {
  const [listRoute, playbackRoute] = await Promise.all([
    read('app/api/user-assets/route.ts'),
    read('app/api/user-assets/[assetId]/download/route.ts'),
  ])

  assert.match(listRoute, /playback_url:[\s\S]*`\/api\/user-assets\/\$\{encodeURIComponent\(voice\.asset_id\)\}\/download`/)
  assert.match(listRoute, /duration >= SIGNATURE_VOICE_MIN_SAMPLE_SECONDS[\s\S]*duration <= SIGNATURE_VOICE_MAX_SAMPLE_SECONDS/)
  assert.match(playbackRoute, /resolveCheckoutOwner\(request\)/)
  assert.match(playbackRoute, /const ownsAsset =/)
  assert.match(playbackRoute, /\.from\('creations'\)[\s\S]*\.eq\('voice_asset_id', assetId\)[\s\S]*\.eq\('owner_type', filter\.owner_type\)/)
  assert.match(playbackRoute, /\.from\('raw-private'\)[\s\S]*\.download\(asset\.storage_path\)/)
  assert.match(playbackRoute, /'Cache-Control': 'private, no-store, max-age=0'/)
  assert.doesNotMatch(playbackRoute, /createSignedUrl|signed_url|signedUrl/)
})

test('S2 code-owned Privacy source publishes the approved voice custody periods', async () => {
  const [privacy, legalDocuments] = await Promise.all([
    read('src/lib/footer-legal-content.ts'),
    read('src/lib/legal-documents.ts'),
  ])

  assert.match(privacy, /title: '7\. Voice Data Retention'/)
  assert.match(privacy, /Deleted after 30 days without a Creation binding/)
  assert.match(privacy, /180 days after delivery/)
  assert.match(privacy, /Retained for 24 months after delivery/)
  assert.match(privacy, /Temporary operator workstation files:[\s\S]*within 7 days/)
  assert.match(privacy, /do not use your or your child\\'s uploaded materials to train AI models/)
  assert.match(legalDocuments, /path: '\/privacy'/)
})
