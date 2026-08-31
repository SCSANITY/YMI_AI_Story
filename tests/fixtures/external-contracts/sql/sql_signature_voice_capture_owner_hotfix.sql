-- T4 Signature Voice owner validation hotfix.
-- Safe to run repeatedly in the Supabase SQL Editor.

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
