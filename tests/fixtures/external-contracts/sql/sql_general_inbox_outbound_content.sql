-- T4-007 S4: safe outbound content and private draft attachments.
--
-- Run after sql_general_inbox_standard_mail_backend.sql.
-- SQL Editor safe: no transaction, temporary tables, or cross-statement state.

do $$
begin
  if to_regclass('public.general_mail_threads') is null
    or to_regclass('public.general_mail_messages') is null
    or to_regclass('public.general_mail_attachments') is null then
    raise exception 'T4-007 S2/S3 General mail schema must be applied before S4';
  end if;
end;
$$;

alter table public.general_mail_messages
  add column if not exists body_document jsonb;

alter table public.general_mail_attachments
  add column if not exists processing_token uuid,
  add column if not exists processing_started_at timestamptz,
  add column if not exists stored_at timestamptz,
  add column if not exists attached_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'general_mail_messages_body_document_check'
  ) then
    alter table public.general_mail_messages
      add constraint general_mail_messages_body_document_check
      check (
        body_document is null
        or (
          direction = 'outbound'
          and jsonb_typeof(body_document) = 'object'
          and body_document ->> 'version' = '1'
          and octet_length(body_document::text) <= 100000
        )
      );
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'general_mail_attachments_processing_check'
  ) then
    alter table public.general_mail_attachments
      add constraint general_mail_attachments_processing_check
      check (
        source_kind <> 'outbound_upload'
        or (attachment_state = 'processing' and processing_token is not null and processing_started_at is not null)
        or (attachment_state <> 'processing' and processing_token is null and processing_started_at is null)
      );
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'general_mail_attachments_outbound_path_check'
  ) then
    alter table public.general_mail_attachments
      add constraint general_mail_attachments_outbound_path_check
      check (
        source_kind <> 'outbound_upload'
        or (
          storage_bucket = 'general-mail-private'
          and storage_path is not null
          and size_bytes is not null
          and content_disposition = 'attachment'
        )
      );
  end if;
end;
$$;

comment on column public.general_mail_messages.body_document is
  'Server-normalized restricted rich-text document. Outbound only; body_html and body_text are generated from it.';

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'general-mail-private',
  'general-mail-private',
  false,
  10485760,
  array['application/octet-stream']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.general_mail_storage_cleanup_queue (
  storage_path text primary key,
  storage_bucket text not null default 'general-mail-private',
  reason text not null,
  attempt_count integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint general_mail_storage_cleanup_bucket_check
    check (storage_bucket = 'general-mail-private'),
  constraint general_mail_storage_cleanup_path_check
    check (char_length(storage_path) between 1 and 1000),
  constraint general_mail_storage_cleanup_reason_check
    check (char_length(reason) between 1 and 100),
  constraint general_mail_storage_cleanup_attempt_check
    check (attempt_count >= 0),
  constraint general_mail_storage_cleanup_error_check
    check (last_error is null or char_length(last_error) <= 500)
);

create index if not exists general_mail_storage_cleanup_due_idx
  on public.general_mail_storage_cleanup_queue(next_attempt_at, created_at);

alter table public.general_mail_storage_cleanup_queue enable row level security;
revoke all on table public.general_mail_storage_cleanup_queue from public, anon, authenticated;
grant select, insert, update, delete on table public.general_mail_storage_cleanup_queue to service_role;

create index if not exists general_mail_attachments_cleanup_idx
  on public.general_mail_attachments(attachment_state, processing_started_at, created_at)
  where source_kind = 'outbound_upload';

create or replace function public.create_general_mail_rich_draft(
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
  p_body_html text,
  p_body_document jsonb,
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
    or p_body_document is null
    or p_body_document ->> 'version' <> '1'
    or p_body_html is null
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
      or v_existing.body_html is distinct from p_body_html
      or v_existing.body_document is distinct from p_body_document
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
      thread_id, mailbox_key, subject, latest_message_at, created_at, updated_at
    ) values (
      v_thread_id, p_mailbox_key, p_subject, v_now, v_now, v_now
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
    body_html,
    body_document,
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
    p_body_html,
    p_body_document,
    p_in_reply_to,
    p_references_header,
    v_now,
    v_now
  );

  return query select * from public.general_mail_messages where message_id = p_message_id;
end;
$$;

create or replace function public.update_general_mail_rich_draft(
  p_message_id uuid,
  p_expected_updated_at timestamptz,
  p_admin_customer_id uuid,
  p_to_addresses text[],
  p_cc_addresses text[],
  p_bcc_addresses text[],
  p_subject text,
  p_body_text text,
  p_body_html text,
  p_body_document jsonb
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
  if p_body_document is null
    or p_body_document ->> 'version' <> '1'
    or p_body_html is null
    or not exists (
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
  if v_message.message_state not in ('draft', 'failed') then
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
    body_html = p_body_html,
    body_document = p_body_document,
    message_state = 'draft',
    failed_at = null,
    delivery_error = null,
    updated_at = v_now
  where message_id = p_message_id;

  update public.general_mail_threads
  set subject = p_subject, updated_at = v_now
  where thread_id = v_message.thread_id;

  return query select * from public.general_mail_messages where message_id = p_message_id;
end;
$$;

create or replace function public.create_general_mail_attachment_upload(
  p_attachment_id uuid,
  p_message_id uuid,
  p_expected_updated_at timestamptz,
  p_admin_customer_id uuid,
  p_original_filename text,
  p_safe_filename text,
  p_content_type text,
  p_size_bytes bigint,
  p_storage_path text
)
returns setof public.general_mail_attachments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.general_mail_messages%rowtype;
  v_existing public.general_mail_attachments%rowtype;
  v_now timestamptz := now();
  v_count integer;
  v_total bigint;
begin
  if p_attachment_id is null
    or p_message_id is null
    or p_size_bytes < 0
    or p_size_bytes > 10485760
    or p_storage_path is null
    or char_length(p_storage_path) > 1000
    or not exists (
      select 1 from public.customers
      where customer_id = p_admin_customer_id and role = 'admin'
    ) then
    raise exception 'general_mail_attachment_invalid' using errcode = '22023';
  end if;

  select * into v_message
  from public.general_mail_messages
  where message_id = p_message_id
  for update;
  if not found then raise exception 'general_mail_draft_not_found' using errcode = 'P0002'; end if;
  if v_message.direction <> 'outbound' or v_message.message_state not in ('draft', 'failed') then
    raise exception 'general_mail_draft_locked' using errcode = 'P0001';
  end if;

  select * into v_existing
  from public.general_mail_attachments
  where attachment_id = p_attachment_id
  for update;
  if found then
    if v_existing.message_id <> p_message_id
      or v_existing.source_kind <> 'outbound_upload'
      or v_existing.safe_filename <> p_safe_filename
      or v_existing.content_type <> p_content_type
      or v_existing.size_bytes <> p_size_bytes
      or v_existing.storage_path <> p_storage_path then
      raise exception 'general_mail_attachment_idempotency_conflict' using errcode = '23505';
    end if;
    return query select * from public.general_mail_attachments where attachment_id = p_attachment_id;
    return;
  end if;

  if v_message.updated_at <> p_expected_updated_at then
    raise exception 'general_mail_draft_stale' using errcode = '40001';
  end if;

  select count(*), coalesce(sum(size_bytes), 0)
    into v_count, v_total
  from public.general_mail_attachments
  where message_id = p_message_id and source_kind = 'outbound_upload';
  if v_count >= 10 or v_total + p_size_bytes > 26214400 then
    raise exception 'general_mail_attachment_limit' using errcode = '22023';
  end if;

  insert into public.general_mail_attachments (
    attachment_id,
    message_id,
    source_kind,
    original_filename,
    safe_filename,
    content_type,
    content_disposition,
    size_bytes,
    storage_bucket,
    storage_path,
    attachment_state,
    created_at,
    updated_at
  ) values (
    p_attachment_id,
    p_message_id,
    'outbound_upload',
    p_original_filename,
    p_safe_filename,
    p_content_type,
    'attachment',
    p_size_bytes,
    'general-mail-private',
    p_storage_path,
    'pending',
    v_now,
    v_now
  );

  update public.general_mail_messages
  set
    admin_customer_id = p_admin_customer_id,
    message_state = 'draft',
    failed_at = null,
    delivery_error = null,
    updated_at = v_now
  where message_id = p_message_id;

  return query select * from public.general_mail_attachments where attachment_id = p_attachment_id;
end;
$$;

create or replace function public.confirm_general_mail_attachment_upload(
  p_attachment_id uuid,
  p_message_id uuid,
  p_admin_customer_id uuid,
  p_size_bytes bigint,
  p_sha256 text
)
returns setof public.general_mail_attachments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.general_mail_messages%rowtype;
  v_attachment public.general_mail_attachments%rowtype;
  v_now timestamptz := now();
begin
  if p_size_bytes < 0
    or p_size_bytes > 10485760
    or p_sha256 !~ '^[a-f0-9]{64}$'
    or not exists (
      select 1 from public.customers
      where customer_id = p_admin_customer_id and role = 'admin'
    ) then
    raise exception 'general_mail_attachment_invalid' using errcode = '22023';
  end if;

  select * into v_message
  from public.general_mail_messages
  where message_id = p_message_id
  for update;
  if not found then raise exception 'general_mail_draft_not_found' using errcode = 'P0002'; end if;
  if v_message.direction <> 'outbound' or v_message.message_state <> 'draft' then
    raise exception 'general_mail_draft_locked' using errcode = 'P0001';
  end if;

  select * into v_attachment
  from public.general_mail_attachments
  where attachment_id = p_attachment_id and message_id = p_message_id
  for update;
  if not found or v_attachment.source_kind <> 'outbound_upload' then
    raise exception 'general_mail_attachment_not_found' using errcode = 'P0002';
  end if;
  if v_attachment.attachment_state in ('stored', 'attached') then
    if v_attachment.size_bytes <> p_size_bytes or v_attachment.sha256 <> p_sha256 then
      raise exception 'general_mail_attachment_idempotency_conflict' using errcode = '23505';
    end if;
    return query select * from public.general_mail_attachments where attachment_id = p_attachment_id;
    return;
  end if;
  if v_attachment.attachment_state <> 'pending' or v_attachment.size_bytes <> p_size_bytes then
    raise exception 'general_mail_attachment_locked' using errcode = 'P0001';
  end if;

  update public.general_mail_attachments
  set
    attachment_state = 'stored',
    sha256 = p_sha256,
    stored_at = v_now,
    updated_at = v_now
  where attachment_id = p_attachment_id;
  update public.general_mail_messages
  set admin_customer_id = p_admin_customer_id, updated_at = v_now
  where message_id = p_message_id;

  return query select * from public.general_mail_attachments where attachment_id = p_attachment_id;
end;
$$;

create or replace function public.delete_general_mail_attachment(
  p_attachment_id uuid,
  p_message_id uuid,
  p_admin_customer_id uuid
)
returns setof public.general_mail_attachments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.general_mail_messages%rowtype;
  v_attachment public.general_mail_attachments%rowtype;
begin
  if not exists (
    select 1 from public.customers
    where customer_id = p_admin_customer_id and role = 'admin'
  ) then
    raise exception 'general_mail_attachment_invalid' using errcode = '22023';
  end if;
  select * into v_message
  from public.general_mail_messages
  where message_id = p_message_id
  for update;
  if not found then raise exception 'general_mail_draft_not_found' using errcode = 'P0002'; end if;
  if v_message.direction <> 'outbound' or v_message.message_state not in ('draft', 'failed') then
    raise exception 'general_mail_draft_locked' using errcode = 'P0001';
  end if;
  select * into v_attachment
  from public.general_mail_attachments
  where attachment_id = p_attachment_id and message_id = p_message_id
  for update;
  if not found or v_attachment.source_kind <> 'outbound_upload' then
    raise exception 'general_mail_attachment_not_found' using errcode = 'P0002';
  end if;

  if v_attachment.storage_bucket = 'general-mail-private' and v_attachment.storage_path is not null then
    insert into public.general_mail_storage_cleanup_queue (
      storage_path, storage_bucket, reason, next_attempt_at, updated_at
    ) values (
      v_attachment.storage_path, v_attachment.storage_bucket, 'attachment_deleted', now(), now()
    )
    on conflict (storage_path) do update
    set next_attempt_at = now(), updated_at = now();
  end if;
  delete from public.general_mail_attachments where attachment_id = p_attachment_id;
  update public.general_mail_messages
  set admin_customer_id = p_admin_customer_id, message_state = 'draft', updated_at = now()
  where message_id = p_message_id;
  return next v_attachment;
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

  insert into public.general_mail_storage_cleanup_queue (
    storage_path, storage_bucket, reason, next_attempt_at, updated_at
  )
  select
    attachment.storage_path,
    attachment.storage_bucket,
    'draft_deleted',
    now(),
    now()
  from public.general_mail_attachments attachment
  where attachment.message_id = p_message_id
    and attachment.source_kind = 'outbound_upload'
    and attachment.storage_bucket = 'general-mail-private'
    and attachment.storage_path is not null
  on conflict (storage_path) do update
  set next_attempt_at = now(), updated_at = now();

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

create or replace function public.claim_general_mail_attachment_cleanup(
  p_cutoff timestamptz,
  p_limit integer default 50
)
returns setof public.general_mail_attachments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  if p_cutoff is null or p_limit not between 1 and 100 then
    raise exception 'general_mail_attachment_cleanup_invalid' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select attachment.attachment_id
    from public.general_mail_attachments attachment
    join public.general_mail_messages message on message.message_id = attachment.message_id
    where attachment.source_kind = 'outbound_upload'
      and message.direction = 'outbound'
      and message.message_state in ('draft', 'failed')
      and message.updated_at < p_cutoff
      and (
        attachment.attachment_state in ('pending', 'stored', 'rejected', 'failed')
        or (
          attachment.attachment_state = 'processing'
          and attachment.processing_started_at < now() - interval '1 hour'
        )
      )
    order by attachment.created_at
    for update of attachment skip locked
    limit p_limit
  ),
  claimed as (
    update public.general_mail_attachments attachment
    set
      attachment_state = 'processing',
      processing_token = v_token,
      processing_started_at = now(),
      updated_at = now()
    from candidates
    where attachment.attachment_id = candidates.attachment_id
    returning attachment.*
  )
  select * from claimed;
end;
$$;

create or replace function public.finish_general_mail_attachment_cleanup(
  p_attachment_id uuid,
  p_processing_token uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.general_mail_attachments
  where attachment_id = p_attachment_id
    and attachment_state = 'processing'
    and processing_token = p_processing_token;
  if not found then
    raise exception 'general_mail_attachment_cleanup_stale' using errcode = '40001';
  end if;
  return p_attachment_id;
end;
$$;

create or replace function public.fail_general_mail_attachment_cleanup(
  p_attachment_id uuid,
  p_processing_token uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.general_mail_attachments
  set
    attachment_state = 'failed',
    processing_token = null,
    processing_started_at = null,
    updated_at = now()
  where attachment_id = p_attachment_id
    and attachment_state = 'processing'
    and processing_token = p_processing_token;
  return case when found then p_attachment_id else null end;
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
  v_attachment_count integer;
  v_attachment_total bigint;
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

  if not found then raise exception 'general_mail_draft_not_found' using errcode = 'P0002'; end if;
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

  perform 1
  from public.general_mail_attachments
  where message_id = p_message_id
  for update;

  if exists (
    select 1 from public.general_mail_attachments
    where message_id = p_message_id
      and source_kind = 'outbound_upload'
      and attachment_state not in ('stored', 'attached')
  ) then
    raise exception 'general_mail_attachment_not_ready' using errcode = 'P0001';
  end if;

  select count(*), coalesce(sum(size_bytes), 0)
    into v_attachment_count, v_attachment_total
  from public.general_mail_attachments
  where message_id = p_message_id and source_kind = 'outbound_upload';
  if v_attachment_count > 10 or v_attachment_total > 26214400 then
    raise exception 'general_mail_attachment_limit' using errcode = '22023';
  end if;

  update public.general_mail_attachments
  set attachment_state = 'attached', attached_at = coalesce(attached_at, v_now), updated_at = v_now
  where message_id = p_message_id
    and source_kind = 'outbound_upload'
    and attachment_state = 'stored';

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

revoke all on function public.create_general_mail_rich_draft(
  uuid, uuid, text, uuid, text, text[], text[], text[], text[], text, text, text, jsonb, text, text
) from public, anon, authenticated;
revoke all on function public.update_general_mail_rich_draft(
  uuid, timestamptz, uuid, text[], text[], text[], text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.create_general_mail_attachment_upload(
  uuid, uuid, timestamptz, uuid, text, text, text, bigint, text
) from public, anon, authenticated;
revoke all on function public.confirm_general_mail_attachment_upload(uuid, uuid, uuid, bigint, text)
  from public, anon, authenticated;
revoke all on function public.delete_general_mail_attachment(uuid, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.claim_general_mail_attachment_cleanup(timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.finish_general_mail_attachment_cleanup(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.fail_general_mail_attachment_cleanup(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.create_general_mail_rich_draft(
  uuid, uuid, text, uuid, text, text[], text[], text[], text[], text, text, text, jsonb, text, text
) to service_role;
grant execute on function public.update_general_mail_rich_draft(
  uuid, timestamptz, uuid, text[], text[], text[], text, text, text, jsonb
) to service_role;
grant execute on function public.create_general_mail_attachment_upload(
  uuid, uuid, timestamptz, uuid, text, text, text, bigint, text
) to service_role;
grant execute on function public.confirm_general_mail_attachment_upload(uuid, uuid, uuid, bigint, text)
  to service_role;
grant execute on function public.delete_general_mail_attachment(uuid, uuid, uuid)
  to service_role;
grant execute on function public.claim_general_mail_attachment_cleanup(timestamptz, integer)
  to service_role;
grant execute on function public.finish_general_mail_attachment_cleanup(uuid, uuid)
  to service_role;
grant execute on function public.fail_general_mail_attachment_cleanup(uuid, uuid)
  to service_role;
