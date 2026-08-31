-- T4-007 S3: standard General Inbox threading, draft, and delivery backend.
-- Run after sql_general_inbox_mail_workspace.sql.
--
-- SQL Editor safe: all DDL is convergent and every state transition that must
-- be atomic lives inside one function invocation.

do $$
begin
  if to_regclass('public.general_mail_threads') is null
    or to_regclass('public.general_mail_messages') is null
    or to_regclass('public.general_mail_attachments') is null then
    raise exception 'T4-007 S2 workspace schema must be applied before S3';
  end if;
end;
$$;

alter table public.general_mail_messages
  add column if not exists send_attempt_count integer not null default 0,
  add column if not exists send_claimed_at timestamptz,
  add column if not exists delivery_observed_at timestamptz,
  add column if not exists delivery_event_priority integer,
  add column if not exists delivery_error text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'general_mail_messages_send_attempt_count_check'
      and conrelid = 'public.general_mail_messages'::regclass
  ) then
    alter table public.general_mail_messages
      add constraint general_mail_messages_send_attempt_count_check
      check (send_attempt_count >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'general_mail_messages_delivery_priority_check'
      and conrelid = 'public.general_mail_messages'::regclass
  ) then
    alter table public.general_mail_messages
      add constraint general_mail_messages_delivery_priority_check
      check (delivery_event_priority is null or delivery_event_priority between 10 and 60);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'general_mail_messages_delivery_error_length_check'
      and conrelid = 'public.general_mail_messages'::regclass
  ) then
    alter table public.general_mail_messages
      add constraint general_mail_messages_delivery_error_length_check
      check (delivery_error is null or char_length(delivery_error) <= 500);
  end if;
end;
$$;

create index if not exists general_mail_messages_pending_send_idx
  on public.general_mail_messages(message_state, send_claimed_at, updated_at)
  where direction = 'outbound' and message_state in ('pending', 'failed');

create or replace function public.project_general_mail_inbound(
  p_inbound_email_id uuid,
  p_reference_ids text[] default '{}'::text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_envelope public.inbound_email_envelopes%rowtype;
  v_thread_id uuid;
  v_mailbox_key text;
begin
  if p_inbound_email_id is null or cardinality(coalesce(p_reference_ids, '{}'::text[])) > 50 then
    raise exception 'general_mail_projection_invalid' using errcode = '22023';
  end if;

  select * into v_envelope
  from public.inbound_email_envelopes
  where inbound_email_id = p_inbound_email_id
    and route_kind in ('general', 'operational_support')
    and processing_checkpoint in ('content_loaded', 'route_applied', 'complete');

  if not found then
    raise exception 'general_mail_envelope_not_ready' using errcode = 'P0001';
  end if;

  v_mailbox_key := case split_part(lower(trim(v_envelope.route_address)), '@', 1)
    when 'admin' then 'admin'
    when 'postmaster' then 'admin'
    when 'abuse' then 'admin'
    when 'hello' then 'hello'
    when 'security' then 'security'
    when 'orders' then 'orders'
    when 'delivery' then 'delivery'
    else null
  end;

  if v_mailbox_key is null then
    raise exception 'general_mail_mailbox_unmapped' using errcode = '22023';
  end if;

  -- One mailbox lock prevents concurrent replies from racing thread rollups.
  perform pg_advisory_xact_lock(hashtextextended('general-mail:' || v_mailbox_key, 0));

  select message.thread_id into v_thread_id
  from public.general_mail_messages message
  where message.source_inbound_email_id = p_inbound_email_id;

  -- Recovery retries must not reopen or mark an already-projected thread unread.
  if v_thread_id is not null then
    return v_thread_id;
  end if;

  -- Candidate order is supplied by the server: direct In-Reply-To first,
  -- then References newest-to-oldest. An ambiguous ID is ignored rather
  -- than guessed into one of several threads.
  select resolved.thread_id into v_thread_id
  from unnest(coalesce(p_reference_ids, '{}'::text[])) with ordinality
    as reference_id(value, priority)
  cross join lateral (
    select min(message.thread_id::text)::uuid as thread_id
    from public.general_mail_messages message
    join public.general_mail_threads thread on thread.thread_id = message.thread_id
    where thread.mailbox_key = v_mailbox_key
      and message.internet_message_id is not null
      and lower(message.internet_message_id) = lower(reference_id.value)
    having count(distinct message.thread_id) = 1
  ) resolved
  where reference_id.value ~ '^<[^<>[:space:]]+>$'
  order by reference_id.priority
  limit 1;

  if v_thread_id is null then
    v_thread_id := v_envelope.inbound_email_id;
    insert into public.general_mail_threads (
      thread_id,
      mailbox_key,
      subject,
      latest_message_at,
      last_inbound_at,
      admin_read_at,
      archived_at,
      created_at,
      updated_at
    ) values (
      v_thread_id,
      v_mailbox_key,
      left(coalesce(nullif(trim(v_envelope.subject), ''), '(No subject)'), 1000),
      v_envelope.created_at,
      v_envelope.created_at,
      v_envelope.admin_read_at,
      v_envelope.archived_at,
      v_envelope.created_at,
      v_envelope.updated_at
    )
    on conflict (thread_id) do nothing;
  end if;

  insert into public.general_mail_messages (
    message_id,
    thread_id,
    direction,
    message_state,
    source_inbound_email_id,
    provider,
    provider_message_id,
    internet_message_id,
    from_address,
    to_addresses,
    subject,
    body_text,
    in_reply_to,
    references_header,
    received_at,
    created_at,
    updated_at
  ) values (
    v_envelope.inbound_email_id,
    v_thread_id,
    'inbound',
    'received',
    v_envelope.inbound_email_id,
    v_envelope.provider,
    v_envelope.provider_email_id,
    v_envelope.internet_message_id,
    coalesce(nullif(trim(v_envelope.from_email), ''), 'unknown@invalid.local'),
    coalesce(v_envelope.to_addresses, '{}'::text[]),
    left(coalesce(nullif(trim(v_envelope.subject), ''), '(No subject)'), 1000),
    v_envelope.body_text,
    v_envelope.in_reply_to,
    v_envelope.references_header,
    v_envelope.created_at,
    v_envelope.created_at,
    v_envelope.updated_at
  )
  on conflict do nothing;

  select message.thread_id into v_thread_id
  from public.general_mail_messages message
  where message.source_inbound_email_id = p_inbound_email_id;

  if v_thread_id is null then
    raise exception 'general_mail_projection_conflict' using errcode = '23505';
  end if;

  insert into public.general_mail_attachments (
    attachment_id,
    message_id,
    source_kind,
    source_inbound_attachment_id,
    original_filename,
    safe_filename,
    content_type,
    content_disposition,
    size_bytes,
    sha256,
    storage_bucket,
    storage_path,
    attachment_state,
    created_at,
    updated_at
  )
  select
    attachment.attachment_id,
    v_envelope.inbound_email_id,
    'inbound_transport',
    attachment.attachment_id,
    attachment.original_filename,
    attachment.safe_filename,
    attachment.served_content_type,
    attachment.content_disposition,
    coalesce(attachment.stored_size_bytes, attachment.declared_size_bytes),
    attachment.sha256,
    attachment.storage_bucket,
    attachment.storage_path,
    attachment.status,
    attachment.created_at,
    attachment.updated_at
  from public.inbound_email_attachments attachment
  where attachment.inbound_email_id = p_inbound_email_id
  on conflict do nothing;

  update public.general_mail_threads
  set
    latest_message_at = greatest(latest_message_at, v_envelope.created_at),
    last_inbound_at = greatest(coalesce(last_inbound_at, v_envelope.created_at), v_envelope.created_at),
    admin_read_at = null,
    archived_at = null,
    updated_at = now()
  where thread_id = v_thread_id;

  return v_thread_id;
end;
$$;

-- S5 replaces the legacy General Inbox UI. Until then, replies sent through
-- the existing route must also appear in the canonical workspace.
create or replace function public.project_general_mail_legacy_reply(
  p_reply_id uuid,
  p_internet_message_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reply public.inbound_email_replies%rowtype;
  v_thread_id uuid;
  v_message_id uuid;
  v_sent_at timestamptz;
begin
  if p_reply_id is null
    or (p_internet_message_id is not null and p_internet_message_id !~ '^<[^<>[:space:]]+>$') then
    raise exception 'general_mail_legacy_reply_invalid' using errcode = '22023';
  end if;

  select * into v_reply
  from public.inbound_email_replies
  where reply_id = p_reply_id;

  if not found then
    raise exception 'general_mail_legacy_reply_not_found' using errcode = 'P0002';
  end if;

  select message.thread_id into v_thread_id
  from public.general_mail_messages message
  where message.source_inbound_email_id = v_reply.inbound_email_id;

  if v_thread_id is null then
    raise exception 'general_mail_legacy_parent_not_projected' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('general-mail-thread:' || v_thread_id::text, 0));

  insert into public.general_mail_messages (
    message_id,
    thread_id,
    direction,
    message_state,
    source_reply_id,
    admin_customer_id,
    email_event_id,
    provider,
    provider_message_id,
    internet_message_id,
    from_address,
    to_addresses,
    reply_to_addresses,
    subject,
    body_text,
    in_reply_to,
    references_header,
    sent_at,
    failed_at,
    created_at,
    updated_at
  ) values (
    v_reply.reply_id,
    v_thread_id,
    'outbound',
    case v_reply.delivery_status
      when 'sent' then 'sent'
      when 'failed' then 'failed'
      else 'pending'
    end,
    v_reply.reply_id,
    v_reply.admin_customer_id,
    v_reply.email_event_id,
    'resend',
    v_reply.provider_email_id,
    p_internet_message_id,
    v_reply.from_email,
    array[v_reply.to_email],
    array[v_reply.reply_to],
    left(coalesce(nullif(trim(v_reply.subject), ''), '(No subject)'), 1000),
    v_reply.body_text,
    v_reply.in_reply_to,
    v_reply.references_header,
    v_reply.sent_at,
    v_reply.failed_at,
    v_reply.created_at,
    v_reply.updated_at
  )
  on conflict do nothing;

  update public.general_mail_messages message
  set
    message_state = case
      when v_reply.delivery_status = 'sent'
        and message.message_state in ('draft', 'pending', 'queued', 'failed', 'canceled')
        then 'sent'
      else message.message_state
    end,
    admin_customer_id = coalesce(message.admin_customer_id, v_reply.admin_customer_id),
    email_event_id = coalesce(message.email_event_id, v_reply.email_event_id),
    provider_message_id = coalesce(message.provider_message_id, v_reply.provider_email_id),
    internet_message_id = coalesce(message.internet_message_id, p_internet_message_id),
    sent_at = coalesce(message.sent_at, v_reply.sent_at),
    failed_at = case when v_reply.delivery_status = 'sent' then null else message.failed_at end,
    updated_at = greatest(message.updated_at, v_reply.updated_at)
  where message.source_reply_id = p_reply_id
  returning message.message_id into v_message_id;

  if v_message_id is null then
    raise exception 'general_mail_legacy_reply_projection_conflict' using errcode = '23505';
  end if;

  v_sent_at := coalesce(v_reply.sent_at, v_reply.updated_at, v_reply.created_at);
  update public.general_mail_threads
  set
    latest_message_at = greatest(latest_message_at, v_sent_at),
    last_outbound_at = greatest(coalesce(last_outbound_at, v_sent_at), v_sent_at),
    admin_read_at = case
      when v_reply.delivery_status = 'sent' then v_sent_at
      else admin_read_at
    end,
    updated_at = greatest(updated_at, v_reply.updated_at)
  where thread_id = v_thread_id;

  return v_message_id;
end;
$$;

create or replace function public.create_general_mail_draft(
  p_message_id uuid,
  p_thread_id uuid,
  p_mailbox_key text,
  p_admin_customer_id uuid,
  p_from_address text,
  p_to_addresses text[],
  p_cc_addresses text[],
  p_bcc_addresses text[],
  p_reply_to_addresses text[],
  p_subject text,
  p_body_text text,
  p_in_reply_to text,
  p_references_header text
)
returns setof public.general_mail_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.general_mail_messages%rowtype;
  v_thread_id uuid := coalesce(p_thread_id, p_message_id);
  v_thread_mailbox text;
  v_now timestamptz := now();
begin
  if p_message_id is null
    or p_mailbox_key not in ('admin', 'hello', 'security', 'orders', 'delivery')
    or not exists (
      select 1 from public.customers
      where customer_id = p_admin_customer_id and role = 'admin'
    ) then
    raise exception 'general_mail_draft_invalid' using errcode = '22023';
  end if;

  select * into v_existing
  from public.general_mail_messages
  where message_id = p_message_id
  for update;

  if found then
    if v_existing.message_state <> 'draft'
      or v_existing.thread_id <> v_thread_id
      or v_existing.from_address is distinct from p_from_address
      or v_existing.to_addresses is distinct from coalesce(p_to_addresses, '{}'::text[])
      or v_existing.cc_addresses is distinct from coalesce(p_cc_addresses, '{}'::text[])
      or v_existing.bcc_addresses is distinct from coalesce(p_bcc_addresses, '{}'::text[])
      or v_existing.reply_to_addresses is distinct from coalesce(p_reply_to_addresses, '{}'::text[])
      or v_existing.subject is distinct from p_subject
      or v_existing.body_text is distinct from p_body_text
      or v_existing.in_reply_to is distinct from p_in_reply_to
      or v_existing.references_header is distinct from p_references_header then
      raise exception 'general_mail_draft_idempotency_conflict' using errcode = '23505';
    end if;
    return query select * from public.general_mail_messages where message_id = p_message_id;
    return;
  end if;

  select mailbox_key into v_thread_mailbox
  from public.general_mail_threads
  where thread_id = v_thread_id
  for update;

  if found and v_thread_mailbox <> p_mailbox_key then
    raise exception 'general_mail_cross_mailbox_thread' using errcode = '22023';
  end if;

  if not found then
    insert into public.general_mail_threads (
      thread_id,
      mailbox_key,
      subject,
      latest_message_at,
      created_at,
      updated_at
    ) values (
      v_thread_id,
      p_mailbox_key,
      p_subject,
      v_now,
      v_now,
      v_now
    );
  end if;

  insert into public.general_mail_messages (
    message_id,
    thread_id,
    direction,
    message_state,
    admin_customer_id,
    provider,
    from_address,
    to_addresses,
    cc_addresses,
    bcc_addresses,
    reply_to_addresses,
    subject,
    body_text,
    in_reply_to,
    references_header,
    created_at,
    updated_at
  ) values (
    p_message_id,
    v_thread_id,
    'outbound',
    'draft',
    p_admin_customer_id,
    'resend',
    p_from_address,
    coalesce(p_to_addresses, '{}'::text[]),
    coalesce(p_cc_addresses, '{}'::text[]),
    coalesce(p_bcc_addresses, '{}'::text[]),
    coalesce(p_reply_to_addresses, '{}'::text[]),
    p_subject,
    p_body_text,
    p_in_reply_to,
    p_references_header,
    v_now,
    v_now
  );

  return query select * from public.general_mail_messages where message_id = p_message_id;
end;
$$;

create or replace function public.update_general_mail_draft(
  p_message_id uuid,
  p_expected_updated_at timestamptz,
  p_admin_customer_id uuid,
  p_to_addresses text[],
  p_cc_addresses text[],
  p_bcc_addresses text[],
  p_subject text,
  p_body_text text
)
returns setof public.general_mail_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.general_mail_messages%rowtype;
  v_now timestamptz := now();
begin
  if not exists (
    select 1 from public.customers
    where customer_id = p_admin_customer_id and role = 'admin'
  ) then
    raise exception 'general_mail_draft_invalid' using errcode = '22023';
  end if;

  select * into v_message
  from public.general_mail_messages
  where message_id = p_message_id
  for update;

  if not found then
    raise exception 'general_mail_draft_not_found' using errcode = 'P0002';
  end if;
  if v_message.message_state <> 'draft' then
    raise exception 'general_mail_draft_locked' using errcode = 'P0001';
  end if;
  if v_message.updated_at <> p_expected_updated_at then
    raise exception 'general_mail_draft_stale' using errcode = '40001';
  end if;

  update public.general_mail_messages
  set
    admin_customer_id = p_admin_customer_id,
    to_addresses = coalesce(p_to_addresses, '{}'::text[]),
    cc_addresses = coalesce(p_cc_addresses, '{}'::text[]),
    bcc_addresses = coalesce(p_bcc_addresses, '{}'::text[]),
    subject = p_subject,
    body_text = p_body_text,
    updated_at = v_now
  where message_id = p_message_id;

  update public.general_mail_threads
  set subject = p_subject, updated_at = v_now
  where thread_id = v_message.thread_id;

  return query select * from public.general_mail_messages where message_id = p_message_id;
end;
$$;

create or replace function public.claim_general_mail_send(
  p_message_id uuid,
  p_expected_updated_at timestamptz,
  p_admin_customer_id uuid,
  p_stale_after_seconds integer default 120
)
returns setof public.general_mail_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.general_mail_messages%rowtype;
  v_now timestamptz := now();
begin
  if not exists (
    select 1 from public.customers
    where customer_id = p_admin_customer_id and role = 'admin'
  ) then
    raise exception 'general_mail_send_invalid' using errcode = '22023';
  end if;

  select * into v_message
  from public.general_mail_messages
  where message_id = p_message_id
  for update;

  if not found then
    raise exception 'general_mail_draft_not_found' using errcode = 'P0002';
  end if;
  if v_message.direction <> 'outbound'
    or cardinality(v_message.to_addresses) = 0
    or nullif(trim(coalesce(v_message.body_text, '')), '') is null then
    raise exception 'general_mail_send_invalid' using errcode = '22023';
  end if;
  if v_message.updated_at <> p_expected_updated_at then
    raise exception 'general_mail_draft_stale' using errcode = '40001';
  end if;
  if v_message.message_state not in ('draft', 'failed')
    and not (
      v_message.message_state = 'pending'
      and v_message.send_claimed_at <= v_now - make_interval(secs => greatest(p_stale_after_seconds, 30))
    ) then
    raise exception 'general_mail_send_locked' using errcode = 'P0001';
  end if;

  update public.general_mail_messages
  set
    message_state = 'pending',
    admin_customer_id = p_admin_customer_id,
    send_attempt_count = send_attempt_count + 1,
    send_claimed_at = v_now,
    failed_at = null,
    delivery_error = null,
    updated_at = v_now
  where message_id = p_message_id;

  return query select * from public.general_mail_messages where message_id = p_message_id;
end;
$$;

create or replace function public.reconcile_general_mail_send(
  p_message_id uuid,
  p_provider_message_id text,
  p_internet_message_id text,
  p_email_event_id uuid,
  p_sent_at timestamptz default now()
)
returns setof public.general_mail_messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.general_mail_messages%rowtype;
  v_sent_at timestamptz := coalesce(p_sent_at, now());
begin
  if p_provider_message_id is null or char_length(trim(p_provider_message_id)) not between 1 and 500
    or (p_internet_message_id is not null and p_internet_message_id !~ '^<[^<>[:space:]]+>$') then
    raise exception 'general_mail_send_reconciliation_invalid' using errcode = '22023';
  end if;

  select * into v_message
  from public.general_mail_messages
  where message_id = p_message_id
  for update;

  if not found or v_message.direction <> 'outbound' then
    raise exception 'general_mail_message_not_found' using errcode = 'P0002';
  end if;
  if v_message.provider_message_id is not null
    and v_message.provider_message_id <> trim(p_provider_message_id) then
    raise exception 'general_mail_provider_id_conflict' using errcode = '23505';
  end if;
  if v_message.internet_message_id is not null
    and p_internet_message_id is not null
    and lower(v_message.internet_message_id) <> lower(p_internet_message_id) then
    raise exception 'general_mail_internet_id_conflict' using errcode = '23505';
  end if;

  update public.general_mail_messages
  set
    message_state = 'sent',
    provider_message_id = trim(p_provider_message_id),
    internet_message_id = coalesce(internet_message_id, p_internet_message_id),
    email_event_id = coalesce(p_email_event_id, email_event_id),
    sent_at = coalesce(sent_at, v_sent_at),
    send_claimed_at = null,
    failed_at = null,
    delivery_error = null,
    updated_at = now()
  where message_id = p_message_id;

  update public.general_mail_threads
  set
    latest_message_at = greatest(latest_message_at, v_sent_at),
    last_outbound_at = greatest(coalesce(last_outbound_at, v_sent_at), v_sent_at),
    admin_read_at = v_sent_at,
    updated_at = now()
  where thread_id = v_message.thread_id;

  return query select * from public.general_mail_messages where message_id = p_message_id;
end;
$$;

create or replace function public.fail_general_mail_send(
  p_message_id uuid,
  p_error text
)
returns setof public.general_mail_messages
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.general_mail_messages
  set
    message_state = 'failed',
    delivery_error = left(coalesce(nullif(trim(p_error), ''), 'Email send failed'), 500),
    send_claimed_at = null,
    failed_at = now(),
    updated_at = now()
  where message_id = p_message_id
    and direction = 'outbound'
    and message_state = 'pending';

  return query select * from public.general_mail_messages where message_id = p_message_id;
end;
$$;

create or replace function public.delete_general_mail_draft(
  p_message_id uuid,
  p_expected_updated_at timestamptz,
  p_admin_customer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.general_mail_messages%rowtype;
begin
  if not exists (
    select 1 from public.customers
    where customer_id = p_admin_customer_id and role = 'admin'
  ) then
    raise exception 'general_mail_draft_invalid' using errcode = '22023';
  end if;

  select * into v_message
  from public.general_mail_messages
  where message_id = p_message_id
  for update;

  if not found then return null; end if;
  if v_message.message_state not in ('draft', 'failed')
    or v_message.provider_message_id is not null then
    raise exception 'general_mail_draft_locked' using errcode = 'P0001';
  end if;
  if v_message.updated_at <> p_expected_updated_at then
    raise exception 'general_mail_draft_stale' using errcode = '40001';
  end if;

  delete from public.general_mail_messages where message_id = p_message_id;
  delete from public.general_mail_threads thread
  where thread.thread_id = v_message.thread_id
    and not exists (
      select 1 from public.general_mail_messages remaining
      where remaining.thread_id = thread.thread_id
    );

  return p_message_id;
end;
$$;

create or replace function public.reconcile_general_mail_delivery_event(
  p_provider_message_id text,
  p_internet_message_id text,
  p_event_type text,
  p_event_created_at timestamptz,
  p_event_error text default null
)
returns table(matched boolean, applied boolean, matched_message_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.general_mail_messages%rowtype;
  v_state text;
  v_priority integer;
  v_apply boolean := false;
begin
  v_state := case p_event_type
    when 'email.sent' then 'sent'
    when 'email.delivered' then 'delivered'
    when 'email.delivery_delayed' then 'delivery_delayed'
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

  if v_state is null or p_event_created_at is null
    or p_provider_message_id is null or char_length(trim(p_provider_message_id)) not between 1 and 500
    or (p_internet_message_id is not null and p_internet_message_id !~ '^<[^<>[:space:]]+>$') then
    raise exception 'general_mail_delivery_event_invalid' using errcode = '22023';
  end if;

  select * into v_message
  from public.general_mail_messages
  where provider = 'resend'
    and provider_message_id = trim(p_provider_message_id)
    and direction = 'outbound'
  for update;

  if not found then
    return query select false, false, null::uuid;
    return;
  end if;

  if v_message.internet_message_id is not null
    and p_internet_message_id is not null
    and lower(v_message.internet_message_id) <> lower(p_internet_message_id) then
    raise exception 'general_mail_internet_id_conflict' using errcode = '23505';
  end if;

  v_apply :=
    v_message.delivery_event_priority is null
    or v_priority > v_message.delivery_event_priority
    or (
      v_priority = v_message.delivery_event_priority
      and (
        v_message.delivery_observed_at is null
        or p_event_created_at >= v_message.delivery_observed_at
      )
    );

  update public.general_mail_messages
  set
    internet_message_id = coalesce(internet_message_id, p_internet_message_id),
    message_state = case when v_apply then v_state else message_state end,
    delivery_observed_at = case when v_apply then p_event_created_at else delivery_observed_at end,
    delivery_event_priority = case when v_apply then v_priority else delivery_event_priority end,
    delivery_error = case
      when v_apply and v_state in ('bounced', 'failed', 'suppressed')
        then left(nullif(trim(coalesce(p_event_error, '')), ''), 500)
      when v_apply then null
      else delivery_error
    end,
    failed_at = case
      when v_apply and v_state in ('bounced', 'failed', 'suppressed') then p_event_created_at
      when v_apply then null
      else failed_at
    end,
    updated_at = case when v_apply or internet_message_id is null then now() else updated_at end
  where message_id = v_message.message_id;

  return query select true, v_apply, v_message.message_id;
end;
$$;

revoke all on function public.project_general_mail_inbound(uuid, text[])
  from public, anon, authenticated;
revoke all on function public.project_general_mail_legacy_reply(uuid, text)
  from public, anon, authenticated;
revoke all on function public.create_general_mail_draft(
  uuid, uuid, text, uuid, text, text[], text[], text[], text[], text, text, text, text
) from public, anon, authenticated;
revoke all on function public.update_general_mail_draft(
  uuid, timestamptz, uuid, text[], text[], text[], text, text
) from public, anon, authenticated;
revoke all on function public.claim_general_mail_send(uuid, timestamptz, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.reconcile_general_mail_send(uuid, text, text, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.fail_general_mail_send(uuid, text)
  from public, anon, authenticated;
revoke all on function public.delete_general_mail_draft(uuid, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.reconcile_general_mail_delivery_event(text, text, text, timestamptz, text)
  from public, anon, authenticated;

grant execute on function public.project_general_mail_inbound(uuid, text[]) to service_role;
grant execute on function public.project_general_mail_legacy_reply(uuid, text) to service_role;
grant execute on function public.create_general_mail_draft(
  uuid, uuid, text, uuid, text, text[], text[], text[], text[], text, text, text, text
) to service_role;
grant execute on function public.update_general_mail_draft(
  uuid, timestamptz, uuid, text[], text[], text[], text, text
) to service_role;
grant execute on function public.claim_general_mail_send(uuid, timestamptz, uuid, integer)
  to service_role;
grant execute on function public.reconcile_general_mail_send(uuid, text, text, uuid, timestamptz)
  to service_role;
grant execute on function public.fail_general_mail_send(uuid, text) to service_role;
grant execute on function public.delete_general_mail_draft(uuid, timestamptz, uuid) to service_role;
grant execute on function public.reconcile_general_mail_delivery_event(text, text, text, timestamptz, text)
  to service_role;
