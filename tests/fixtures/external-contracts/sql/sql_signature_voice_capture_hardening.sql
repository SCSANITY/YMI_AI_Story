-- Signature Voice S2: atomic preview binding and historical orphan cleanup.
-- Run after sql_signature_voice_binding_foundation.sql and before deploying S2 code.
-- This file is convergent under Supabase SQL Editor per-statement autocommit.

-- Remove the former eleven-argument overload first. If execution stops before the
-- replacement is created, callers fail visibly instead of facing ambiguous overloads.
drop function if exists public.create_preview_job(
  text, uuid, uuid, text, jsonb, text, text, jsonb, jsonb, text, text
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
  p_voice_subject_relationship text default null
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
    if p_voice_asset_id is null
      or p_voice_sample_duration_seconds is null
      or p_voice_sample_duration_seconds not between 10 and 20
      or p_voice_consent_version is distinct from 'signature-voice-consent-v1'
      or char_length(btrim(coalesce(p_voice_subject_name, ''))) not between 1 and 120
      or p_voice_subject_relationship not in (
        'self',
        'parent_or_guardian',
        'family_member',
        'other_authorized_adult'
      ) then
      raise exception 'signature_voice_binding_invalid' using errcode = '23514';
    end if;
    v_voice_accepted_at := clock_timestamp();
  elsif p_voice_asset_id is not null
    or p_voice_sample_duration_seconds is not null
    or p_voice_consent_version is not null
    or p_voice_subject_name is not null
    or p_voice_subject_relationship is not null then
    raise exception 'signature_voice_binding_package_mismatch' using errcode = '23514';
  end if;

  insert into public.creations (
    owner_type,
    anon_session_id,
    customer_id,
    template_id,
    customize_snapshot,
    preview_job_id,
    voice_asset_id,
    voice_sample_duration_seconds,
    voice_consent_version,
    voice_consent_accepted_at,
    voice_bound_at,
    voice_subject_name,
    voice_subject_relationship
  )
  values (
    p_owner_type::public.owner_type,
    case when p_owner_type = 'anon' then p_anon_session_id else null end,
    case when p_owner_type = 'customer' then p_customer_id else null end,
    p_template_id,
    coalesce(p_customize_snapshot, '{}'::jsonb),
    null,
    p_voice_asset_id,
    p_voice_sample_duration_seconds,
    p_voice_consent_version,
    v_voice_accepted_at,
    v_voice_accepted_at,
    nullif(btrim(p_voice_subject_name), ''),
    p_voice_subject_relationship
  )
  returning public.creations.creation_id into v_creation_id;

  insert into public.jobs (
    owner_type,
    anon_session_id,
    customer_id,
    template_id,
    creation_id,
    job_type,
    story_language,
    selected_book_type,
    status,
    progress,
    input_snapshot
  )
  values (
    p_owner_type::public.owner_type,
    case when p_owner_type = 'anon' then p_anon_session_id else null end,
    case when p_owner_type = 'customer' then p_customer_id else null end,
    p_template_id,
    v_creation_id,
    'preview'::public.job_type,
    p_story_language,
    p_selected_book_type,
    'queued'::public.job_status,
    0,
    jsonb_build_object(
      'face_source_path', p_face_source_path,
      'config_url', p_config_url,
      'text_overrides', p_text_overrides,
      'params', p_params
    )
  )
  returning public.jobs.job_id into v_job_id;

  update public.creations
  set preview_job_id = v_job_id,
      customize_snapshot = jsonb_set(
        coalesce(customize_snapshot, '{}'::jsonb),
        '{previewJobId}',
        to_jsonb(v_job_id::text),
        true
      )
  where public.creations.creation_id = v_creation_id;

  return query select v_creation_id, v_job_id;
end;
$function$;

revoke all on function public.create_preview_job(
  text, uuid, uuid, text, jsonb, text, text, jsonb, jsonb, text, text,
  uuid, numeric, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_preview_job(
  text, uuid, uuid, text, jsonb, text, text, jsonb, jsonb, text, text,
  uuid, numeric, text, text, text
) to service_role;

alter table public.user_asset_cleanup_outbox
  add column if not exists processing_token uuid null;
alter table public.user_asset_cleanup_outbox
  add column if not exists claimed_at timestamptz null;

create or replace function public.enqueue_expired_unbound_voice_assets(
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
    raise exception 'voice_cleanup_input_invalid' using errcode = '22023';
  end if;

  with candidates as (
    select asset.asset_id
    from public.user_assets asset
    where asset.asset_type::text = 'voice_sample'
      and asset.created_at < p_cutoff
      and nullif(btrim(asset.storage_path), '') is not null
      and not exists (
        select 1
        from public.creations creation
        where creation.voice_asset_id = asset.asset_id
      )
    order by asset.created_at, asset.asset_id
    for update of asset skip locked
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
      asset.asset_id,
      asset.asset_type::text,
      'raw-private',
      asset.storage_path,
      'orphan_expiry',
      'pending',
      null,
      null,
      now(),
      now()
    from public.user_assets asset
    join candidates candidate on candidate.asset_id = asset.asset_id
    on conflict (bucket_name, storage_path) do update
    set cleanup_status = 'pending',
        processing_token = null,
        claimed_at = null,
        next_attempt_at = now(),
        updated_at = now()
    returning asset_id
  )
  delete from public.user_assets asset
  using queued
  where asset.asset_id = queued.asset_id;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function public.claim_user_asset_cleanup(p_limit integer default 50)
returns table (
  out_cleanup_id uuid,
  out_bucket_name text,
  out_storage_path text,
  out_processing_token uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_limit not between 1 and 200 then
    raise exception 'voice_cleanup_input_invalid' using errcode = '22023';
  end if;

  return query
  with due as (
    select cleanup.cleanup_id
    from public.user_asset_cleanup_outbox cleanup
    where (
        cleanup.cleanup_status = 'pending'
        and cleanup.next_attempt_at <= now()
      ) or (
        cleanup.cleanup_status = 'processing'
        and cleanup.claimed_at < now() - interval '15 minutes'
      )
    order by cleanup.created_at, cleanup.cleanup_id
    for update skip locked
    limit p_limit
  )
  update public.user_asset_cleanup_outbox cleanup
  set cleanup_status = 'processing',
      processing_token = gen_random_uuid(),
      claimed_at = now(),
      updated_at = now()
  from due
  where cleanup.cleanup_id = due.cleanup_id
  returning cleanup.cleanup_id,
            cleanup.bucket_name,
            cleanup.storage_path,
            cleanup.processing_token;
end;
$$;

create or replace function public.finish_user_asset_cleanup_claim(
  p_cleanup_id uuid,
  p_processing_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.user_asset_cleanup_outbox cleanup
  where cleanup.cleanup_id = p_cleanup_id
    and cleanup.cleanup_status = 'processing'
    and cleanup.processing_token = p_processing_token;
  return found;
end;
$$;

create or replace function public.fail_user_asset_cleanup_claim(
  p_cleanup_id uuid,
  p_processing_token uuid,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.user_asset_cleanup_outbox cleanup
  set cleanup_status = 'pending',
      attempt_count = cleanup.attempt_count + 1,
      last_error = left(coalesce(p_error, 'storage deletion failed'), 1000),
      processing_token = null,
      claimed_at = null,
      next_attempt_at = now() + make_interval(mins => least(1440, power(2, least(cleanup.attempt_count + 1, 10))::integer)),
      updated_at = now()
  where cleanup.cleanup_id = p_cleanup_id
    and cleanup.cleanup_status = 'processing'
    and cleanup.processing_token = p_processing_token;
  return found;
end;
$$;

revoke all on function public.enqueue_expired_unbound_voice_assets(timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.claim_user_asset_cleanup(integer)
  from public, anon, authenticated;
revoke all on function public.finish_user_asset_cleanup_claim(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.fail_user_asset_cleanup_claim(uuid, uuid, text)
  from public, anon, authenticated;

grant execute on function public.enqueue_expired_unbound_voice_assets(timestamptz, integer)
  to service_role;
grant execute on function public.claim_user_asset_cleanup(integer)
  to service_role;
grant execute on function public.finish_user_asset_cleanup_claim(uuid, uuid)
  to service_role;
grant execute on function public.fail_user_asset_cleanup_claim(uuid, uuid, text)
  to service_role;
