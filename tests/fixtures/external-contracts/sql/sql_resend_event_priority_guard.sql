-- M6 hotfix: terminal provider outcomes must not be downgraded by a later,
-- lower-priority webhook event. Apply after sql_resend_event_operations.sql.

begin;

do $$
begin
  if to_regclass('public.email_events') is null
    or to_regclass('public.resend_webhook_events') is null
    or to_regprocedure(
      'public.reconcile_resend_delivery_event(text,text,text,timestamp with time zone,jsonb)'
    ) is null then
    raise exception 'M5 Resend event operations schema must be applied first';
  end if;
end;
$$;

create or replace function public.reconcile_resend_delivery_event(
  p_webhook_event_id text,
  p_provider_email_id text,
  p_event_type text,
  p_event_created_at timestamptz,
  p_event_detail jsonb default '{}'::jsonb
)
returns table(matched boolean, applied boolean, matched_email_event_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email_event public.email_events%rowtype;
  v_status text;
  v_priority integer;
  v_apply boolean := false;
  v_detail jsonb := coalesce(p_event_detail, '{}'::jsonb);
begin
  v_status := case p_event_type
    when 'email.sent' then 'sent'
    when 'email.delivered' then 'delivered'
    when 'email.delivery_delayed' then 'delayed'
    when 'email.bounced' then 'bounced'
    when 'email.complained' then 'complained'
    when 'email.failed' then 'failed'
    when 'email.suppressed' then 'suppressed'
    else null
  end;
  v_priority := case p_event_type
    when 'email.sent' then 10
    when 'email.delivery_delayed' then 20
    when 'email.delivered' then 30
    when 'email.bounced' then 40
    when 'email.failed' then 40
    when 'email.suppressed' then 50
    when 'email.complained' then 60
    else null
  end;

  if v_status is null or p_event_created_at is null
    or p_provider_email_id is null or char_length(trim(p_provider_email_id)) not between 1 and 500
    or octet_length(v_detail::text) > 4000 then
    raise exception 'resend_delivery_event_invalid' using errcode = '22023';
  end if;

  select * into v_email_event
  from public.email_events
  where resend_message_id = trim(p_provider_email_id)
  for update;

  if not found then
    update public.resend_webhook_events
    set
      processing_status = 'pending_match',
      processing_started_at = null,
      last_error = 'provider_message_id_not_matched',
      updated_at = now()
    where webhook_event_id = trim(p_webhook_event_id);
    return query select false, false, null::uuid;
    return;
  end if;

  v_apply :=
    v_email_event.provider_event_priority is null
    or v_priority > v_email_event.provider_event_priority
    or (
      v_priority = v_email_event.provider_event_priority
      and (
        v_email_event.provider_event_at is null
        or p_event_created_at >= v_email_event.provider_event_at
      )
    );

  if v_apply then
    update public.email_events
    set
      provider_delivery_status = v_status,
      provider_event_type = p_event_type,
      provider_event_at = p_event_created_at,
      provider_event_priority = v_priority,
      provider_delivery_detail = v_detail,
      updated_at = now()
    where email_event_id = v_email_event.email_event_id;
  end if;

  update public.resend_webhook_events
  set
    processing_status = 'processed',
    processing_started_at = null,
    last_error = null,
    processed_at = now(),
    updated_at = now()
  where webhook_event_id = trim(p_webhook_event_id);

  return query select true, v_apply, v_email_event.email_event_id;
end;
$$;

revoke all on function public.reconcile_resend_delivery_event(
  text, text, text, timestamptz, jsonb
) from public, anon, authenticated;

grant execute on function public.reconcile_resend_delivery_event(
  text, text, text, timestamptz, jsonb
) to service_role;

commit;
