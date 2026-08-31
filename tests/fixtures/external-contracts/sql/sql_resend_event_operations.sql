-- YMI root-domain inbound email M5: unified Resend event boundary and operations.
--
-- Run after sql_root_email_attachment_persistence.sql.

begin;

do $$
begin
  if to_regclass('public.email_events') is null
    or to_regclass('public.inbound_email_envelopes') is null
    or to_regclass('public.inbound_email_attachments') is null then
    raise exception 'Email events and M1-M4 inbound schema must be applied first';
  end if;

  if exists (
    select 1
    from public.email_events
    where resend_message_id is not null
    group by resend_message_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate email_events.resend_message_id values must be resolved before M5';
  end if;
end;
$$;

alter table public.email_events
  add column if not exists provider_delivery_status text,
  add column if not exists provider_event_type text,
  add column if not exists provider_event_at timestamptz,
  add column if not exists provider_event_priority integer,
  add column if not exists provider_delivery_detail jsonb not null default '{}'::jsonb;

alter table public.email_events
  drop constraint if exists email_events_provider_delivery_status_check,
  drop constraint if exists email_events_provider_event_type_length_check,
  drop constraint if exists email_events_provider_event_priority_check,
  drop constraint if exists email_events_provider_delivery_detail_size_check;

alter table public.email_events
  add constraint email_events_provider_delivery_status_check
    check (
      provider_delivery_status is null
      or provider_delivery_status in (
        'sent', 'delivered', 'delayed', 'bounced', 'complained', 'failed', 'suppressed'
      )
    ),
  add constraint email_events_provider_event_type_length_check
    check (provider_event_type is null or char_length(provider_event_type) <= 100),
  add constraint email_events_provider_event_priority_check
    check (provider_event_priority is null or provider_event_priority between 1 and 100),
  add constraint email_events_provider_delivery_detail_size_check
    check (octet_length(provider_delivery_detail::text) <= 4000);

create unique index if not exists email_events_resend_message_id_key
  on public.email_events(resend_message_id)
  where resend_message_id is not null;

create index if not exists email_events_provider_delivery_status_idx
  on public.email_events(provider_delivery_status, provider_event_at desc)
  where provider_delivery_status is not null;

create table if not exists public.resend_webhook_events (
  webhook_event_id text primary key,
  event_type text not null,
  provider_email_id text,
  event_created_at timestamptz not null,
  event_detail jsonb not null default '{}'::jsonb,
  processing_status text not null default 'processing',
  attempt_count integer not null default 1,
  processing_started_at timestamptz,
  last_error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint resend_webhook_events_id_length_check
    check (char_length(webhook_event_id) between 1 and 500),
  constraint resend_webhook_events_type_length_check
    check (char_length(event_type) between 1 and 100),
  constraint resend_webhook_events_provider_id_length_check
    check (provider_email_id is null or char_length(provider_email_id) between 1 and 500),
  constraint resend_webhook_events_detail_size_check
    check (octet_length(event_detail::text) <= 4000),
  constraint resend_webhook_events_status_check
    check (processing_status in ('processing', 'processed', 'ignored', 'pending_match', 'failed')),
  constraint resend_webhook_events_attempt_count_check
    check (attempt_count >= 1),
  constraint resend_webhook_events_error_length_check
    check (last_error is null or char_length(last_error) <= 500)
);

create index if not exists resend_webhook_events_status_idx
  on public.resend_webhook_events(processing_status, updated_at, received_at);

create index if not exists resend_webhook_events_type_received_idx
  on public.resend_webhook_events(event_type, received_at desc);

create index if not exists resend_webhook_events_provider_email_idx
  on public.resend_webhook_events(provider_email_id, event_created_at desc)
  where provider_email_id is not null;

alter table public.resend_webhook_events enable row level security;

revoke all on table public.resend_webhook_events from public, anon, authenticated;
grant select, insert, update, delete on table public.resend_webhook_events to service_role;

create or replace function public.claim_resend_webhook_event(
  p_webhook_event_id text,
  p_event_type text,
  p_provider_email_id text,
  p_event_created_at timestamptz,
  p_event_detail jsonb default '{}'::jsonb,
  p_stale_after_seconds integer default 120
)
returns table(claimed boolean, event_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.resend_webhook_events%rowtype;
  v_now timestamptz := now();
  v_event_id text := trim(p_webhook_event_id);
  v_event_type text := trim(p_event_type);
  v_provider_id text := nullif(trim(p_provider_email_id), '');
  v_detail jsonb := coalesce(p_event_detail, '{}'::jsonb);
begin
  if v_event_id is null or char_length(v_event_id) not between 1 and 500
    or v_event_type is null or char_length(v_event_type) not between 1 and 100
    or p_event_created_at is null
    or (v_provider_id is not null and char_length(v_provider_id) > 500)
    or octet_length(v_detail::text) > 4000 then
    raise exception 'resend_webhook_event_invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_event_id, 0));

  select * into v_existing
  from public.resend_webhook_events
  where webhook_event_id = v_event_id
  for update;

  if not found then
    insert into public.resend_webhook_events (
      webhook_event_id,
      event_type,
      provider_email_id,
      event_created_at,
      event_detail,
      processing_status,
      attempt_count,
      processing_started_at,
      received_at,
      updated_at
    ) values (
      v_event_id,
      v_event_type,
      v_provider_id,
      p_event_created_at,
      v_detail,
      'processing',
      1,
      v_now,
      v_now,
      v_now
    );
    return query select true, 'processing'::text;
    return;
  end if;

  if v_existing.event_type <> v_event_type
    or v_existing.provider_email_id is distinct from v_provider_id
    or v_existing.event_created_at <> p_event_created_at then
    raise exception 'resend_webhook_event_identity_conflict' using errcode = '23505';
  end if;

  if v_existing.processing_status in ('processed', 'ignored') then
    return query select false, v_existing.processing_status;
    return;
  end if;

  if v_existing.processing_status = 'processing'
    and v_existing.processing_started_at >
      v_now - pg_catalog.make_interval(secs => greatest(p_stale_after_seconds, 30)) then
    return query select false, 'processing'::text;
    return;
  end if;

  if v_existing.processing_status = 'pending_match'
    and v_existing.updated_at > v_now - interval '30 seconds' then
    return query select false, 'pending_match'::text;
    return;
  end if;

  update public.resend_webhook_events
  set
    event_detail = v_detail,
    processing_status = 'processing',
    attempt_count = attempt_count + 1,
    processing_started_at = v_now,
    last_error = null,
    updated_at = v_now
  where webhook_event_id = v_event_id;

  return query select true, 'processing'::text;
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

revoke all on function public.claim_resend_webhook_event(
  text, text, text, timestamptz, jsonb, integer
) from public, anon, authenticated;
revoke all on function public.reconcile_resend_delivery_event(
  text, text, text, timestamptz, jsonb
) from public, anon, authenticated;

grant execute on function public.claim_resend_webhook_event(
  text, text, text, timestamptz, jsonb, integer
) to service_role;
grant execute on function public.reconcile_resend_delivery_event(
  text, text, text, timestamptz, jsonb
) to service_role;

commit;
