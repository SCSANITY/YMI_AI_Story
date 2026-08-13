import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const readTemplateSql = (path) =>
  readFile(new URL(`../../Template_folder/${path}`, import.meta.url), 'utf8')

test('legacy self-service Codes are retired without erasing paid audit history', async () => {
  const sql = await readTemplateSql('sql_kol_partnership_foundation.sql')

  assert.match(sql, /where instrument\.source = 'collaboration'\s+and instrument\.collaboration_lead_id is null/)
  assert.match(sql, /redemption\.status = 'paid'/)
  assert.match(sql, /source = 'admin',\s+status = 'disabled',\s+is_active = false/)
  assert.match(sql, /Retired legacy self-service collaboration code/)
  assert.match(sql, /update public\.discount_offers offer[\s\S]*is_active = false/)
  assert.match(sql, /delete from public\.discount_redemptions redemption/)
  assert.match(sql, /get diagnostics v_deleted_redemptions = row_count/)
})

test('unpaid legacy cleanup has a hard anomaly gate and respects the order FK chain', async () => {
  const sql = await readTemplateSql('sql_kol_partnership_foundation.sql')

  assert.match(sql, /legacy Code references a non-unpaid order/)
  assert.match(sql, /legacy test order has a payment row/)
  assert.match(sql, /legacy test order has final-job storage artifacts/)
  assert.match(sql, /legacy test order has an unrelated discount/)
  assert.match(sql, /update public\.jobs job\s+set cart_item_id = null/)
  assert.match(sql, /delete from public\.cart_items item[\s\S]*delete from public\.orders orders/)
  assert.match(sql, /order delete count changed concurrently/)
  assert.match(sql, /instrument delete count changed concurrently/)
})

test('legacy cleanup is one SQL Editor-safe statement with no session worksets', async () => {
  const sql = await readTemplateSql('sql_kol_partnership_foundation.sql')
  const cleanupBlock = sql.match(
    /-- Freeze and clean the old self-service population[\s\S]*?do \$\$[\s\S]*?end;\s*\$\$;/
  )?.[0]

  assert.ok(cleanupBlock)
  assert.match(cleanupBlock, /v_legacy_instrument_ids uuid\[\]/)
  assert.match(cleanupBlock, /v_deletable_order_ids uuid\[\]/)
  assert.match(cleanupBlock, /legacy Code references a non-unpaid order/)
  assert.match(cleanupBlock, /delete from public\.orders orders/)
  assert.doesNotMatch(sql, /create temporary table t3_034_|pg_temp\.t3_034_/)
})

test('paid legacy instrument and offer retirement is one atomic SQL statement', async () => {
  const sql = await readTemplateSql('sql_kol_partnership_foundation.sql')
  const retirementBlock = sql.match(
    /-- Freeze and clean the old self-service population[\s\S]*?do \$\$[\s\S]*?end;\s*\$\$;/
  )?.[0]

  assert.ok(retirementBlock)
  assert.match(retirementBlock, /update public\.discount_instruments instrument/)
  assert.match(retirementBlock, /update public\.discount_offers offer/)
  assert.match(retirementBlock, /source = 'admin',[\s\S]*status = 'disabled'/)
})

test('lead ownership and message quarantine are database-enforced', async () => {
  const sql = await readTemplateSql('sql_kol_partnership_foundation.sql')

  assert.match(sql, /kol_collaboration_leads_one_open_per_customer_key/)
  assert.match(sql, /where review_status in \('new', 'reviewing', 'contacting', 'partnered'\)/)
  assert.match(sql, /customer_id is not null or review_status in \('declined', 'archived'\)/)
  assert.match(sql, /association_state in \('pending', 'confirmed', 'rejected'\)/)
  assert.match(sql, /association_state = 'confirmed' or source = 'email_inbound'/)
  assert.match(sql, /old\.association_state is distinct from new\.association_state/)
  assert.match(sql, /old\.delivery_status is distinct from new\.delivery_status/)
  assert.match(sql, /if not v_should_sync then\s+return new/)
  assert.match(sql, /kol_collaboration_messages_quarantine_idx/)
  assert.match(sql, /inbound_email_id uuid references public\.inbound_email_envelopes/)
  assert.match(sql, /inbound_email_envelopes_route_kind_check[\s\S]*'kol_reply'/)
  assert.match(sql, /association_reviewed_by uuid[\s\S]*association_reviewed_at timestamptz/)
})

test('lead status migration preserves every current workflow state on rerun', async () => {
  const sql = await readTemplateSql('sql_kol_partnership_foundation.sql')
  const snapshotUpdate = sql.match(
    /update public\.kol_collaboration_leads lead\s+set[\s\S]*?from public\.customers customer\s+where customer\.customer_id = lead\.customer_id;/
  )?.[0]
  const statusUpdate = sql.match(
    /update public\.kol_collaboration_leads lead\s+set\s+contact_email[\s\S]*?updated_at = now\(\);/
  )?.[0]

  assert.ok(snapshotUpdate)
  assert.doesNotMatch(snapshotUpdate, /review_status\s*=/)
  assert.ok(statusUpdate)
  assert.match(statusUpdate, /when lead\.customer_id is null then 'archived'/)
  assert.match(
    statusUpdate,
    /when lead\.review_status in \('new', 'reviewing', 'contacting', 'partnered', 'declined', 'archived'\)\s+then lead\.review_status/
  )
})

test('KOL Code issuance is one admin-authorized transaction with insert-based reservation', async () => {
  const sql = await readTemplateSql('sql_kol_partnership_foundation.sql')

  assert.match(sql, /create or replace function public\.create_kol_collaboration_code/)
  assert.match(sql, /security definer\s+set search_path = public, pg_temp/)
  assert.match(sql, /customer_id = p_admin_customer_id and role = 'admin'/)
  assert.match(sql, /v_lead\.review_status <> 'partnered'/)
  assert.match(sql, /insert into public\.discount_offers[\s\S]*insert into public\.discount_instruments/)
  assert.match(sql, /source,[\s\S]*collaboration_lead_id/)
  assert.match(sql, /exception when unique_violation then[\s\S]*errcode = '23505'/)
  assert.match(sql, /grant execute on function public\.create_kol_collaboration_code[\s\S]*to service_role/)
})

test('a lead retains retired Code history while only one active Code is allowed', async () => {
  const sql = await readTemplateSql('sql_kol_partnership_foundation.sql')

  assert.match(sql, /drop index if exists public\.discount_instruments_collaboration_lead_key/)
  assert.match(
    sql,
    /create unique index discount_instruments_collaboration_lead_key[\s\S]*where source = 'collaboration' and status = 'active'/
  )
  assert.doesNotMatch(
    sql,
    /discount_instruments_collaboration_lead_key[\s\S]{0,180}where source = 'collaboration';/
  )
})

test('KOL Code edit and rotation preserve paid history and serialize lead ownership', async () => {
  const sql = await readTemplateSql('sql_kol_partnership_foundation.sql')

  assert.match(sql, /create or replace function public\.update_kol_collaboration_code/)
  assert.match(sql, /where lead_id = p_lead_id\s+for update/)
  assert.match(sql, /KOL Code changed in another session/)
  assert.match(sql, /usage limit cannot be below existing usage/)
  assert.match(sql, /per-customer limit cannot be below existing usage/)
  assert.match(sql, /status = v_committed_status/)
  assert.doesNotMatch(sql, /delete from public\.discount_instruments[\s\S]{0,500}rotate_kol_collaboration_code/)

  assert.match(sql, /create or replace function public\.rotate_kol_collaboration_code/)
  assert.match(sql, /Only the active KOL Code can be superseded/)
  assert.match(sql, /description = 'Superseded KOL partnership Code'/)
  assert.match(sql, /status = 'disabled'/)
  assert.match(sql, /from public\.create_kol_collaboration_code/)
})

test('KOL Codes reuse checkout redemption while rejecting every owner identity', async () => {
  const [sql, discounts] = await Promise.all([
    readTemplateSql('sql_kol_partnership_foundation.sql'),
    read('src/lib/discounts.ts'),
  ])

  assert.match(sql, /v_owner_customer_id = new\.customer_id/)
  assert.match(sql, /v_owner_email, v_account_email, v_contact_email/)
  assert.match(sql, /You cannot use your own partnership code/)
  assert.match(discounts, /normalizeDiscountCode\(params\.code\)/)
  assert.match(discounts, /supabaseAdmin\.rpc\('apply_discount_instrument'/)
  assert.doesNotMatch(discounts, /source\s*===?\s*['"]collaboration['"]/)
})

test('generic Discounts cannot mint or reactivate a collaboration instrument', async () => {
  const route = await read('app/api/admin/discounts/route.ts')

  assert.match(route, /requestedSource !== 'admin'/)
  assert.match(route, /Specialized discount sources require their dedicated Admin workflow/)
  assert.match(route, /Partnership Codes require the KOL Partnerships workflow/)
  assert.match(route, /source: 'admin'/)
  assert.doesNotMatch(route, /source:\s*String\(body\.source/)
  assert.match(route, /\.neq\('source', 'collaboration'\)/)
  assert.match(route, /\.eq\('offer_id', offerId\)[\s\S]*\.eq\('source', 'collaboration'\)/)
  assert.match(route, /\.update\(\{ is_active: isActive, updated_at:/)
  assert.doesNotMatch(route, /\.update\(\{[^}]*status:/)
})

test('customer merge reclaims legacy KOL leads through the service-role RPC', async () => {
  const [sql, mergeRoute] = await Promise.all([
    readTemplateSql('sql_kol_partnership_foundation.sql'),
    read('app/api/customer/merge/route.ts'),
  ])

  assert.match(sql, /create or replace function public\.claim_kol_collaboration_leads_for_customer/)
  assert.match(sql, /lower\(customer\.email\) = v_email/)
  assert.match(sql, /pg_advisory_xact_lock/)
  assert.match(sql, /grant execute on function public\.claim_kol_collaboration_leads_for_customer[\s\S]*to service_role/)
  assert.match(mergeRoute, /claim_kol_collaboration_leads_for_customer/)
  assert.match(mergeRoute, /p_customer_id: customer\.customer_id/)
  assert.match(mergeRoute, /p_account_email: email/)
  assert.match(mergeRoute, /lead ownership recovery failed; continuing customer merge/)
})
