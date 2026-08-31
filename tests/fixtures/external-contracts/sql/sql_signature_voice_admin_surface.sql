-- Signature Voice S3: Admin source triage, audited access and source replacement.
-- Run after sql_signature_voice_capture_hardening.sql and before deploying S3 code.
--
-- SQL Editor safety:
-- - no explicit transaction, temporary table or session workset;
-- - additive/idempotent DDL only;
-- - each state-changing operation is one RPC statement.

create table if not exists public.signature_voice_production_states (
  creation_id uuid primary key
    references public.creations(creation_id) on delete restrict,
  source_revision integer not null default 1
    check (source_revision > 0),
  technical_status text not null default 'pending'
    check (technical_status in ('pending', 'accepted', 'rejected')),
  technical_reason text null
    check (technical_reason is null or char_length(technical_reason) between 1 and 1000),
  technical_reviewed_by uuid null
    references public.customers(customer_id) on delete restrict,
  technical_reviewed_at timestamptz null,
  adult_declaration_status text not null default 'pending'
    check (adult_declaration_status in ('pending', 'accepted', 'rejected')),
  adult_declaration_reason text null
    check (adult_declaration_reason is null or char_length(adult_declaration_reason) between 1 and 1000),
  adult_declaration_reviewed_by uuid null
    references public.customers(customer_id) on delete restrict,
  adult_declaration_reviewed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signature_voice_technical_review_complete_check check (
    (
      technical_status = 'pending'
      and technical_reason is null
      and technical_reviewed_by is null
      and technical_reviewed_at is null
    )
    or
    (
      technical_status = 'accepted'
      and technical_reviewed_by is not null
      and technical_reviewed_at is not null
    )
    or
    (
      technical_status = 'rejected'
      and technical_reason is not null
      and technical_reviewed_by is not null
      and technical_reviewed_at is not null
    )
  ),
  constraint signature_voice_adult_review_complete_check check (
    (
      adult_declaration_status = 'pending'
      and adult_declaration_reason is null
      and adult_declaration_reviewed_by is null
      and adult_declaration_reviewed_at is null
    )
    or
    (
      adult_declaration_status = 'accepted'
      and adult_declaration_reviewed_by is not null
      and adult_declaration_reviewed_at is not null
    )
    or
    (
      adult_declaration_status = 'rejected'
      and adult_declaration_reason is not null
      and adult_declaration_reviewed_by is not null
      and adult_declaration_reviewed_at is not null
    )
  )
);

alter table public.signature_voice_production_states enable row level security;
revoke all on table public.signature_voice_production_states from public, anon, authenticated;
grant select, insert, update, delete on table public.signature_voice_production_states to service_role;

create index if not exists signature_voice_production_states_attention_idx
  on public.signature_voice_production_states (
    technical_status,
    adult_declaration_status,
    updated_at desc
  );

comment on table public.signature_voice_production_states is
  'Current per-Creation source revision and the two independent pre-print triage decisions.';

create table if not exists public.signature_voice_replacement_uploads (
  asset_id uuid primary key,
  order_id uuid not null
    references public.orders(order_id) on delete restrict,
  cart_item_id uuid not null
    references public.cart_items(cart_item_id) on delete restrict,
  creation_id uuid not null
    references public.creations(creation_id) on delete restrict,
  expected_asset_id uuid not null,
  admin_customer_id uuid not null
    references public.customers(customer_id) on delete restrict,
  storage_path text not null unique,
  original_filename text not null
    check (char_length(original_filename) between 1 and 255),
  content_type text not null,
  size_bytes bigint not null
    check (size_bytes between 1 and 15728640),
  upload_status text not null default 'pending'
    check (upload_status in ('pending', 'consumed')),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  consumed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint signature_voice_replacement_upload_state_check check (
    (upload_status = 'pending' and consumed_at is null)
    or (upload_status = 'consumed' and consumed_at is not null)
  )
);

alter table public.signature_voice_replacement_uploads enable row level security;
revoke all on table public.signature_voice_replacement_uploads from public, anon, authenticated;
grant select, insert, update, delete on table public.signature_voice_replacement_uploads to service_role;

create index if not exists signature_voice_replacement_uploads_expiry_idx
  on public.signature_voice_replacement_uploads (upload_status, expires_at, created_at);

comment on table public.signature_voice_replacement_uploads is
  'Private staging registry for Admin replacement uploads; pending rows make abandoned objects reclaimable.';

create table if not exists public.signature_voice_audit_events (
  event_id uuid primary key default gen_random_uuid(),
  order_id uuid not null
    references public.orders(order_id) on delete restrict,
  cart_item_id uuid not null
    references public.cart_items(cart_item_id) on delete restrict,
  creation_id uuid not null
    references public.creations(creation_id) on delete restrict,
  source_asset_id uuid null,
  actor_customer_id uuid not null
    references public.customers(customer_id) on delete restrict,
  event_type text not null
    check (event_type in (
      'source_accessed',
      'technical_triage_updated',
      'adult_declaration_triage_updated',
      'source_replaced'
    )),
  previous_status text null,
  next_status text null,
  reason text null
    check (reason is null or char_length(reason) between 1 and 1000),
  authorization_reference text null
    check (authorization_reference is null or char_length(authorization_reference) between 1 and 500),
  declared_subject_name text null
    check (declared_subject_name is null or char_length(declared_subject_name) between 1 and 120),
  declared_subject_relationship text null
    check (
      declared_subject_relationship is null
      or declared_subject_relationship in (
        'self',
        'parent_or_guardian',
        'family_member',
        'other_authorized_adult'
      )
    ),
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

alter table public.signature_voice_audit_events enable row level security;
revoke all on table public.signature_voice_audit_events from public, anon, authenticated;
grant select, insert on table public.signature_voice_audit_events to service_role;

create index if not exists signature_voice_audit_events_creation_idx
  on public.signature_voice_audit_events (creation_id, created_at desc);

create index if not exists signature_voice_audit_events_order_idx
  on public.signature_voice_audit_events (order_id, created_at desc);

comment on table public.signature_voice_audit_events is
  'Immutable actor-attributed Signature Voice source access, triage and replacement history.';

create or replace function public.reject_signature_voice_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'signature_voice_audit_is_immutable' using errcode = '55000';
end;
$$;

drop trigger if exists signature_voice_audit_immutable_guard
  on public.signature_voice_audit_events;
create trigger signature_voice_audit_immutable_guard
before update or delete on public.signature_voice_audit_events
for each row execute function public.reject_signature_voice_audit_mutation();

revoke all on function public.reject_signature_voice_audit_mutation()
  from public, anon, authenticated;

create or replace function public.set_signature_voice_source_triage(
  p_order_id uuid,
  p_cart_item_id uuid,
  p_creation_id uuid,
  p_admin_customer_id uuid,
  p_expected_updated_at timestamptz,
  p_technical_status text,
  p_technical_reason text,
  p_adult_declaration_status text,
  p_adult_declaration_reason text
)
returns table (
  out_creation_id uuid,
  out_source_revision integer,
  out_technical_status text,
  out_technical_reason text,
  out_technical_reviewed_by uuid,
  out_technical_reviewed_at timestamptz,
  out_adult_declaration_status text,
  out_adult_declaration_reason text,
  out_adult_declaration_reviewed_by uuid,
  out_adult_declaration_reviewed_at timestamptz,
  out_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creation public.creations%rowtype;
  v_state public.signature_voice_production_states%rowtype;
  v_existing boolean := false;
  v_now timestamptz := clock_timestamp();
  v_technical_reason text := nullif(btrim(coalesce(p_technical_reason, '')), '');
  v_adult_reason text := nullif(btrim(coalesce(p_adult_declaration_reason, '')), '');
begin
  if not exists (
    select 1
    from public.customers admin_customer
    where admin_customer.customer_id = p_admin_customer_id
      and admin_customer.role::text = 'admin'
  ) then
    raise exception 'admin_access_required' using errcode = '42501';
  end if;

  if p_technical_status not in ('pending', 'accepted', 'rejected')
    or p_adult_declaration_status not in ('pending', 'accepted', 'rejected') then
    raise exception 'signature_voice_triage_status_invalid' using errcode = '22023';
  end if;
  if p_technical_status = 'rejected' and v_technical_reason is null then
    raise exception 'signature_voice_technical_rejection_reason_required' using errcode = '22023';
  end if;
  if p_adult_declaration_status = 'rejected' and v_adult_reason is null then
    raise exception 'signature_voice_adult_rejection_reason_required' using errcode = '22023';
  end if;
  if coalesce(char_length(v_technical_reason), 0) > 1000
    or coalesce(char_length(v_adult_reason), 0) > 1000 then
    raise exception 'signature_voice_triage_reason_too_long' using errcode = '22023';
  end if;

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
    and creation.voice_asset_id is not null
  for update of creation;

  if not found then
    raise exception 'signature_voice_order_item_not_found' using errcode = 'P0002';
  end if;

  select state.*
  into v_state
  from public.signature_voice_production_states state
  where state.creation_id = p_creation_id
  for update;
  v_existing := found;

  if v_existing then
    if p_expected_updated_at is null
      or v_state.updated_at is distinct from p_expected_updated_at then
      raise exception 'signature_voice_triage_changed' using errcode = '40001';
    end if;
  elsif p_expected_updated_at is not null then
    raise exception 'signature_voice_triage_changed' using errcode = '40001';
  end if;

  if not v_existing then
    insert into public.signature_voice_production_states (
      creation_id,
      source_revision
    )
    values (
      p_creation_id,
      1
    )
    returning * into v_state;
  end if;

  if v_state.technical_status is distinct from p_technical_status
    or v_state.technical_reason is distinct from (
      case when p_technical_status = 'rejected' then v_technical_reason else null end
    ) then
    insert into public.signature_voice_audit_events (
      order_id,
      cart_item_id,
      creation_id,
      source_asset_id,
      actor_customer_id,
      event_type,
      previous_status,
      next_status,
      reason,
      declared_subject_name,
      declared_subject_relationship,
      metadata
    )
    values (
      p_order_id,
      p_cart_item_id,
      p_creation_id,
      v_creation.voice_asset_id,
      p_admin_customer_id,
      'technical_triage_updated',
      v_state.technical_status,
      p_technical_status,
      case when p_technical_status = 'rejected' then v_technical_reason else null end,
      v_creation.voice_subject_name,
      v_creation.voice_subject_relationship,
      jsonb_build_object('source_revision', v_state.source_revision)
    );
  end if;

  if v_state.adult_declaration_status is distinct from p_adult_declaration_status
    or v_state.adult_declaration_reason is distinct from (
      case when p_adult_declaration_status = 'rejected' then v_adult_reason else null end
    ) then
    insert into public.signature_voice_audit_events (
      order_id,
      cart_item_id,
      creation_id,
      source_asset_id,
      actor_customer_id,
      event_type,
      previous_status,
      next_status,
      reason,
      declared_subject_name,
      declared_subject_relationship,
      metadata
    )
    values (
      p_order_id,
      p_cart_item_id,
      p_creation_id,
      v_creation.voice_asset_id,
      p_admin_customer_id,
      'adult_declaration_triage_updated',
      v_state.adult_declaration_status,
      p_adult_declaration_status,
      case when p_adult_declaration_status = 'rejected' then v_adult_reason else null end,
      v_creation.voice_subject_name,
      v_creation.voice_subject_relationship,
      jsonb_build_object('source_revision', v_state.source_revision)
    );
  end if;

  update public.signature_voice_production_states state
  set technical_status = p_technical_status,
      technical_reason = case when p_technical_status = 'rejected' then v_technical_reason else null end,
      technical_reviewed_by = case when p_technical_status = 'pending' then null else p_admin_customer_id end,
      technical_reviewed_at = case when p_technical_status = 'pending' then null else v_now end,
      adult_declaration_status = p_adult_declaration_status,
      adult_declaration_reason = case when p_adult_declaration_status = 'rejected' then v_adult_reason else null end,
      adult_declaration_reviewed_by = case when p_adult_declaration_status = 'pending' then null else p_admin_customer_id end,
      adult_declaration_reviewed_at = case when p_adult_declaration_status = 'pending' then null else v_now end,
      updated_at = v_now
  where state.creation_id = p_creation_id
  returning * into v_state;

  return query
  select
    v_state.creation_id,
    v_state.source_revision,
    v_state.technical_status,
    v_state.technical_reason,
    v_state.technical_reviewed_by,
    v_state.technical_reviewed_at,
    v_state.adult_declaration_status,
    v_state.adult_declaration_reason,
    v_state.adult_declaration_reviewed_by,
    v_state.adult_declaration_reviewed_at,
    v_state.updated_at;
end;
$$;

revoke all on function public.set_signature_voice_source_triage(
  uuid, uuid, uuid, uuid, timestamptz, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.set_signature_voice_source_triage(
  uuid, uuid, uuid, uuid, timestamptz, text, text, text, text
) to service_role;

create or replace function public.record_signature_voice_source_access(
  p_order_id uuid,
  p_cart_item_id uuid,
  p_creation_id uuid,
  p_asset_id uuid,
  p_admin_customer_id uuid,
  p_access_mode text,
  p_range_requested boolean default false
)
returns table (
  out_asset_id uuid,
  out_bucket_name text,
  out_storage_path text,
  out_content_type text,
  out_size_bytes bigint,
  out_duration_seconds numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.user_assets%rowtype;
begin
  if p_access_mode not in ('playback', 'download') then
    raise exception 'signature_voice_access_mode_invalid' using errcode = '22023';
  end if;
  if not exists (
    select 1
    from public.customers admin_customer
    where admin_customer.customer_id = p_admin_customer_id
      and admin_customer.role::text = 'admin'
  ) then
    raise exception 'admin_access_required' using errcode = '42501';
  end if;

  select asset.*
  into v_asset
  from public.orders purchase_order
  join public.cart_items item
    on item.order_id = purchase_order.order_id
  join public.creations creation
    on creation.creation_id = item.creation_id
  join public.user_assets asset
    on asset.asset_id = creation.voice_asset_id
  where purchase_order.order_id = p_order_id
    and purchase_order.payment_id is not null
    and item.cart_item_id = p_cart_item_id
    and item.status::text = 'ordered'
    and lower(coalesce(item.package_type::text, '')) = 'supreme'
    and creation.creation_id = p_creation_id
    and creation.voice_asset_id = p_asset_id
    and asset.asset_type::text = 'voice_sample';

  if not found then
    raise exception 'signature_voice_source_not_found' using errcode = 'P0002';
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
    p_asset_id,
    p_admin_customer_id,
    'source_accessed',
    jsonb_build_object(
      'access_mode', p_access_mode,
      'range_requested', coalesce(p_range_requested, false)
    )
  );

  return query
  select
    v_asset.asset_id,
    'raw-private'::text,
    v_asset.storage_path,
    nullif(v_asset.metadata ->> 'content_type', ''),
    case
      when (v_asset.metadata ->> 'size_bytes') ~ '^[0-9]+$'
        then (v_asset.metadata ->> 'size_bytes')::bigint
      else null
    end,
    case
      when (v_asset.metadata ->> 'duration_seconds') ~ '^[0-9]+([.][0-9]+)?$'
        then (v_asset.metadata ->> 'duration_seconds')::numeric
      else null
    end;
end;
$$;

revoke all on function public.record_signature_voice_source_access(
  uuid, uuid, uuid, uuid, uuid, text, boolean
) from public, anon, authenticated;
grant execute on function public.record_signature_voice_source_access(
  uuid, uuid, uuid, uuid, uuid, text, boolean
) to service_role;

create or replace function public.replace_signature_voice_source(
  p_order_id uuid,
  p_cart_item_id uuid,
  p_creation_id uuid,
  p_admin_customer_id uuid,
  p_expected_asset_id uuid,
  p_new_asset_id uuid,
  p_new_storage_path text,
  p_new_content_type text,
  p_new_size_bytes bigint,
  p_new_duration_seconds numeric,
  p_new_sha256 text,
  p_new_original_name text,
  p_reason text,
  p_authorization_reference text,
  p_subject_name text,
  p_subject_relationship text
)
returns table (
  out_creation_id uuid,
  out_new_asset_id uuid,
  out_old_asset_id uuid,
  out_source_revision integer,
  out_updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_creation public.creations%rowtype;
  v_old_asset public.user_assets%rowtype;
  v_state public.signature_voice_production_states%rowtype;
  v_upload public.signature_voice_replacement_uploads%rowtype;
  v_now timestamptz := clock_timestamp();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_authorization_reference text := nullif(btrim(coalesce(p_authorization_reference, '')), '');
  v_subject_name text := nullif(btrim(coalesce(p_subject_name, '')), '');
  v_other_binding_exists boolean := false;
begin
  if not exists (
    select 1
    from public.customers admin_customer
    where admin_customer.customer_id = p_admin_customer_id
      and admin_customer.role::text = 'admin'
  ) then
    raise exception 'admin_access_required' using errcode = '42501';
  end if;
  if v_reason is null or char_length(v_reason) > 1000 then
    raise exception 'signature_voice_replacement_reason_required' using errcode = '22023';
  end if;
  if v_authorization_reference is null or char_length(v_authorization_reference) > 500 then
    raise exception 'signature_voice_authorization_reference_required' using errcode = '22023';
  end if;
  if v_subject_name is null or char_length(v_subject_name) > 120
    or p_subject_relationship not in (
      'self',
      'parent_or_guardian',
      'family_member',
      'other_authorized_adult'
    ) then
    raise exception 'signature_voice_subject_declaration_invalid' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_new_storage_path, '')), '') is null
    or p_new_content_type not in (
      'audio/webm',
      'audio/mp4',
      'audio/mpeg',
      'audio/wav',
      'audio/x-wav',
      'audio/ogg',
      'audio/x-m4a'
    )
    or p_new_size_bytes <= 0
    or p_new_size_bytes > 15728640
    or p_new_duration_seconds < 10
    or p_new_duration_seconds > 20
    or p_new_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'signature_voice_replacement_file_invalid' using errcode = '22023';
  end if;

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

  if not found then
    raise exception 'signature_voice_order_item_not_found' using errcode = 'P0002';
  end if;
  if v_creation.voice_asset_id is distinct from p_expected_asset_id then
    raise exception 'signature_voice_source_changed' using errcode = '40001';
  end if;

  select upload.*
  into v_upload
  from public.signature_voice_replacement_uploads upload
  where upload.asset_id = p_new_asset_id
  for update;
  if not found
    or v_upload.upload_status <> 'pending'
    or v_upload.expires_at <= v_now
    or v_upload.order_id is distinct from p_order_id
    or v_upload.cart_item_id is distinct from p_cart_item_id
    or v_upload.creation_id is distinct from p_creation_id
    or v_upload.expected_asset_id is distinct from p_expected_asset_id
    or v_upload.admin_customer_id is distinct from p_admin_customer_id
    or v_upload.storage_path is distinct from p_new_storage_path
    or v_upload.original_filename is distinct from p_new_original_name
    or v_upload.content_type is distinct from p_new_content_type
    or v_upload.size_bytes is distinct from p_new_size_bytes then
    raise exception 'signature_voice_replacement_upload_invalid' using errcode = '23514';
  end if;

  select asset.*
  into v_old_asset
  from public.user_assets asset
  where asset.asset_id = v_creation.voice_asset_id
  for update;
  if not found then
    raise exception 'signature_voice_source_not_found' using errcode = 'P0002';
  end if;

  insert into public.user_assets (
    asset_id,
    owner_type,
    anon_session_id,
    customer_id,
    asset_type,
    storage_path,
    metadata
  )
  values (
    p_new_asset_id,
    v_creation.owner_type,
    v_creation.anon_session_id,
    v_creation.customer_id,
    'voice_sample',
    p_new_storage_path,
    jsonb_build_object(
      'role', 'voice',
      'created_for', 'signature_voice_replacement',
      'source', 'admin_replacement',
      'original_name', left(coalesce(p_new_original_name, ''), 255),
      'content_type', p_new_content_type,
      'size_bytes', p_new_size_bytes,
      'duration_seconds', p_new_duration_seconds,
      'sha256', p_new_sha256,
      'replaced_by', p_admin_customer_id,
      'replaced_at', v_now
    )
  );

  update public.creations creation
  set voice_asset_id = p_new_asset_id,
      voice_sample_duration_seconds = p_new_duration_seconds,
      voice_subject_name = v_subject_name,
      voice_subject_relationship = p_subject_relationship,
      voice_bound_at = v_now,
      updated_at = v_now
  where creation.creation_id = p_creation_id;

  insert into public.signature_voice_production_states (
    creation_id,
    source_revision,
    technical_status,
    adult_declaration_status,
    updated_at
  )
  values (
    p_creation_id,
    2,
    'pending',
    'pending',
    v_now
  )
  on conflict (creation_id) do update
  set source_revision = public.signature_voice_production_states.source_revision + 1,
      technical_status = 'pending',
      technical_reason = null,
      technical_reviewed_by = null,
      technical_reviewed_at = null,
      adult_declaration_status = 'pending',
      adult_declaration_reason = null,
      adult_declaration_reviewed_by = null,
      adult_declaration_reviewed_at = null,
      updated_at = v_now
  returning * into v_state;

  insert into public.signature_voice_audit_events (
    order_id,
    cart_item_id,
    creation_id,
    source_asset_id,
    actor_customer_id,
    event_type,
    reason,
    authorization_reference,
    declared_subject_name,
    declared_subject_relationship,
    metadata
  )
  values (
    p_order_id,
    p_cart_item_id,
    p_creation_id,
    p_new_asset_id,
    p_admin_customer_id,
    'source_replaced',
    v_reason,
    v_authorization_reference,
    v_subject_name,
    p_subject_relationship,
    jsonb_build_object(
      'old_asset_id', v_old_asset.asset_id,
      'new_asset_id', p_new_asset_id,
      'source_revision', v_state.source_revision,
      'size_bytes', p_new_size_bytes,
      'duration_seconds', p_new_duration_seconds,
      'sha256', p_new_sha256
    )
  );

  update public.signature_voice_replacement_uploads upload
  set upload_status = 'consumed',
      consumed_at = v_now,
      updated_at = v_now
  where upload.asset_id = p_new_asset_id;

  select exists (
    select 1
    from public.creations other_creation
    where other_creation.voice_asset_id = v_old_asset.asset_id
  )
  into v_other_binding_exists;

  if not v_other_binding_exists then
    if nullif(btrim(coalesce(v_old_asset.storage_path, '')), '') is not null then
      insert into public.user_asset_cleanup_outbox (
        asset_id,
        asset_type,
        bucket_name,
        storage_path,
        reason,
        cleanup_status,
        next_attempt_at,
        updated_at
      )
      values (
        v_old_asset.asset_id,
        v_old_asset.asset_type::text,
        'raw-private',
        v_old_asset.storage_path,
        'admin_replacement',
        'pending',
        v_now + interval '30 days',
        v_now
      )
      on conflict (bucket_name, storage_path) do update
      set reason = 'admin_replacement',
          cleanup_status = 'pending',
          next_attempt_at = greatest(
            public.user_asset_cleanup_outbox.next_attempt_at,
            v_now + interval '30 days'
          ),
          updated_at = v_now;
    end if;

    delete from public.user_assets asset
    where asset.asset_id = v_old_asset.asset_id;
  end if;

  return query
  select
    p_creation_id,
    p_new_asset_id,
    v_old_asset.asset_id,
    v_state.source_revision,
    v_state.updated_at;
end;
$$;

revoke all on function public.replace_signature_voice_source(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, bigint, numeric, text, text,
  text, text, text, text
) from public, anon, authenticated;
grant execute on function public.replace_signature_voice_source(
  uuid, uuid, uuid, uuid, uuid, uuid, text, text, bigint, numeric, text, text,
  text, text, text, text
) to service_role;

create or replace function public.enqueue_expired_signature_voice_replacement_uploads(
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
    raise exception 'signature_voice_replacement_cleanup_input_invalid' using errcode = '22023';
  end if;

  with candidates as (
    select upload.asset_id
    from public.signature_voice_replacement_uploads upload
    where upload.upload_status = 'pending'
      and upload.expires_at <= p_cutoff
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
      next_attempt_at,
      updated_at
    )
    select
      upload.asset_id,
      'voice_sample',
      'raw-private',
      upload.storage_path,
      'admin_replacement',
      'pending',
      now(),
      now()
    from public.signature_voice_replacement_uploads upload
    join candidates candidate on candidate.asset_id = upload.asset_id
    on conflict (bucket_name, storage_path) do update
    set cleanup_status = 'pending',
        processing_token = null,
        claimed_at = null,
        next_attempt_at = now(),
        updated_at = now()
    returning asset_id
  ), removed as (
    delete from public.signature_voice_replacement_uploads upload
    using candidates candidate
    where upload.asset_id = candidate.asset_id
    returning upload.asset_id
  )
  select
    (select count(*)::integer from queued),
    (select count(*)::integer from removed)
  into v_enqueued, v_removed;

  if v_enqueued <> v_removed then
    raise exception 'signature_voice_replacement_cleanup_count_mismatch'
      using errcode = 'P0001';
  end if;

  return v_enqueued;
end;
$$;

revoke all on function public.enqueue_expired_signature_voice_replacement_uploads(
  timestamptz, integer
) from public, anon, authenticated;
grant execute on function public.enqueue_expired_signature_voice_replacement_uploads(
  timestamptz, integer
) to service_role;
