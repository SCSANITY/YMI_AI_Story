-- Signature Voice S5: Print/Shipment fulfillment gates and physical hardware attestation.
-- Run after sql_signature_voice_narration_archive.sql and before deploying S5 code.
--
-- SQL Editor safety:
-- - no explicit transaction, temporary table or session workset;
-- - each constraint swap is contained in one DO statement;
-- - each fulfillment transition is enforced by a trigger or one atomic RPC.

do $$
begin
  if exists (
    select 1
    from public.signature_voice_narration_tracks track
    where track.duration_seconds < 3 or track.duration_seconds > 600
  ) then
    raise exception 'Existing Signature Voice narration must be between 3 and 600 seconds before S5 can be applied'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.signature_voice_narration_tracks'::regclass
      and constraint_row.conname = 'signature_voice_narration_tracks_duration_v2_check'
  ) then
    alter table public.signature_voice_narration_tracks
      add constraint signature_voice_narration_tracks_duration_v2_check
      check (duration_seconds between 3 and 600) not valid;
  end if;

  alter table public.signature_voice_narration_tracks
    validate constraint signature_voice_narration_tracks_duration_v2_check;
  alter table public.signature_voice_narration_tracks
    drop constraint if exists signature_voice_narration_tracks_duration_seconds_check;
end;
$$;

create table if not exists public.signature_voice_hardware_attestations (
  creation_id uuid primary key
    references public.creations(creation_id) on delete restrict,
  source_asset_id uuid not null
    references public.user_assets(asset_id) on delete restrict,
  narration_manifest_sha256 text not null
    check (narration_manifest_sha256 ~ '^[0-9a-f]{64}$'),
  attested_by uuid not null
    references public.customers(customer_id) on delete restrict,
  attested_at timestamptz not null,
  shipment_integrity_checked_by uuid null
    references public.customers(customer_id) on delete restrict,
  shipment_integrity_checked_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signature_voice_shipment_integrity_pair_check check (
    (shipment_integrity_checked_by is null and shipment_integrity_checked_at is null)
    or
    (shipment_integrity_checked_by is not null and shipment_integrity_checked_at is not null)
  )
);

alter table public.signature_voice_hardware_attestations enable row level security;
revoke all on table public.signature_voice_hardware_attestations
  from public, anon, authenticated;
grant select, insert, update, delete on table public.signature_voice_hardware_attestations
  to service_role;

create index if not exists signature_voice_hardware_attestations_source_idx
  on public.signature_voice_hardware_attestations (source_asset_id, attested_at desc);

comment on table public.signature_voice_hardware_attestations is
  'Actor-attributed proof that the current fifteen-track manifest was loaded into one physical Signature Voice item.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.signature_voice_audit_events'::regclass
      and constraint_row.conname = 'signature_voice_audit_event_type_v3_check'
  ) then
    alter table public.signature_voice_audit_events
      add constraint signature_voice_audit_event_type_v3_check check (
        event_type in (
          'source_accessed',
          'technical_triage_updated',
          'adult_declaration_triage_updated',
          'source_replaced',
          'narration_accessed',
          'narration_uploaded',
          'narration_replaced',
          'hardware_loaded_attested',
          'shipment_integrity_verified'
        )
      ) not valid;
  end if;

  alter table public.signature_voice_audit_events
    validate constraint signature_voice_audit_event_type_v3_check;
  alter table public.signature_voice_audit_events
    drop constraint if exists signature_voice_audit_event_type_v2_check;
end;
$$;

create or replace function public.signature_voice_narration_manifest(
  p_creation_id uuid,
  p_source_asset_id uuid
)
returns table (
  out_track_count integer,
  out_manifest_sha256 text
)
language sql
stable
security definer
set search_path = pg_catalog, extensions
as $$
  select
    count(*)::integer,
    case
      when count(*) = 15 then encode(
        extensions.digest(
          convert_to(
            string_agg(
              track.slot_key || ':' ||
              track.asset_id::text || ':' ||
              track.revision::text || ':' ||
              track.size_bytes::text || ':' ||
              track.sha256,
              E'\n' order by track.slot_key
            ),
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
      else null
    end
  from public.signature_voice_narration_tracks track
  where track.creation_id = p_creation_id
    and track.source_asset_id = p_source_asset_id;
$$;

revoke all on function public.signature_voice_narration_manifest(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.signature_voice_narration_manifest(uuid, uuid)
  to service_role;

create or replace function public.invalidate_signature_voice_hardware_attestation_on_track_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creation_id uuid;
begin
  v_creation_id := case when tg_op = 'DELETE' then old.creation_id else new.creation_id end;
  delete from public.signature_voice_hardware_attestations attestation
  where attestation.creation_id = v_creation_id;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
begin
  drop trigger if exists signature_voice_narration_track_hardware_invalidation
    on public.signature_voice_narration_tracks;
  create trigger signature_voice_narration_track_hardware_invalidation
  after insert or update or delete on public.signature_voice_narration_tracks
  for each row execute function public.invalidate_signature_voice_hardware_attestation_on_track_change();
end;
$$;

revoke all on function public.invalidate_signature_voice_hardware_attestation_on_track_change()
  from public, anon, authenticated;

create or replace function public.lock_signature_voice_narration_creation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creation_id uuid;
begin
  v_creation_id := case when tg_op = 'DELETE' then old.creation_id else new.creation_id end;
  perform pg_advisory_xact_lock(hashtextextended(v_creation_id::text, 0));

  if exists (
    select 1
    from public.cart_items item
    join public.orders purchase_order on purchase_order.order_id = item.order_id
    where item.creation_id = v_creation_id
      and item.status::text = 'ordered'
      and lower(coalesce(item.package_type::text, '')) = 'supreme'
      and purchase_order.order_status::text in ('shipped', 'delivered')
  ) then
    raise exception 'Signature Voice narration is immutable after shipment'
      using errcode = '55000';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
begin
  drop trigger if exists signature_voice_narration_track_creation_lock
    on public.signature_voice_narration_tracks;
  create trigger signature_voice_narration_track_creation_lock
  before insert or update or delete on public.signature_voice_narration_tracks
  for each row execute function public.lock_signature_voice_narration_creation();
end;
$$;

revoke all on function public.lock_signature_voice_narration_creation()
  from public, anon, authenticated;

create or replace function public.attest_signature_voice_hardware_loaded(
  p_order_id uuid,
  p_cart_item_id uuid,
  p_creation_id uuid,
  p_source_asset_id uuid,
  p_expected_manifest_sha256 text,
  p_admin_customer_id uuid
)
returns table (
  out_creation_id uuid,
  out_manifest_sha256 text,
  out_attested_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_asset_id uuid;
  v_state public.signature_voice_production_states%rowtype;
  v_track_count integer;
  v_manifest_sha256 text;
  v_now timestamptz := now();
begin
  if not exists (
    select 1
    from public.customers admin_customer
    where admin_customer.customer_id = p_admin_customer_id
      and admin_customer.role::text = 'admin'
  ) then
    raise exception 'Admin actor is required' using errcode = '42501';
  end if;
  if p_expected_manifest_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Signature Voice narration manifest is invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_creation_id::text, 0));

  select creation.voice_asset_id
  into v_source_asset_id
  from public.cart_items item
  join public.orders purchase_order on purchase_order.order_id = item.order_id
  join public.creations creation on creation.creation_id = item.creation_id
  where purchase_order.order_id = p_order_id
    and purchase_order.payment_id is not null
    and item.cart_item_id = p_cart_item_id
    and item.creation_id = p_creation_id
    and item.status::text = 'ordered'
    and lower(coalesce(item.package_type::text, '')) = 'supreme'
  for update of creation;

  if not found or v_source_asset_id is null then
    raise exception 'Paid Signature Voice order item was not found' using errcode = 'P0002';
  end if;
  if v_source_asset_id is distinct from p_source_asset_id then
    raise exception 'Signature Voice source changed before hardware confirmation' using errcode = '40001';
  end if;

  select state.* into v_state
  from public.signature_voice_production_states state
  where state.creation_id = p_creation_id
  for update;
  if not found
    or v_state.technical_status <> 'accepted'
    or v_state.adult_declaration_status <> 'accepted' then
    raise exception 'Signature Voice source triage must be accepted before hardware loading'
      using errcode = '55000';
  end if;

  select manifest.out_track_count, manifest.out_manifest_sha256
  into v_track_count, v_manifest_sha256
  from public.signature_voice_narration_manifest(p_creation_id, p_source_asset_id) manifest;
  if v_track_count <> 15 or v_manifest_sha256 is null then
    raise exception 'All 15 Signature Voice narration tracks are required before hardware loading'
      using errcode = '55000';
  end if;
  if v_manifest_sha256 is distinct from p_expected_manifest_sha256 then
    raise exception 'Signature Voice narration changed during hardware verification'
      using errcode = '40001';
  end if;

  insert into public.signature_voice_hardware_attestations (
    creation_id,
    source_asset_id,
    narration_manifest_sha256,
    attested_by,
    attested_at,
    shipment_integrity_checked_by,
    shipment_integrity_checked_at,
    created_at,
    updated_at
  ) values (
    p_creation_id,
    p_source_asset_id,
    v_manifest_sha256,
    p_admin_customer_id,
    v_now,
    null,
    null,
    v_now,
    v_now
  )
  on conflict (creation_id) do update
  set source_asset_id = excluded.source_asset_id,
      narration_manifest_sha256 = excluded.narration_manifest_sha256,
      attested_by = excluded.attested_by,
      attested_at = excluded.attested_at,
      shipment_integrity_checked_by = null,
      shipment_integrity_checked_at = null,
      updated_at = excluded.updated_at;

  insert into public.signature_voice_audit_events (
    order_id,
    cart_item_id,
    creation_id,
    source_asset_id,
    actor_customer_id,
    event_type,
    metadata
  ) values (
    p_order_id,
    p_cart_item_id,
    p_creation_id,
    p_source_asset_id,
    p_admin_customer_id,
    'hardware_loaded_attested',
    jsonb_build_object('manifest_sha256', v_manifest_sha256, 'track_count', v_track_count)
  );

  return query select p_creation_id, v_manifest_sha256, v_now;
end;
$$;

revoke all on function public.attest_signature_voice_hardware_loaded(
  uuid, uuid, uuid, uuid, text, uuid
) from public, anon, authenticated;
grant execute on function public.attest_signature_voice_hardware_loaded(
  uuid, uuid, uuid, uuid, text, uuid
) to service_role;

create or replace function public.mark_signature_voice_shipment_integrity(
  p_order_id uuid,
  p_cart_item_id uuid,
  p_creation_id uuid,
  p_source_asset_id uuid,
  p_expected_manifest_sha256 text,
  p_admin_customer_id uuid
)
returns table (
  out_creation_id uuid,
  out_checked_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source_asset_id uuid;
  v_state public.signature_voice_production_states%rowtype;
  v_attestation public.signature_voice_hardware_attestations%rowtype;
  v_track_count integer;
  v_manifest_sha256 text;
  v_now timestamptz := now();
begin
  if not exists (
    select 1
    from public.customers admin_customer
    where admin_customer.customer_id = p_admin_customer_id
      and admin_customer.role::text = 'admin'
  ) then
    raise exception 'Admin actor is required' using errcode = '42501';
  end if;
  if p_expected_manifest_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Signature Voice narration manifest is invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_creation_id::text, 0));

  select creation.voice_asset_id
  into v_source_asset_id
  from public.cart_items item
  join public.orders purchase_order on purchase_order.order_id = item.order_id
  join public.creations creation on creation.creation_id = item.creation_id
  where purchase_order.order_id = p_order_id
    and purchase_order.payment_id is not null
    and item.cart_item_id = p_cart_item_id
    and item.creation_id = p_creation_id
    and item.status::text = 'ordered'
    and lower(coalesce(item.package_type::text, '')) = 'supreme'
  for update of creation;

  if not found or v_source_asset_id is null then
    raise exception 'Paid Signature Voice order item was not found' using errcode = 'P0002';
  end if;
  if v_source_asset_id is distinct from p_source_asset_id then
    raise exception 'Signature Voice source changed before shipment verification' using errcode = '40001';
  end if;

  select state.* into v_state
  from public.signature_voice_production_states state
  where state.creation_id = p_creation_id;
  if not found
    or v_state.technical_status <> 'accepted'
    or v_state.adult_declaration_status <> 'accepted' then
    raise exception 'Signature Voice source triage is not accepted' using errcode = '55000';
  end if;

  select manifest.out_track_count, manifest.out_manifest_sha256
  into v_track_count, v_manifest_sha256
  from public.signature_voice_narration_manifest(p_creation_id, p_source_asset_id) manifest;
  if v_track_count <> 15 or v_manifest_sha256 is null then
    raise exception 'All 15 Signature Voice narration tracks are required before shipment'
      using errcode = '55000';
  end if;
  if v_manifest_sha256 is distinct from p_expected_manifest_sha256 then
    raise exception 'Signature Voice narration changed during shipment verification'
      using errcode = '40001';
  end if;

  select attestation.* into v_attestation
  from public.signature_voice_hardware_attestations attestation
  where attestation.creation_id = p_creation_id
  for update;
  if not found
    or v_attestation.source_asset_id is distinct from p_source_asset_id
    or v_attestation.narration_manifest_sha256 is distinct from v_manifest_sha256 then
    raise exception 'Signature Voice hardware loading must be confirmed before shipment'
      using errcode = '55000';
  end if;

  update public.signature_voice_hardware_attestations attestation
  set shipment_integrity_checked_by = p_admin_customer_id,
      shipment_integrity_checked_at = v_now,
      updated_at = v_now
  where attestation.creation_id = p_creation_id;

  insert into public.signature_voice_audit_events (
    order_id,
    cart_item_id,
    creation_id,
    source_asset_id,
    actor_customer_id,
    event_type,
    metadata
  ) values (
    p_order_id,
    p_cart_item_id,
    p_creation_id,
    p_source_asset_id,
    p_admin_customer_id,
    'shipment_integrity_verified',
    jsonb_build_object('manifest_sha256', v_manifest_sha256, 'track_count', v_track_count)
  );

  return query select p_creation_id, v_now;
end;
$$;

revoke all on function public.mark_signature_voice_shipment_integrity(
  uuid, uuid, uuid, uuid, text, uuid
) from public, anon, authenticated;
grant execute on function public.mark_signature_voice_shipment_integrity(
  uuid, uuid, uuid, uuid, text, uuid
) to service_role;

create or replace function public.enforce_signature_voice_print_triage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_package_type text;
  v_item_status text;
  v_payment_id text;
  v_item_creation_id uuid;
  v_source_asset_id uuid;
  v_state public.signature_voice_production_states%rowtype;
begin
  if new.print_status::text <> 'released'
    or old.print_status::text = 'released' then
    return new;
  end if;

  select
    lower(coalesce(item.package_type::text, '')),
    item.status::text,
    purchase_order.payment_id::text,
    item.creation_id,
    creation.voice_asset_id
  into v_package_type, v_item_status, v_payment_id, v_item_creation_id, v_source_asset_id
  from public.cart_items item
  join public.orders purchase_order on purchase_order.order_id = item.order_id
  left join public.creations creation on creation.creation_id = item.creation_id
  where item.cart_item_id = new.cart_item_id
    and item.order_id = new.order_id;

  if not found or v_package_type <> 'supreme' then
    return new;
  end if;
  if v_payment_id is null
    or v_item_status <> 'ordered'
    or new.creation_id is null
    or v_item_creation_id is distinct from new.creation_id
    or v_source_asset_id is null then
    raise exception 'Signature Voice Print Release requires an exact paid order item and bound source'
      using errcode = '55000';
  end if;

  select state.* into v_state
  from public.signature_voice_production_states state
  where state.creation_id = new.creation_id;
  if not found
    or v_state.technical_status <> 'accepted'
    or v_state.adult_declaration_status <> 'accepted' then
    raise exception 'Signature Voice source triage must be accepted before Print Release'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

do $$
begin
  drop trigger if exists final_jobs_signature_voice_print_triage on public.final_jobs;
  create trigger final_jobs_signature_voice_print_triage
  before update of print_status, print_released_at on public.final_jobs
  for each row execute function public.enforce_signature_voice_print_triage();
end;
$$;

revoke all on function public.enforce_signature_voice_print_triage()
  from public, anon, authenticated;

create or replace function public.enforce_signature_voice_shipment_readiness()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item record;
  v_state public.signature_voice_production_states%rowtype;
  v_attestation public.signature_voice_hardware_attestations%rowtype;
  v_track_count integer;
  v_manifest_sha256 text;
begin
  if new.order_status::text not in ('shipped', 'delivered')
    or old.order_status::text in ('shipped', 'delivered') then
    return new;
  end if;

  for v_item in
    select
      item.cart_item_id,
      item.creation_id,
      creation.voice_asset_id as source_asset_id
    from public.cart_items item
    join public.creations creation on creation.creation_id = item.creation_id
    where item.order_id = new.order_id
      and item.status::text = 'ordered'
      and lower(coalesce(item.package_type::text, '')) = 'supreme'
  loop
    perform pg_advisory_xact_lock(hashtextextended(v_item.creation_id::text, 0));

    if new.payment_id is null or v_item.source_asset_id is null then
      raise exception 'Signature Voice shipment requires a paid item with a bound source'
        using errcode = '55000';
    end if;

    select state.* into v_state
    from public.signature_voice_production_states state
    where state.creation_id = v_item.creation_id;
    if not found
      or v_state.technical_status <> 'accepted'
      or v_state.adult_declaration_status <> 'accepted' then
      raise exception 'Signature Voice source triage is not accepted for shipment'
        using errcode = '55000';
    end if;

    select manifest.out_track_count, manifest.out_manifest_sha256
    into v_track_count, v_manifest_sha256
    from public.signature_voice_narration_manifest(
      v_item.creation_id,
      v_item.source_asset_id
    ) manifest;
    if v_track_count <> 15 or v_manifest_sha256 is null then
      raise exception 'All 15 Signature Voice narration tracks are required before shipment'
        using errcode = '55000';
    end if;

    select attestation.* into v_attestation
    from public.signature_voice_hardware_attestations attestation
    where attestation.creation_id = v_item.creation_id;
    if not found
      or v_attestation.source_asset_id is distinct from v_item.source_asset_id
      or v_attestation.narration_manifest_sha256 is distinct from v_manifest_sha256
      or v_attestation.shipment_integrity_checked_at is null
      or v_attestation.shipment_integrity_checked_at < clock_timestamp() - interval '15 minutes' then
      raise exception 'Signature Voice hardware and narration must be verified immediately before shipment'
        using errcode = '55000';
    end if;
  end loop;

  return new;
end;
$$;

do $$
begin
  drop trigger if exists orders_signature_voice_shipment_readiness on public.orders;
  create trigger orders_signature_voice_shipment_readiness
  before update of order_status on public.orders
  for each row execute function public.enforce_signature_voice_shipment_readiness();
end;
$$;

revoke all on function public.enforce_signature_voice_shipment_readiness()
  from public, anon, authenticated;

-- Source replacement keeps both the original sample and its generated narration for
-- the same 30-day rollback window. Staging uploads remain immediately reclaimable.
create or replace function public.invalidate_signature_voice_narration_on_source_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_narration_retention_until timestamptz := now() + interval '30 days';
begin
  if old.voice_asset_id is null
    or old.voice_asset_id is not distinct from new.voice_asset_id then
    return new;
  end if;

  insert into public.user_asset_cleanup_outbox (
    asset_id, asset_type, bucket_name, storage_path, reason, cleanup_status,
    processing_token, claimed_at, next_attempt_at, updated_at
  )
  select
    upload.asset_id, 'signature_voice_narration', 'raw-private', upload.storage_path,
    'admin_replacement', 'pending', null, null, now(), now()
  from public.signature_voice_narration_uploads upload
  where upload.creation_id = old.creation_id
  on conflict (bucket_name, storage_path) do update
  set cleanup_status = 'pending',
      processing_token = null,
      claimed_at = null,
      next_attempt_at = now(),
      updated_at = now();

  insert into public.user_asset_cleanup_outbox (
    asset_id, asset_type, bucket_name, storage_path, reason, cleanup_status,
    processing_token, claimed_at, next_attempt_at, updated_at
  )
  select
    track.asset_id, 'signature_voice_narration', 'raw-private', track.storage_path,
    'admin_replacement', 'pending', null, null, v_narration_retention_until, now()
  from public.signature_voice_narration_tracks track
  where track.creation_id = old.creation_id
  on conflict (bucket_name, storage_path) do update
  set cleanup_status = 'pending',
      processing_token = null,
      claimed_at = null,
      next_attempt_at = greatest(
        public.user_asset_cleanup_outbox.next_attempt_at,
        excluded.next_attempt_at
      ),
      updated_at = now();

  delete from public.signature_voice_narration_uploads upload
  where upload.creation_id = old.creation_id;
  delete from public.signature_voice_narration_tracks track
  where track.creation_id = old.creation_id;

  return new;
end;
$$;

revoke all on function public.invalidate_signature_voice_narration_on_source_change()
  from public, anon, authenticated;
