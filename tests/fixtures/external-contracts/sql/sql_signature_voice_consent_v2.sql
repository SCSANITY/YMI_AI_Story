-- Signature Voice consent v2: authorization before upload and server-owned preview binding.
-- Run after sql_signature_voice_fulfillment_gates.sql and before deploying the matching code.
-- SQL Editor safe: no explicit transaction, temporary table or cross-statement workset.

create table if not exists public.signature_voice_capture_authorizations (
  authorization_id uuid primary key default gen_random_uuid(),
  reserved_asset_id uuid not null unique,
  reserved_storage_path text not null unique
    check (nullif(btrim(reserved_storage_path), '') is not null),
  confirmed_asset_id uuid null unique,
  owner_type public.owner_type not null,
  anon_session_id uuid null references public.anon_sessions(anon_session_id),
  customer_id uuid null references public.customers(customer_id),
  consent_version text not null
    check (consent_version = 'signature-voice-consent-v2'),
  speaker_kind text not null
    check (speaker_kind in ('current_child', 'adult')),
  accepted_at timestamptz not null default clock_timestamp(),
  confirmed_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint signature_voice_capture_authorization_owner_check check (
    (owner_type::text = 'anon' and anon_session_id is not null and customer_id is null)
    or
    (owner_type::text = 'customer' and customer_id is not null and anon_session_id is null)
  ),
  constraint signature_voice_capture_authorization_confirmation_check check (
    (confirmed_asset_id is null and confirmed_at is null)
    or
    (confirmed_asset_id = reserved_asset_id and confirmed_at is not null)
  )
);

alter table public.signature_voice_capture_authorizations enable row level security;
revoke all on table public.signature_voice_capture_authorizations from public, anon, authenticated;
grant select, insert, update, delete on table public.signature_voice_capture_authorizations to service_role;

create index if not exists signature_voice_capture_authorizations_owner_idx
  on public.signature_voice_capture_authorizations (
    owner_type,
    customer_id,
    anon_session_id,
    created_at desc
  );

comment on table public.signature_voice_capture_authorizations is
  'Immutable server-stamped authorization reserved before Signature Voice bytes may be uploaded.';

alter table public.creations
  add column if not exists voice_capture_authorization_id uuid null;

alter table public.creations
  add column if not exists voice_speaker_kind text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.creations'::regclass
      and constraint_row.conname = 'creations_voice_capture_authorization_id_fkey'
  ) then
    alter table public.creations
      add constraint creations_voice_capture_authorization_id_fkey
      foreign key (voice_capture_authorization_id)
      references public.signature_voice_capture_authorizations(authorization_id)
      on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.creations'::regclass
      and constraint_row.conname = 'creations_voice_capture_v2_shape_check'
  ) then
    alter table public.creations
      add constraint creations_voice_capture_v2_shape_check check (
        (
          voice_consent_version = 'signature-voice-consent-v2'
          and voice_capture_authorization_id is not null
          and voice_speaker_kind in ('current_child', 'adult')
        )
        or
        (
          voice_consent_version is distinct from 'signature-voice-consent-v2'
          and voice_capture_authorization_id is null
          and voice_speaker_kind is null
        )
      );
  end if;
end $$;

create index if not exists creations_voice_capture_authorization_idx
  on public.creations (voice_capture_authorization_id)
  where voice_capture_authorization_id is not null;

create or replace function public.reserve_signature_voice_capture_authorization(
  p_owner_type text,
  p_anon_session_id uuid,
  p_customer_id uuid,
  p_asset_id uuid,
  p_storage_path text,
  p_consent_version text,
  p_speaker_kind text
)
returns table (
  out_authorization_id uuid,
  out_accepted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorization public.signature_voice_capture_authorizations%rowtype;
begin
  if p_asset_id is null
    or nullif(btrim(coalesce(p_storage_path, '')), '') is null
    or p_consent_version is distinct from 'signature-voice-consent-v2'
    or p_speaker_kind not in ('current_child', 'adult') then
    raise exception 'signature_voice_capture_authorization_invalid' using errcode = '22023';
  end if;
  if p_owner_type not in ('anon', 'customer') then
    raise exception 'signature_voice_capture_owner_invalid' using errcode = '22023';
  end if;
  if p_owner_type = 'anon' and (p_anon_session_id is null or p_customer_id is not null) then
    raise exception 'signature_voice_capture_owner_invalid' using errcode = '22023';
  end if;
  if p_owner_type = 'customer' and (p_customer_id is null or p_anon_session_id is not null) then
    raise exception 'signature_voice_capture_owner_invalid' using errcode = '22023';
  end if;

  insert into public.signature_voice_capture_authorizations (
    reserved_asset_id,
    reserved_storage_path,
    owner_type,
    anon_session_id,
    customer_id,
    consent_version,
    speaker_kind
  )
  values (
    p_asset_id,
    p_storage_path,
    p_owner_type::public.owner_type,
    case when p_owner_type = 'anon' then p_anon_session_id else null end,
    case when p_owner_type = 'customer' then p_customer_id else null end,
    p_consent_version,
    p_speaker_kind
  )
  returning
    authorization_id,
    reserved_asset_id,
    reserved_storage_path,
    confirmed_asset_id,
    owner_type,
    anon_session_id,
    customer_id,
    consent_version,
    speaker_kind,
    accepted_at,
    confirmed_at,
    created_at
  into v_authorization;

  return query select v_authorization.authorization_id, v_authorization.accepted_at;
end;
$$;

revoke all on function public.reserve_signature_voice_capture_authorization(
  text, uuid, uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.reserve_signature_voice_capture_authorization(
  text, uuid, uuid, uuid, text, text, text
) to service_role;

create or replace function public.confirm_signature_voice_capture(
  p_authorization_id uuid,
  p_asset_id uuid,
  p_owner_type text,
  p_anon_session_id uuid,
  p_customer_id uuid,
  p_storage_path text,
  p_metadata jsonb
)
returns table (
  out_asset_id uuid,
  out_owner_type public.owner_type,
  out_anon_session_id uuid,
  out_customer_id uuid,
  out_asset_type public.asset_type,
  out_storage_path text,
  out_metadata jsonb,
  out_created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorization public.signature_voice_capture_authorizations%rowtype;
  v_asset public.user_assets%rowtype;
begin
  if p_authorization_id is null or p_asset_id is null
    or nullif(btrim(coalesce(p_storage_path, '')), '') is null
    or p_metadata is null then
    raise exception 'signature_voice_capture_confirmation_invalid' using errcode = '22023';
  end if;

  select
    capture_auth.authorization_id,
    capture_auth.reserved_asset_id,
    capture_auth.reserved_storage_path,
    capture_auth.confirmed_asset_id,
    capture_auth.owner_type,
    capture_auth.anon_session_id,
    capture_auth.customer_id,
    capture_auth.consent_version,
    capture_auth.speaker_kind,
    capture_auth.accepted_at,
    capture_auth.confirmed_at,
    capture_auth.created_at
  into v_authorization
  from public.signature_voice_capture_authorizations capture_auth
  where capture_auth.authorization_id = p_authorization_id
  for update;

  if not found
    or v_authorization.reserved_asset_id is distinct from p_asset_id
    or v_authorization.reserved_storage_path is distinct from p_storage_path
    or v_authorization.owner_type::text is distinct from p_owner_type
    or v_authorization.anon_session_id is distinct from p_anon_session_id
    or v_authorization.customer_id is distinct from p_customer_id then
    raise exception 'signature_voice_capture_authorization_not_found' using errcode = 'P0002';
  end if;

  if v_authorization.confirmed_at is not null then
    select
      asset.asset_id,
      asset.owner_type,
      asset.anon_session_id,
      asset.customer_id,
      asset.asset_type,
      asset.storage_path,
      asset.metadata,
      asset.created_at
    into v_asset
    from public.user_assets asset
    where asset.asset_id = v_authorization.confirmed_asset_id;
    if not found then
      raise exception 'signature_voice_capture_confirmation_inconsistent' using errcode = '23514';
    end if;
    if v_asset.storage_path is distinct from p_storage_path then
      raise exception 'signature_voice_capture_confirmation_path_mismatch' using errcode = '23514';
    end if;
  else
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
      p_asset_id,
      p_owner_type::public.owner_type,
      p_anon_session_id,
      p_customer_id,
      'voice_sample',
      p_storage_path,
      p_metadata || jsonb_build_object(
        'authorization_id', p_authorization_id,
        'speaker_kind', v_authorization.speaker_kind,
        'consent_version', v_authorization.consent_version
      )
    )
    returning
      asset_id,
      owner_type,
      anon_session_id,
      customer_id,
      asset_type,
      storage_path,
      metadata,
      created_at
    into v_asset;

    update public.signature_voice_capture_authorizations capture_auth
    set confirmed_asset_id = p_asset_id,
        confirmed_at = clock_timestamp()
    where capture_auth.authorization_id = p_authorization_id;
  end if;

  return query select
    v_asset.asset_id,
    v_asset.owner_type,
    v_asset.anon_session_id,
    v_asset.customer_id,
    v_asset.asset_type,
    v_asset.storage_path,
    v_asset.metadata,
    v_asset.created_at;
end;
$$;

revoke all on function public.confirm_signature_voice_capture(
  uuid, uuid, text, uuid, uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.confirm_signature_voice_capture(
  uuid, uuid, text, uuid, uuid, text, jsonb
) to service_role;

create or replace function public.enqueue_stale_signature_voice_capture_uploads(
  p_cutoff timestamptz,
  p_limit integer default 50
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer := 0;
begin
  if p_cutoff is null or p_limit not between 1 and 200 then
    raise exception 'signature_voice_capture_cleanup_input_invalid' using errcode = '22023';
  end if;

  with candidates as (
    select capture_auth.reserved_asset_id
    from public.signature_voice_capture_authorizations capture_auth
    where capture_auth.confirmed_at is null
      and capture_auth.created_at < p_cutoff
    order by capture_auth.created_at, capture_auth.authorization_id
    for update of capture_auth skip locked
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
      capture_auth.reserved_asset_id,
      'voice_sample_unconfirmed',
      'raw-private',
      capture_auth.reserved_storage_path,
      'orphan_expiry',
      'pending',
      null,
      null,
      now(),
      now()
    from candidates
    join public.signature_voice_capture_authorizations capture_auth
      on capture_auth.reserved_asset_id = candidates.reserved_asset_id
    on conflict (bucket_name, storage_path) do update
    set cleanup_status = 'pending',
        processing_token = null,
        claimed_at = null,
        next_attempt_at = least(public.user_asset_cleanup_outbox.next_attempt_at, now()),
        updated_at = now()
    returning public.user_asset_cleanup_outbox.asset_id
  )
  delete from public.signature_voice_capture_authorizations capture_auth
  using queued
  where capture_auth.reserved_asset_id = queued.asset_id
    and capture_auth.confirmed_at is null;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.enqueue_stale_signature_voice_capture_uploads(timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.enqueue_stale_signature_voice_capture_uploads(timestamptz, integer)
  to service_role;

create or replace function public.enforce_creation_voice_authorization_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_authorization public.signature_voice_capture_authorizations%rowtype;
  v_expected_name text;
  v_authorized_asset_matches boolean := false;
begin
  if new.voice_consent_version is distinct from 'signature-voice-consent-v2' then
    if new.voice_capture_authorization_id is not null or new.voice_speaker_kind is not null then
      raise exception 'signature_voice_v2_fields_without_v2_consent' using errcode = '23514';
    end if;
    return new;
  end if;

  select
    capture_auth.authorization_id,
    capture_auth.reserved_asset_id,
    capture_auth.reserved_storage_path,
    capture_auth.confirmed_asset_id,
    capture_auth.owner_type,
    capture_auth.anon_session_id,
    capture_auth.customer_id,
    capture_auth.consent_version,
    capture_auth.speaker_kind,
    capture_auth.accepted_at,
    capture_auth.confirmed_at,
    capture_auth.created_at
  into v_authorization
  from public.signature_voice_capture_authorizations capture_auth
  where capture_auth.authorization_id = new.voice_capture_authorization_id
    and capture_auth.confirmed_at is not null;

  if found then
    v_authorized_asset_matches := v_authorization.confirmed_asset_id is not distinct from new.voice_asset_id;
    if not v_authorized_asset_matches and tg_op = 'UPDATE' then
      v_authorized_asset_matches :=
        new.voice_capture_authorization_id is not distinct from old.voice_capture_authorization_id
        and new.voice_asset_id is distinct from old.voice_asset_id
        and v_authorization.confirmed_asset_id is not distinct from old.voice_asset_id;
    end if;
  end if;

  if not found
    or not v_authorized_asset_matches
    or v_authorization.owner_type::text is distinct from new.owner_type::text
    or v_authorization.anon_session_id is distinct from new.anon_session_id
    or v_authorization.customer_id is distinct from new.customer_id
    or v_authorization.accepted_at is distinct from new.voice_consent_accepted_at
    or v_authorization.speaker_kind is distinct from new.voice_speaker_kind then
    raise exception 'signature_voice_v2_authorization_mismatch' using errcode = '23514';
  end if;

  if v_authorization.speaker_kind = 'current_child' then
    v_expected_name := nullif(btrim(coalesce(
      new.customize_snapshot #>> '{textOverrides,child_name}',
      new.customize_snapshot #>> '{text_overrides,child_name}',
      ''
    )), '');
    if v_expected_name is null
      or new.voice_subject_name is distinct from v_expected_name
      or new.voice_subject_relationship is distinct from 'parent_or_guardian' then
      raise exception 'signature_voice_child_authorization_mismatch' using errcode = '23514';
    end if;
  elsif new.voice_subject_name is distinct from 'Adult narrator'
    or new.voice_subject_relationship is distinct from 'self' then
    raise exception 'signature_voice_adult_authorization_mismatch' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists creations_voice_authorization_v2_guard on public.creations;
create trigger creations_voice_authorization_v2_guard
before insert or update of voice_asset_id, voice_consent_version, voice_capture_authorization_id,
  voice_speaker_kind on public.creations
for each row execute function public.enforce_creation_voice_authorization_v2();

revoke all on function public.enforce_creation_voice_authorization_v2()
  from public, anon, authenticated;

-- Drop the sixteen-argument form first. A partial run then fails visibly instead of
-- leaving two overloads that both accept the legacy call shape.
drop function if exists public.create_preview_job(
  text, uuid, uuid, text, jsonb, text, text, jsonb, jsonb, text, text,
  uuid, numeric, text, text, text
);

create or replace function public.create_preview_job(
  p_owner_type text,
  p_anon_session_id uuid,
  p_customer_id uuid,
  p_template_id text,
  p_customize_snapshot jsonb,
  p_face_source_path text,
  p_config_url text,
  p_text_overrides jsonb default null,
  p_params jsonb default null,
  p_story_language text default 'English',
  p_selected_book_type text default 'Classic',
  p_voice_asset_id uuid default null,
  p_voice_sample_duration_seconds numeric default null,
  p_voice_consent_version text default null,
  p_voice_subject_name text default null,
  p_voice_subject_relationship text default null,
  p_voice_authorization_id uuid default null
)
returns table (
  creation_id uuid,
  job_id uuid
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_creation_id uuid;
  v_job_id uuid;
  v_voice_accepted_at timestamptz;
  v_voice_duration numeric;
  v_voice_consent_version text;
  v_voice_subject_name text;
  v_voice_subject_relationship text;
  v_voice_speaker_kind text;
  v_authorization public.signature_voice_capture_authorizations%rowtype;
  v_voice_asset public.user_assets%rowtype;
begin
  if p_owner_type not in ('anon', 'customer') then
    raise exception 'preview_owner_invalid' using errcode = '22023';
  end if;
  if p_owner_type = 'anon' and (p_anon_session_id is null or p_customer_id is not null) then
    raise exception 'preview_owner_invalid' using errcode = '22023';
  end if;
  if p_owner_type = 'customer' and (p_customer_id is null or p_anon_session_id is not null) then
    raise exception 'preview_owner_invalid' using errcode = '22023';
  end if;
  if nullif(btrim(p_template_id), '') is null then
    raise exception 'template_id_required' using errcode = '22023';
  end if;
  if nullif(btrim(p_face_source_path), '') is null then
    raise exception 'face_source_path_required' using errcode = '22023';
  end if;
  if nullif(btrim(p_config_url), '') is null then
    raise exception 'config_url_required' using errcode = '22023';
  end if;

  if p_selected_book_type = 'Signature Voice' then
    if p_voice_authorization_id is not null then
      select
        capture_auth.authorization_id,
        capture_auth.reserved_asset_id,
        capture_auth.reserved_storage_path,
        capture_auth.confirmed_asset_id,
        capture_auth.owner_type,
        capture_auth.anon_session_id,
        capture_auth.customer_id,
        capture_auth.consent_version,
        capture_auth.speaker_kind,
        capture_auth.accepted_at,
        capture_auth.confirmed_at,
        capture_auth.created_at
      into v_authorization
      from public.signature_voice_capture_authorizations capture_auth
      where capture_auth.authorization_id = p_voice_authorization_id
        and capture_auth.confirmed_asset_id = p_voice_asset_id
        and capture_auth.confirmed_at is not null
        and capture_auth.owner_type::text = p_owner_type
        and capture_auth.anon_session_id is not distinct from p_anon_session_id
        and capture_auth.customer_id is not distinct from p_customer_id
      for update;

      if not found then
        raise exception 'signature_voice_v2_authorization_invalid' using errcode = '23514';
      end if;
      select
        asset.asset_id,
        asset.owner_type,
        asset.anon_session_id,
        asset.customer_id,
        asset.asset_type,
        asset.storage_path,
        asset.metadata,
        asset.created_at
      into v_voice_asset
      from public.user_assets asset
      where asset.asset_id = p_voice_asset_id;
      if not found
        or v_voice_asset.asset_type::text is distinct from 'voice_sample'
        or nullif(btrim(coalesce(v_voice_asset.storage_path, '')), '') is null then
        raise exception 'signature_voice_binding_invalid' using errcode = '23514';
      end if;
      v_voice_duration := (v_voice_asset.metadata ->> 'duration_seconds')::numeric;
      if v_voice_duration not between 10 and 20 then
        raise exception 'signature_voice_binding_invalid' using errcode = '23514';
      end if;

      v_voice_accepted_at := v_authorization.accepted_at;
      v_voice_consent_version := v_authorization.consent_version;
      v_voice_speaker_kind := v_authorization.speaker_kind;
      if v_voice_speaker_kind = 'current_child' then
        v_voice_subject_name := nullif(btrim(coalesce(p_text_overrides ->> 'child_name', '')), '');
        v_voice_subject_relationship := 'parent_or_guardian';
      else
        v_voice_subject_name := 'Adult narrator';
        v_voice_subject_relationship := 'self';
      end if;
      if v_voice_subject_name is null then
        raise exception 'signature_voice_subject_declaration_invalid' using errcode = '23514';
      end if;
    else
      if p_voice_asset_id is null
        or p_voice_sample_duration_seconds is null
        or p_voice_sample_duration_seconds not between 10 and 20
        or p_voice_consent_version is distinct from 'signature-voice-consent-v1'
        or char_length(btrim(coalesce(p_voice_subject_name, ''))) not between 1 and 120
        or p_voice_subject_relationship not in (
          'self', 'parent_or_guardian', 'family_member', 'other_authorized_adult'
        ) then
        raise exception 'signature_voice_binding_invalid' using errcode = '23514';
      end if;
      v_voice_duration := p_voice_sample_duration_seconds;
      v_voice_consent_version := p_voice_consent_version;
      v_voice_subject_name := nullif(btrim(p_voice_subject_name), '');
      v_voice_subject_relationship := p_voice_subject_relationship;
      v_voice_accepted_at := clock_timestamp();
    end if;
  elsif p_voice_asset_id is not null
    or p_voice_sample_duration_seconds is not null
    or p_voice_consent_version is not null
    or p_voice_subject_name is not null
    or p_voice_subject_relationship is not null
    or p_voice_authorization_id is not null then
    raise exception 'signature_voice_binding_package_mismatch' using errcode = '23514';
  end if;

  insert into public.creations (
    owner_type, anon_session_id, customer_id, template_id, customize_snapshot, preview_job_id,
    voice_asset_id, voice_sample_duration_seconds, voice_consent_version,
    voice_consent_accepted_at, voice_bound_at, voice_subject_name,
    voice_subject_relationship, voice_capture_authorization_id, voice_speaker_kind
  )
  values (
    p_owner_type::public.owner_type,
    case when p_owner_type = 'anon' then p_anon_session_id else null end,
    case when p_owner_type = 'customer' then p_customer_id else null end,
    p_template_id, coalesce(p_customize_snapshot, '{}'::jsonb), null,
    p_voice_asset_id, v_voice_duration, v_voice_consent_version,
    v_voice_accepted_at, v_voice_accepted_at, v_voice_subject_name,
    v_voice_subject_relationship, p_voice_authorization_id, v_voice_speaker_kind
  )
  returning public.creations.creation_id into v_creation_id;

  insert into public.jobs (
    owner_type, anon_session_id, customer_id, template_id, creation_id, job_type,
    story_language, selected_book_type, status, progress, input_snapshot
  )
  values (
    p_owner_type::public.owner_type,
    case when p_owner_type = 'anon' then p_anon_session_id else null end,
    case when p_owner_type = 'customer' then p_customer_id else null end,
    p_template_id, v_creation_id, 'preview'::public.job_type, p_story_language,
    p_selected_book_type, 'queued'::public.job_status, 0,
    jsonb_build_object(
      'face_source_path', p_face_source_path,
      'config_url', p_config_url,
      'text_overrides', p_text_overrides,
      'params', p_params
    )
  )
  returning public.jobs.job_id into v_job_id;

  update public.creations creation
  set preview_job_id = v_job_id,
      customize_snapshot = jsonb_set(
        coalesce(creation.customize_snapshot, '{}'::jsonb),
        '{previewJobId}', to_jsonb(v_job_id::text), true
      )
  where creation.creation_id = v_creation_id;

  return query select v_creation_id, v_job_id;
end;
$function$;

revoke all on function public.create_preview_job(
  text, uuid, uuid, text, jsonb, text, text, jsonb, jsonb, text, text,
  uuid, numeric, text, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.create_preview_job(
  text, uuid, uuid, text, jsonb, text, text, jsonb, jsonb, text, text,
  uuid, numeric, text, text, text, uuid
) to service_role;
