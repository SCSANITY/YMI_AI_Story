import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const readTemplateSql = (path) => readFile(new URL(`../../Template_folder/${path}`, import.meta.url), 'utf8')

test('S1 creates one Creation-owned voice association without Cart or Order duplication', async () => {
  const [sql, schema] = await Promise.all([
    readTemplateSql('sql_signature_voice_binding_foundation.sql'),
    readTemplateSql('Datebase_constructure.sql'),
  ])

  assert.match(sql, /alter table public\.creations[\s\S]*add column if not exists voice_asset_id uuid null/)
  assert.match(sql, /foreign key \(voice_asset_id\)[\s\S]*references public\.user_assets\(asset_id\)[\s\S]*on delete restrict/)
  assert.match(sql, /Pre-existing Creations remain NULL; no historical voice asset is inferred/)
  assert.match(sql, /voice_sample_duration_seconds is not null[\s\S]*voice_sample_duration_seconds between 10 and 20/)
  assert.match(sql, /voice_subject_name is not null[\s\S]*voice_subject_relationship is not null/)
  assert.match(sql, /signature-voice-consent-v\[1-9\]\[0-9\]\*/)
  assert.match(sql, /creations_voice_binding_guard/)
  assert.match(sql, /signature_voice_asset_owner_mismatch/)
  assert.match(sql, /signature_voice_requires_supreme_package/)
  assert.match(
    sql,
    /if tg_op = 'UPDATE'[\s\S]*new\.voice_asset_id is not distinct from old\.voice_asset_id[\s\S]*return new;[\s\S]*select asset\.\*/
  )

  const cartDefinition = schema.match(/CREATE TABLE public\.cart_items \([\s\S]*?\n\);/)?.[0] ?? ''
  const orderDefinition = schema.match(/CREATE TABLE public\.orders \([\s\S]*?\n\);/)?.[0] ?? ''
  assert.doesNotMatch(cartDefinition, /voice_asset|voice_storage/)
  assert.doesNotMatch(orderDefinition, /voice_asset|voice_storage/)
})

test('S1 migration stays convergent in SQL Editor and keeps multi-row deletion atomic in one RPC', async () => {
  const sql = await readTemplateSql('sql_signature_voice_binding_foundation.sql')

  assert.doesNotMatch(sql, /^\s*begin\s*;/im)
  assert.doesNotMatch(sql, /create\s+(?:temporary|temp)\s+table/i)
  assert.match(sql, /create table if not exists public\.user_asset_cleanup_outbox/)
  assert.match(sql, /create or replace function public\.delete_owned_unbound_user_asset/)
  assert.match(
    sql,
    /returns table \(\s*out_cleanup_id uuid,\s*out_bucket_name text,\s*out_storage_path text\s*\)/
  )
  assert.doesNotMatch(
    sql,
    /returns table \(\s*cleanup_id uuid,\s*bucket_name text,\s*storage_path text\s*\)/
  )
  assert.match(
    sql,
    /if exists \([\s\S]*creation\.voice_asset_id = p_asset_id[\s\S]*raise exception 'voice_asset_bound'[\s\S]*insert into public\.user_asset_cleanup_outbox[\s\S]*delete from public\.user_assets/
  )
  assert.match(sql, /revoke all on table public\.user_asset_cleanup_outbox from public, anon, authenticated/)
  assert.match(sql, /grant execute on function public\.delete_owned_unbound_user_asset\(uuid, text, uuid, uuid\)[\s\S]*to service_role/)
})

test('ordinary asset deletion records the private path before touching Storage', async () => {
  const route = await read('app/api/user-assets/route.ts')
  const deleteHandler = route.slice(route.indexOf('export async function DELETE'))

  assert.match(deleteHandler, /rpc\('delete_owned_unbound_user_asset'/)
  assert.match(deleteHandler, /voice_asset_bound/)
  assert.match(deleteHandler, /status: 409/)
  assert.match(
    deleteHandler,
    /rpc\('delete_owned_unbound_user_asset'[\s\S]*storage[\s\S]*\.from\('raw-private'\)[\s\S]*\.remove\(\[storagePath\]\)/
  )
  assert.doesNotMatch(deleteHandler, /\.from\('user_assets'\)[\s\S]*\.delete\(\)/)
  assert.match(deleteHandler, /rpc\('fail_user_asset_cleanup'/)
  assert.match(deleteHandler, /rpc\('finish_user_asset_cleanup'/)
})

test('Cart and Order Start fail closed on an incomplete Signature Voice Creation', async () => {
  const [store, cartRoute, orderStart] = await Promise.all([
    read('src/lib/package-pricing-store.ts'),
    read('app/api/cart/route.ts'),
    read('app/api/orders/start/route.ts'),
  ])

  assert.match(store, /if \(packageType === 'supreme'\)/)
  assert.match(store, /requireSignatureVoiceAssetId\(creation\)/)
  assert.match(store, /\.from\('user_assets'\)[\s\S]*\.eq\('asset_id', voiceAssetId\)/)
  assert.match(store, /assertSignatureVoicePurchaseBinding\(creation, voiceAsset\)/)
  assert.match(store, /new PackagePricingStoreError\(error\.message, 409\)/)
  assert.match(cartRoute, /loadAuthoritativeCreationPackagePrice/)
  assert.match(orderStart, /loadAuthoritativeCreationPackagePrice/)
})
