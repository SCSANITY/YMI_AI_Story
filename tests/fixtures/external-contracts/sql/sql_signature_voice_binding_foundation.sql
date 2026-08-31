-- Signature Voice S1: authoritative Creation binding and safe asset deletion.
-- Apply in Supabase SQL Editor BEFORE deploying the matching application code.
--
-- This file is intentionally convergent under per-statement commits:
-- - no explicit transaction or temporary tables;
-- - additive/idempotent DDL only;
-- - no legacy data remap or inferred voice binding;
-- - every multi-row mutation lives inside one RPC statement.

alter table public.creations
  add column if not exists voice_asset_id uuid null;

alter table public.creations
  add column if not exists voice_sample_duration_seconds numeric(5, 2) null;

alter table public.creations
  add column if not exists voice_consent_version text null;

alter table public.creations
  add column if not exists voice_consent_accepted_at timestamptz null;

alter table public.creations
  add column if not exists voice_bound_at timestamptz null;

alter table public.creations
  add column if not exists voice_subject_name text null;

alter table public.creations
  add column if not exists voice_subject_relationship text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'creations_voice_asset_id_fkey'
      and conrelid = 'public.creations'::regclass
  ) then
    alter table public.creations
      add constraint creations_voice_asset_id_fkey
      foreign key (voice_asset_id)
      references public.user_assets(asset_id)
      on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'creations_voice_binding_complete_check'
      and conrelid = 'public.creations'::regclass
  ) then
    alter table public.creations
      add constraint creations_voice_binding_complete_check
      check (
        (
          voice_asset_id is null
          and voice_sample_duration_seconds is null
          and voice_consent_version is null
          and voice_consent_accepted_at is null
          and voice_bound_at is null
          and voice_subject_name is null
          and voice_subject_relationship is null
        )
        or
        (
          voice_asset_id is not null
          and voice_sample_duration_seconds is not null
          and voice_sample_duration_seconds between 10 and 20
          and voice_consent_version is not null
          and voice_consent_version ~ '^signature-voice-consent-v[1-9][0-9]*$'
          and voice_consent_accepted_at is not null
          and voice_bound_at is not null
          and voice_bound_at >= voice_consent_accepted_at
          and voice_subject_name is not null
          and char_length(btrim(voice_subject_name)) between 1 and 120
          and voice_subject_relationship is not null
          and voice_subject_relationship in (
            'self',
            'parent_or_guardian',
            'family_member',
            'other_authorized_adult'
          )
        )
      );
  end if;
end $$;

create index if not exists creations_voice_asset_id_idx
  on public.creations (voice_asset_id)
  where voice_asset_id is not null;

comment on column public.creations.voice_asset_id is
  'Single authoritative Signature Voice source association. Pre-existing Creations remain NULL; no historical voice asset is inferred.';

comment on column public.creations.voice_consent_version is
  'Immutable meaning is defined by the code-owned Signature Voice consent registry.';

create or replace function public.enforce_creation_voice_binding()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.user_assets%rowtype;
  v_package_type text;
begin
  if new.voice_asset_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.voice_asset_id is not distinct from old.voice_asset_id then
      return new;
    end if;
  end if;

  select asset.*
  into v_asset
  from public.user_assets asset
  where asset.asset_id = new.voice_asset_id;

  if not found then
    raise exception 'signature_voice_asset_not_found' using errcode = '23503';
  end if;

  if v_asset.asset_type::text <> 'voice_sample' then
    raise exception 'signature_voice_asset_type_invalid' using errcode = '23514';
  end if;

  if nullif(btrim(v_asset.storage_path), '') is null then
    raise exception 'signature_voice_asset_storage_missing' using errcode = '23514';
  end if;

  if v_asset.owner_type::text is distinct from new.owner_type::text
    or v_asset.customer_id is distinct from new.customer_id
    or v_asset.anon_session_id is distinct from new.anon_session_id then
    raise exception 'signature_voice_asset_owner_mismatch' using errcode = '23514';
  end if;

  v_package_type := lower(coalesce(
    new.customize_snapshot #>> '{textOverrides,book_type}',
    new.customize_snapshot #>> '{textOverrides,bookType}',
    new.customize_snapshot #>> '{text_overrides,book_type}',
    new.customize_snapshot #>> '{text_overrides,bookType}',
    new.customize_snapshot ->> 'book_type',
    new.customize_snapshot ->> 'bookType',
    ''
  ));

  if v_package_type <> 'supreme' then
    raise exception 'signature_voice_requires_supreme_package' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists creations_voice_binding_guard on public.creations;
create trigger creations_voice_binding_guard
before insert or update of voice_asset_id on public.creations
for each row execute function public.enforce_creation_voice_binding();

revoke all on function public.enforce_creation_voice_binding() from public, anon, authenticated;

create table if not exists public.user_asset_cleanup_outbox (
  cleanup_id uuid primary key default gen_random_uuid(),
  asset_id uuid not null,
  asset_type text not null,
  bucket_name text not null default 'raw-private'
    check (bucket_name = 'raw-private'),
  storage_path text not null,
  reason text not null
    check (reason in ('owner_delete', 'orphan_expiry', 'admin_replacement')),
  cleanup_status text not null default 'pending'
    check (cleanup_status in ('pending', 'processing')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error text null,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_name, storage_path)
);

alter table public.user_asset_cleanup_outbox enable row level security;
revoke all on table public.user_asset_cleanup_outbox from public, anon, authenticated;
grant select, insert, update, delete on table public.user_asset_cleanup_outbox to service_role;

comment on table public.user_asset_cleanup_outbox is
  'Durable private-object deletion work. Business rows are removed only after this path is preserved.';

create index if not exists user_asset_cleanup_outbox_due_idx
  on public.user_asset_cleanup_outbox (cleanup_status, next_attempt_at, created_at);

create or replace function public.delete_owned_unbound_user_asset(
  p_asset_id uuid,
  p_owner_type text,
  p_anon_session_id uuid,
  p_customer_id uuid
)
returns table (
  out_cleanup_id uuid,
  out_bucket_name text,
  out_storage_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_asset public.user_assets%rowtype;
  v_cleanup_id uuid;
begin
  if p_owner_type not in ('anon', 'customer') then
    raise exception 'user_asset_owner_invalid' using errcode = '22023';
  end if;
  if p_owner_type = 'anon' and (p_anon_session_id is null or p_customer_id is not null) then
    raise exception 'user_asset_owner_invalid' using errcode = '22023';
  end if;
  if p_owner_type = 'customer' and (p_customer_id is null or p_anon_session_id is not null) then
    raise exception 'user_asset_owner_invalid' using errcode = '22023';
  end if;

  select asset.*
  into v_asset
  from public.user_assets asset
  where asset.asset_id = p_asset_id
  for update;

  if not found then
    raise exception 'user_asset_not_found' using errcode = 'P0002';
  end if;

  if v_asset.owner_type::text <> p_owner_type
    or v_asset.anon_session_id is distinct from p_anon_session_id
    or v_asset.customer_id is distinct from p_customer_id then
    raise exception 'user_asset_owner_mismatch' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.creations creation
    where creation.voice_asset_id = p_asset_id
  ) then
    raise exception 'voice_asset_bound' using errcode = '23503';
  end if;

  if nullif(btrim(v_asset.storage_path), '') is not null then
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
      v_asset.asset_id,
      v_asset.asset_type::text,
      'raw-private',
      v_asset.storage_path,
      'owner_delete',
      'pending',
      now(),
      now()
    )
    on conflict (bucket_name, storage_path) do update
    set cleanup_status = 'pending',
        next_attempt_at = now(),
        updated_at = now()
    returning public.user_asset_cleanup_outbox.cleanup_id into v_cleanup_id;
  end if;

  delete from public.user_assets asset
  where asset.asset_id = v_asset.asset_id;

  return query
  select v_cleanup_id, 'raw-private'::text, v_asset.storage_path;
end;
$$;

create or replace function public.finish_user_asset_cleanup(p_cleanup_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.user_asset_cleanup_outbox
  where cleanup_id = p_cleanup_id;
  return found;
end;
$$;

create or replace function public.fail_user_asset_cleanup(
  p_cleanup_id uuid,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.user_asset_cleanup_outbox
  set cleanup_status = 'pending',
      attempt_count = attempt_count + 1,
      last_error = left(coalesce(p_error, 'storage deletion failed'), 1000),
      next_attempt_at = now() + interval '1 hour',
      updated_at = now()
  where cleanup_id = p_cleanup_id;
  return found;
end;
$$;

revoke all on function public.delete_owned_unbound_user_asset(uuid, text, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.finish_user_asset_cleanup(uuid)
  from public, anon, authenticated;
revoke all on function public.fail_user_asset_cleanup(uuid, text)
  from public, anon, authenticated;

grant execute on function public.delete_owned_unbound_user_asset(uuid, text, uuid, uuid)
  to service_role;
grant execute on function public.finish_user_asset_cleanup(uuid)
  to service_role;
grant execute on function public.fail_user_asset_cleanup(uuid, text)
  to service_role;
