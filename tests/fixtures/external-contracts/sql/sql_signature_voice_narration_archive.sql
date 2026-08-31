-- Signature Voice S4: private produced-narration archive.
-- Run after sql_signature_voice_admin_surface.sql and before deploying S4 code.
--
-- SQL Editor safety:
-- - no explicit transaction, temporary table or session workset;
-- - additive/idempotent DDL only;
-- - each state-changing operation is one RPC or trigger statement.

create table if not exists public.signature_voice_narration_tracks (
  creation_id uuid not null
    references public.creations(creation_id) on delete restrict,
  slot_key text not null
    check (slot_key ~ '^narration_(0[1-9]|1[0-5])$'),
  asset_id uuid not null unique,
  source_asset_id uuid not null,
  storage_path text not null unique,
  original_filename text not null
    check (char_length(original_filename) between 1 and 255),
  content_type text not null
    check (content_type in (
      'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav',
      'audio/x-wav', 'audio/ogg', 'audio/x-m4a'
    )),
  size_bytes bigint not null
    check (size_bytes between 1 and 15728640),
  duration_seconds numeric not null
    check (duration_seconds between 3 and 600),
  sha256 text not null
    check (sha256 ~ '^[0-9a-f]{64}$'),
  revision integer not null default 1
    check (revision > 0),
  verified_by uuid not null
    references public.customers(customer_id) on delete restrict,
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (creation_id, slot_key)
);

alter table public.signature_voice_narration_tracks enable row level security;
revoke all on table public.signature_voice_narration_tracks from public, anon, authenticated;
grant select, insert, update, delete on table public.signature_voice_narration_tracks to service_role;

create index if not exists signature_voice_narration_tracks_source_idx
  on public.signature_voice_narration_tracks (creation_id, source_asset_id, slot_key);

comment on table public.signature_voice_narration_tracks is
  'Current verified narration artifact for each of fifteen logical spread slots; independent of visual page indexes.';

create table if not exists public.signature_voice_narration_uploads (
  asset_id uuid primary key,
  order_id uuid not null
    references public.orders(order_id) on delete restrict,
  cart_item_id uuid not null
    references public.cart_items(cart_item_id) on delete restrict,
  creation_id uuid not null
    references public.creations(creation_id) on delete restrict,
  slot_key text not null
    check (slot_key ~ '^narration_(0[1-9]|1[0-5])$'),
  source_asset_id uuid not null,
  expected_track_asset_id uuid null,
  admin_customer_id uuid not null
    references public.customers(customer_id) on delete restrict,
  storage_path text not null unique,
  original_filename text not null
    check (char_length(original_filename) between 1 and 255),
  content_type text not null
    check (content_type in (
      'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav',
      'audio/x-wav', 'audio/ogg', 'audio/x-m4a'
    )),
  size_bytes bigint not null
    check (size_bytes between 1 and 15728640),
  upload_status text not null default 'pending'
    check (upload_status in ('pending', 'consumed')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  consumed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signature_voice_narration_upload_state_check check (
    (upload_status = 'pending' and consumed_at is null)
    or (upload_status = 'consumed' and consumed_at is not null)
  )
);

alter table public.signature_voice_narration_uploads enable row level security;
revoke all on table public.signature_voice_narration_uploads from public, anon, authenticated;
grant select, insert, update, delete on table public.signature_voice_narration_uploads to service_role;

create index if not exists signature_voice_narration_uploads_expiry_idx
  on public.signature_voice_narration_uploads (upload_status, expires_at, created_at);

create index if not exists signature_voice_narration_uploads_creation_idx
  on public.signature_voice_narration_uploads (creation_id, slot_key, created_at desc);

comment on table public.signature_voice_narration_uploads is
  'Private staging registry for explicit per-slot narration uploads.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.signature_voice_audit_events'::regclass
      and constraint_row.conname = 'signature_voice_audit_event_type_v2_check'
  ) then
    alter table public.signature_voice_audit_events
      add constraint signature_voice_audit_event_type_v2_check check (
        event_type in (
          'source_accessed',
          'technical_triage_updated',
          'adult_declaration_triage_updated',
          'source_replaced',
          'narration_accessed',
          'narration_uploaded',
          'narration_replaced'
        )
      ) not valid;
  end if;

  alter table public.signature_voice_audit_events
    validate constraint signature_voice_audit_event_type_v2_check;
  alter table public.signature_voice_audit_events
    drop constraint if exists signature_voice_audit_events_event_type_check;
end;
$$;

create or replace function public.invalidate_signature_voice_narration_on_source_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.voice_asset_id is null
    or old.voice_asset_id is not distinct from new.voice_asset_id then
    return new;
  end if;

  insert into public.user_asset_cleanup_outbox (
    asset_id,
    asset_type,
    bucket_name,
    storage_path,
    reason,
    cleanup_status,
    processing_token,
    claimed_at,
    next_attempt_at,
    updated_at
  )
  select
    upload.asset_id,
    'signature_voice_narration',
    'raw-private',
    upload.storage_path,
    'admin_replacement',
    'pending',
    null,
    null,
    now(),
    now()
  from public.signature_voice_narration_uploads upload
  where upload.creation_id = old.creation_id
  on conflict (bucket_name, storage_path) do update
  set cleanup_status = 'pending',
      processing_token = null,
      claimed_at = null,
      next_attempt_at = now(),
      updated_at = now();

  insert into public.user_asset_cleanup_outbox (
    asset_id,
    asset_type,
    bucket_name,
    storage_path,
    reason,
    cleanup_status,
    processing_token,
    claimed_at,
    next_attempt_at,
    updated_at
  )
  select
    track.asset_id,
    'signature_voice_narration',
    'raw-private',
    track.storage_path,
    'admin_replacement',
    'pending',
    null,
    null,
    now() + interval '30 days',
    now()
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

do $$
begin
  drop trigger if exists creations_signature_voice_narration_invalidation
    on public.creations;
  create trigger creations_signature_voice_narration_invalidation
  after update of voice_asset_id on public.creations
  for each row execute function public.invalidate_signature_voice_narration_on_source_change();
end;
$$;

revoke all on function public.invalidate_signature_voice_narration_on_source_change()
  from public, anon, authenticated;

create or replace function public.commit_signature_voice_narration_track(
  p_order_id uuid,
  p_cart_item_id uuid,
  p_creation_id uuid,
  p_admin_customer_id uuid,
  p_slot_key text,
  p_source_asset_id uuid,
  p_expected_track_asset_id uuid,
  p_new_asset_id uuid,
  p_new_storage_path text,
  p_new_content_type text,
  p_new_size_bytes bigint,
  p_new_duration_seconds numeric,
  p_new_sha256 text,
  p_new_original_name text
)
returns table (
  out_creation_id uuid,
  out_slot_key text,
  out_asset_id uuid,
  out_revision integer,
  out_verified_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creation public.creations%rowtype;
  v_upload public.signature_voice_narration_uploads%rowtype;
  v_existing public.signature_voice_narration_tracks%rowtype;
  v_track public.signature_voice_narration_tracks%rowtype;
  v_has_existing boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  if not exists (
    select 1
    from public.customers admin_customer
    where admin_customer.customer_id = p_admin_customer_id
      and admin_customer.role::text = 'admin'
  ) then
    raise exception 'admin_access_required' using errcode = '42501';
  end if;
  if p_slot_key is null
    or p_slot_key !~ '^narration_(0[1-9]|1[0-5])$'
    or nullif(btrim(coalesce(p_new_storage_path, '')), '') is null
    or p_new_content_type not in (
      'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav',
      'audio/x-wav', 'audio/ogg', 'audio/x-m4a'
    )
    or p_new_size_bytes is null
    or p_new_size_bytes not between 1 and 15728640
    or p_new_duration_seconds is null
    or p_new_duration_seconds not between 3 and 600
    or p_new_sha256 is null
    or p_new_sha256 !~ '^[0-9a-f]{64}$'
    or nullif(btrim(coalesce(p_new_original_name, '')), '') is null
    or char_length(p_new_original_name) > 255 then
    raise exception 'signature_voice_narration_file_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_creation_id::text || ':' || p_slot_key, 0));

  select creation.*
  into v_creation
  from public.orders purchase_order
  join public.cart_items item
    on item.order_id = purchase_order.order_id
  join public.creations creation
    on creation.creation_id = item.creation_id
  where purchase_order.order_id = p_order_id
    and purchase_order.payment_id is not null
    and item.cart_item_id = p_cart_item_id
    and item.status::text = 'ordered'
    and lower(coalesce(item.package_type::text, '')) = 'supreme'
    and creation.creation_id = p_creation_id
  for update of creation;

  if not found or v_creation.voice_asset_id is null then
    raise exception 'signature_voice_order_item_not_found' using errcode = 'P0002';
  end if;
  if v_creation.voice_asset_id is distinct from p_source_asset_id then
    raise exception 'signature_voice_source_changed' using errcode = '40001';
  end if;

  select upload.*
  into v_upload
  from public.signature_voice_narration_uploads upload
  where upload.asset_id = p_new_asset_id
  for update;
  if not found
    or v_upload.upload_status <> 'pending'
    or v_upload.expires_at <= v_now
    or v_upload.order_id is distinct from p_order_id
    or v_upload.cart_item_id is distinct from p_cart_item_id
    or v_upload.creation_id is distinct from p_creation_id
    or v_upload.slot_key is distinct from p_slot_key
    or v_upload.source_asset_id is distinct from p_source_asset_id
    or v_upload.expected_track_asset_id is distinct from p_expected_track_asset_id
    or v_upload.admin_customer_id is distinct from p_admin_customer_id
    or v_upload.storage_path is distinct from p_new_storage_path
    or v_upload.original_filename is distinct from p_new_original_name
    or v_upload.content_type is distinct from p_new_content_type
    or v_upload.size_bytes is distinct from p_new_size_bytes then
    raise exception 'signature_voice_narration_upload_invalid' using errcode = '23514';
  end if;

  select track.*
  into v_existing
  from public.signature_voice_narration_tracks track
  where track.creation_id = p_creation_id
    and track.slot_key = p_slot_key
  for update;
  v_has_existing := found;

  if (v_has_existing and v_existing.asset_id is distinct from p_expected_track_asset_id)
    or (not v_has_existing and p_expected_track_asset_id is not null) then
    raise exception 'signature_voice_narration_track_changed' using errcode = '40001';
  end if;

  if v_has_existing then
    insert into public.user_asset_cleanup_outbox (
      asset_id,
      asset_type,
      bucket_name,
      storage_path,
      reason,
      cleanup_status,
      processing_token,
      claimed_at,
      next_attempt_at,
      updated_at
    )
    values (
      v_existing.asset_id,
      'signature_voice_narration',
      'raw-private',
      v_existing.storage_path,
      'admin_replacement',
      'pending',
      null,
      null,
      v_now,
      v_now
    )
    on conflict (bucket_name, storage_path) do update
    set cleanup_status = 'pending',
        processing_token = null,
        claimed_at = null,
        next_attempt_at = v_now,
        updated_at = v_now;

    delete from public.signature_voice_narration_uploads upload
    where upload.asset_id = v_existing.asset_id;
  end if;

  insert into public.signature_voice_narration_tracks (
    creation_id,
    slot_key,
    asset_id,
    source_asset_id,
    storage_path,
    original_filename,
    content_type,
    size_bytes,
    duration_seconds,
    sha256,
    revision,
    verified_by,
    verified_at,
    updated_at
  )
  values (
    p_creation_id,
    p_slot_key,
    p_new_asset_id,
    p_source_asset_id,
    p_new_storage_path,
    p_new_original_name,
    p_new_content_type,
    p_new_size_bytes,
    p_new_duration_seconds,
    p_new_sha256,
    1,
    p_admin_customer_id,
    v_now,
    v_now
  )
  on conflict (creation_id, slot_key) do update
  set asset_id = excluded.asset_id,
      source_asset_id = excluded.source_asset_id,
      storage_path = excluded.storage_path,
      original_filename = excluded.original_filename,
      content_type = excluded.content_type,
      size_bytes = excluded.size_bytes,
      duration_seconds = excluded.duration_seconds,
      sha256 = excluded.sha256,
      revision = public.signature_voice_narration_tracks.revision + 1,
      verified_by = excluded.verified_by,
      verified_at = excluded.verified_at,
      updated_at = excluded.updated_at
  returning * into v_track;

  update public.signature_voice_narration_uploads upload
  set upload_status = 'consumed',
      consumed_at = v_now,
      updated_at = v_now
  where upload.asset_id = p_new_asset_id;

  insert into public.signature_voice_audit_events (
    order_id,
    cart_item_id,
    creation_id,
    source_asset_id,
    actor_customer_id,
    event_type,
    metadata
  )
  values (
    p_order_id,
    p_cart_item_id,
    p_creation_id,
    p_new_asset_id,
    p_admin_customer_id,
    case when v_has_existing then 'narration_replaced' else 'narration_uploaded' end,
    jsonb_build_object(
      'slot_key', p_slot_key,
      'voice_source_asset_id', p_source_asset_id,
      'previous_asset_id', case when v_has_existing then v_existing.asset_id else null end,
      'revision', v_track.revision,
      'size_bytes', p_new_size_bytes,
      'duration_seconds', p_new_duration_seconds,
      'sha256', p_new_sha256
    )
  );

  return query
  select
    v_track.creation_id,
    v_track.slot_key,
    v_track.asset_id,
    v_track.revision,
    v_track.verified_at;
end;
$$;

revoke all on function public.commit_signature_voice_narration_track(
  uuid, uuid, uuid, uuid, text, uuid, uuid, uuid, text, text, bigint, numeric, text, text
) from public, anon, authenticated;
grant execute on function public.commit_signature_voice_narration_track(
  uuid, uuid, uuid, uuid, text, uuid, uuid, uuid, text, text, bigint, numeric, text, text
) to service_role;

create or replace function public.record_signature_voice_narration_access(
  p_order_id uuid,
  p_cart_item_id uuid,
  p_creation_id uuid,
  p_slot_key text,
  p_source_asset_id uuid,
  p_track_asset_id uuid,
  p_admin_customer_id uuid,
  p_access_mode text,
  p_range_requested boolean default false
)
returns table (
  out_asset_id uuid,
  out_bucket_name text,
  out_storage_path text,
  out_original_filename text,
  out_content_type text,
  out_size_bytes bigint,
  out_duration_seconds numeric,
  out_sha256 text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_track public.signature_voice_narration_tracks%rowtype;
begin
  if not exists (
    select 1
    from public.customers admin_customer
    where admin_customer.customer_id = p_admin_customer_id
      and admin_customer.role::text = 'admin'
  ) then
    raise exception 'admin_access_required' using errcode = '42501';
  end if;
  if p_access_mode is null
    or p_access_mode not in ('playback', 'download')
    or p_slot_key is null
    or p_slot_key !~ '^narration_(0[1-9]|1[0-5])$' then
    raise exception 'signature_voice_narration_access_invalid' using errcode = '22023';
  end if;

  select track.*
  into v_track
  from public.orders purchase_order
  join public.cart_items item
    on item.order_id = purchase_order.order_id
  join public.creations creation
    on creation.creation_id = item.creation_id
  join public.signature_voice_narration_tracks track
    on track.creation_id = creation.creation_id
  where purchase_order.order_id = p_order_id
    and purchase_order.payment_id is not null
    and item.cart_item_id = p_cart_item_id
    and item.status::text = 'ordered'
    and lower(coalesce(item.package_type::text, '')) = 'supreme'
    and creation.creation_id = p_creation_id
    and creation.voice_asset_id = p_source_asset_id
    and track.slot_key = p_slot_key
    and track.source_asset_id = p_source_asset_id
    and track.asset_id = p_track_asset_id;

  if not found then
    raise exception 'signature_voice_narration_not_found' using errcode = 'P0002';
  end if;

  insert into public.signature_voice_audit_events (
    order_id,
    cart_item_id,
    creation_id,
    source_asset_id,
    actor_customer_id,
    event_type,
    metadata
  )
  values (
    p_order_id,
    p_cart_item_id,
    p_creation_id,
    p_track_asset_id,
    p_admin_customer_id,
    'narration_accessed',
    jsonb_build_object(
      'slot_key', p_slot_key,
      'voice_source_asset_id', p_source_asset_id,
      'access_mode', p_access_mode,
      'range_requested', coalesce(p_range_requested, false)
    )
  );

  return query
  select
    v_track.asset_id,
    'raw-private'::text,
    v_track.storage_path,
    v_track.original_filename,
    v_track.content_type,
    v_track.size_bytes,
    v_track.duration_seconds,
    v_track.sha256;
end;
$$;

revoke all on function public.record_signature_voice_narration_access(
  uuid, uuid, uuid, text, uuid, uuid, uuid, text, boolean
) from public, anon, authenticated;
grant execute on function public.record_signature_voice_narration_access(
  uuid, uuid, uuid, text, uuid, uuid, uuid, text, boolean
) to service_role;

create or replace function public.enqueue_expired_signature_voice_narration_uploads(
  p_cutoff timestamptz default now(),
  p_limit integer default 50
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enqueued integer := 0;
  v_removed integer := 0;
begin
  if p_cutoff is null or p_limit not between 1 and 200 then
    raise exception 'signature_voice_narration_cleanup_input_invalid' using errcode = '22023';
  end if;

  with candidates as (
    select upload.asset_id
    from public.signature_voice_narration_uploads upload
    where upload.upload_status = 'pending'
      and upload.expires_at <= p_cutoff
      and not exists (
        select 1
        from public.signature_voice_narration_tracks track
        where track.asset_id = upload.asset_id
      )
    order by upload.expires_at, upload.asset_id
    for update of upload skip locked
    limit p_limit
  ), queued as (
    insert into public.user_asset_cleanup_outbox (
      asset_id,
      asset_type,
      bucket_name,
      storage_path,
      reason,
      cleanup_status,
      processing_token,
      claimed_at,
      next_attempt_at,
      updated_at
    )
    select
      upload.asset_id,
      'signature_voice_narration',
      'raw-private',
      upload.storage_path,
      'admin_replacement',
      'pending',
      null,
      null,
      now(),
      now()
    from public.signature_voice_narration_uploads upload
    join candidates candidate on candidate.asset_id = upload.asset_id
    on conflict (bucket_name, storage_path) do update
    set cleanup_status = 'pending',
        processing_token = null,
        claimed_at = null,
        next_attempt_at = now(),
        updated_at = now()
    returning asset_id
  ), removed as (
    delete from public.signature_voice_narration_uploads upload
    using candidates candidate
    where upload.asset_id = candidate.asset_id
    returning upload.asset_id
  )
  select
    (select count(*)::integer from queued),
    (select count(*)::integer from removed)
  into v_enqueued, v_removed;

  if v_enqueued <> v_removed then
    raise exception 'signature_voice_narration_cleanup_count_mismatch'
      using errcode = 'P0001';
  end if;

  return v_enqueued;
end;
$$;

revoke all on function public.enqueue_expired_signature_voice_narration_uploads(
  timestamptz, integer
) from public, anon, authenticated;
grant execute on function public.enqueue_expired_signature_voice_narration_uploads(
  timestamptz, integer
) to service_role;
