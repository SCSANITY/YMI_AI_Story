-- Signature Voice consent v3: one unified authorization for child or adult recordings.
-- Run after sql_signature_voice_consent_v2.sql and before deploying the matching code.
-- SQL Editor safe: no explicit transaction, temporary table or cross-statement workset.

do $block$
begin
  alter table public.signature_voice_capture_authorizations
    drop constraint if exists signature_voice_capture_authorizations_consent_version_check;
  alter table public.signature_voice_capture_authorizations
    drop constraint if exists signature_voice_capture_authorizations_speaker_kind_check;
  alter table public.signature_voice_capture_authorizations
    drop constraint if exists signature_voice_capture_authorizations_version_speaker_check;
  alter table public.signature_voice_capture_authorizations
    add constraint signature_voice_capture_authorizations_version_speaker_check check (
      (
        consent_version = 'signature-voice-consent-v2'
        and speaker_kind in ('current_child', 'adult')
      )
      or
      (
        consent_version = 'signature-voice-consent-v3'
        and speaker_kind = 'authorized_speaker'
      )
    ) not valid;
  alter table public.signature_voice_capture_authorizations
    validate constraint signature_voice_capture_authorizations_version_speaker_check;
end
$block$;

do $block$
begin
  alter table public.creations
    drop constraint if exists creations_voice_binding_complete_check;
  alter table public.creations
    add constraint creations_voice_binding_complete_check check (
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
        and voice_subject_relationship in (
          'self',
          'parent_or_guardian',
          'family_member',
          'other_authorized_adult',
          'authorized_submitter'
        )
      )
    ) not valid;
  alter table public.creations
    validate constraint creations_voice_binding_complete_check;
end
$block$;

do $block$
begin
  alter table public.creations
    drop constraint if exists creations_voice_capture_v2_shape_check;
  alter table public.creations
    add constraint creations_voice_capture_v2_shape_check check (
      (
        voice_consent_version = 'signature-voice-consent-v2'
        and voice_capture_authorization_id is not null
        and voice_speaker_kind in ('current_child', 'adult')
      )
      or
      (
        voice_consent_version = 'signature-voice-consent-v3'
        and voice_capture_authorization_id is not null
        and voice_speaker_kind = 'authorized_speaker'
      )
      or
      (
        voice_consent_version not in (
          'signature-voice-consent-v2',
          'signature-voice-consent-v3'
        )
        and voice_capture_authorization_id is null
        and voice_speaker_kind is null
      )
      or
      (
        voice_consent_version is null
        and voice_capture_authorization_id is null
        and voice_speaker_kind is null
      )
    ) not valid;
  alter table public.creations
    validate constraint creations_voice_capture_v2_shape_check;
end
$block$;

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
as $function$
declare
  v_authorization_id uuid;
  v_accepted_at timestamptz;
begin
  if p_asset_id is null
    or nullif(btrim(coalesce(p_storage_path, '')), '') is null
    or p_consent_version is distinct from 'signature-voice-consent-v3'
    or p_speaker_kind is distinct from 'authorized_speaker' then
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
  returning authorization_id, accepted_at
  into v_authorization_id, v_accepted_at;

  return query select v_authorization_id, v_accepted_at;
end;
$function$;

revoke all on function public.reserve_signature_voice_capture_authorization(
  text, uuid, uuid, uuid, text, text, text
) from public, anon, authenticated;
grant execute on function public.reserve_signature_voice_capture_authorization(
  text, uuid, uuid, uuid, text, text, text
) to service_role;

create or replace function public.enforce_creation_voice_authorization_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_authorization public.signature_voice_capture_authorizations%rowtype;
  v_expected_name text;
  v_authorized_asset_matches boolean := false;
begin
  if new.voice_consent_version not in (
    'signature-voice-consent-v2',
    'signature-voice-consent-v3'
  ) or new.voice_consent_version is null then
    if new.voice_capture_authorization_id is not null or new.voice_speaker_kind is not null then
      raise exception 'signature_voice_capture_fields_without_capture_consent' using errcode = '23514';
    end if;
    return new;
  end if;

  select capture_auth.*
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
    or v_authorization.consent_version is distinct from new.voice_consent_version
    or v_authorization.speaker_kind is distinct from new.voice_speaker_kind then
    raise exception 'signature_voice_capture_authorization_mismatch' using errcode = '23514';
  end if;

  if v_authorization.consent_version = 'signature-voice-consent-v2' then
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
    elsif v_authorization.speaker_kind = 'adult' then
      if new.voice_subject_name is distinct from 'Adult narrator'
        or new.voice_subject_relationship is distinct from 'self' then
        raise exception 'signature_voice_adult_authorization_mismatch' using errcode = '23514';
      end if;
    else
      raise exception 'signature_voice_v2_authorization_mismatch' using errcode = '23514';
    end if;
  elsif v_authorization.consent_version = 'signature-voice-consent-v3' then
    if v_authorization.speaker_kind is distinct from 'authorized_speaker'
      or new.voice_subject_name is distinct from 'Authorized narrator'
      or new.voice_subject_relationship is distinct from 'authorized_submitter' then
      raise exception 'signature_voice_v3_authorization_mismatch' using errcode = '23514';
    end if;
  else
    raise exception 'signature_voice_capture_authorization_mismatch' using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke all on function public.enforce_creation_voice_authorization_v2()
  from public, anon, authenticated;

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
      select capture_auth.*
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
        raise exception 'signature_voice_capture_authorization_invalid' using errcode = '23514';
      end if;
      if not (
        (
          v_authorization.consent_version = 'signature-voice-consent-v2'
          and v_authorization.speaker_kind in ('current_child', 'adult')
        )
        or
        (
          v_authorization.consent_version = 'signature-voice-consent-v3'
          and v_authorization.speaker_kind = 'authorized_speaker'
        )
      ) then
        raise exception 'signature_voice_capture_authorization_invalid' using errcode = '23514';
      end if;

      select asset.*
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
      if v_voice_consent_version = 'signature-voice-consent-v2'
        and v_voice_speaker_kind = 'current_child' then
        v_voice_subject_name := nullif(btrim(coalesce(p_text_overrides ->> 'child_name', '')), '');
        v_voice_subject_relationship := 'parent_or_guardian';
      elsif v_voice_consent_version = 'signature-voice-consent-v2'
        and v_voice_speaker_kind = 'adult' then
        v_voice_subject_name := 'Adult narrator';
        v_voice_subject_relationship := 'self';
      else
        v_voice_subject_name := 'Authorized narrator';
        v_voice_subject_relationship := 'authorized_submitter';
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
