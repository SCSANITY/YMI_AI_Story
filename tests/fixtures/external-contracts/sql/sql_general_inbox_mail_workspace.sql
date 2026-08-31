-- T4-007 S2: canonical General Inbox mailbox workspace.
--
-- This migration is intentionally additive and Supabase SQL Editor safe:
-- every statement is independently convergent, no temporary table or
-- cross-statement transaction state is required, and transport history stays intact.

do $$
declare
  v_unmapped_count integer;
begin
  if to_regclass('public.inbound_email_envelopes') is null
    or to_regclass('public.inbound_email_replies') is null
    or to_regclass('public.inbound_email_attachments') is null
    or to_regclass('public.email_events') is null
    or to_regclass('public.customers') is null then
    raise exception 'General Inbox M3-M5, email events, and customers must exist before T4-007 S2';
  end if;

  select count(*)
  into v_unmapped_count
  from public.inbound_email_envelopes envelope
  where envelope.route_kind in ('general', 'operational_support')
    and coalesce(split_part(lower(trim(envelope.route_address)), '@', 1), '') not in (
      'admin',
      'postmaster',
      'abuse',
      'hello',
      'security',
      'orders',
      'delivery',
      -- Historical aliases are retained only for additive workspace backfill.
      'dmarc',
      'noreply',
      'no-reply'
    );

  if v_unmapped_count > 0 then
    raise exception 'T4-007 S2 found % General Inbox transport row(s) with an unmapped route address',
      v_unmapped_count;
  end if;
end;
$$;

create table if not exists public.general_mail_threads (
  thread_id uuid primary key default gen_random_uuid(),
  mailbox_key text not null,
  subject text not null default '(No subject)',
  latest_message_at timestamptz not null default now(),
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  admin_read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint general_mail_threads_mailbox_key_check
    check (mailbox_key in ('admin', 'hello', 'security', 'orders', 'delivery')),
  constraint general_mail_threads_subject_length_check
    check (char_length(subject) between 1 and 1000),
  constraint general_mail_threads_latest_message_check
    check (
      latest_message_at >= created_at
      and (last_inbound_at is null or latest_message_at >= last_inbound_at)
      and (last_outbound_at is null or latest_message_at >= last_outbound_at)
    )
);

create table if not exists public.general_mail_messages (
  message_id uuid primary key default gen_random_uuid(),
  thread_id uuid not null
    references public.general_mail_threads(thread_id) on delete cascade,
  direction text not null,
  message_state text not null,
  source_inbound_email_id uuid
    references public.inbound_email_envelopes(inbound_email_id) on delete restrict,
  source_reply_id uuid
    references public.inbound_email_replies(reply_id) on delete restrict,
  admin_customer_id uuid
    references public.customers(customer_id) on delete set null,
  email_event_id uuid
    references public.email_events(email_event_id) on delete set null,
  provider text not null default 'resend',
  provider_message_id text,
  internet_message_id text,
  from_address text not null,
  to_addresses text[] not null default '{}',
  cc_addresses text[] not null default '{}',
  bcc_addresses text[] not null default '{}',
  reply_to_addresses text[] not null default '{}',
  subject text not null default '(No subject)',
  body_text text,
  body_html text,
  in_reply_to text,
  references_header text,
  received_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint general_mail_messages_direction_check
    check (direction in ('inbound', 'outbound')),
  constraint general_mail_messages_state_check
    check (message_state in (
      'draft',
      'pending',
      'queued',
      'sent',
      'delivered',
      'delivery_delayed',
      'bounced',
      'complained',
      'failed',
      'suppressed',
      'canceled',
      'received'
    )),
  constraint general_mail_messages_direction_state_check
    check (
      (direction = 'inbound' and message_state = 'received')
      or (direction = 'outbound' and message_state <> 'received')
    ),
  constraint general_mail_messages_source_check
    check (not (source_inbound_email_id is not null and source_reply_id is not null)),
  constraint general_mail_messages_source_direction_check
    check (
      (source_inbound_email_id is null or direction = 'inbound')
      and (source_reply_id is null or direction = 'outbound')
    ),
  constraint general_mail_messages_provider_check
    check (provider = 'resend'),
  constraint general_mail_messages_provider_id_length_check
    check (provider_message_id is null or char_length(provider_message_id) between 1 and 500),
  constraint general_mail_messages_internet_id_length_check
    check (internet_message_id is null or char_length(internet_message_id) between 3 and 998),
  constraint general_mail_messages_from_length_check
    check (char_length(from_address) between 3 and 320),
  constraint general_mail_messages_recipient_count_check
    check (
      cardinality(to_addresses) <= 100
      and cardinality(cc_addresses) <= 100
      and cardinality(bcc_addresses) <= 100
      and cardinality(reply_to_addresses) <= 20
    ),
  constraint general_mail_messages_subject_length_check
    check (char_length(subject) between 1 and 1000),
  constraint general_mail_messages_body_text_length_check
    check (body_text is null or char_length(body_text) <= 50000),
  constraint general_mail_messages_body_html_length_check
    check (body_html is null or char_length(body_html) <= 100000),
  constraint general_mail_messages_inbound_plaintext_only_check
    check (direction = 'outbound' or body_html is null),
  constraint general_mail_messages_in_reply_to_length_check
    check (in_reply_to is null or char_length(in_reply_to) <= 998),
  constraint general_mail_messages_references_length_check
    check (references_header is null or char_length(references_header) <= 8000)
);

comment on column public.general_mail_messages.bcc_addresses is
  'Sensitive outbound envelope data. Never expose in thread readers or derive Reply/Reply-All recipients from it.';

comment on column public.general_mail_messages.body_html is
  'Outbound sanitized allowlisted HTML only. Inbound workspace messages remain plaintext-only.';

create table if not exists public.general_mail_attachments (
  attachment_id uuid primary key default gen_random_uuid(),
  message_id uuid not null
    references public.general_mail_messages(message_id) on delete cascade,
  source_kind text not null,
  source_inbound_attachment_id uuid
    references public.inbound_email_attachments(attachment_id) on delete restrict,
  original_filename text,
  safe_filename text not null,
  content_type text not null default 'application/octet-stream',
  content_disposition text,
  size_bytes bigint,
  sha256 text,
  storage_bucket text,
  storage_path text,
  attachment_state text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint general_mail_attachments_source_kind_check
    check (source_kind in ('inbound_transport', 'outbound_upload')),
  constraint general_mail_attachments_source_check
    check (
      (source_kind = 'inbound_transport' and source_inbound_attachment_id is not null)
      or (source_kind = 'outbound_upload' and source_inbound_attachment_id is null)
    ),
  constraint general_mail_attachments_filename_length_check
    check (
      (original_filename is null or char_length(original_filename) <= 500)
      and char_length(safe_filename) between 1 and 140
    ),
  constraint general_mail_attachments_content_type_length_check
    check (char_length(content_type) between 1 and 200),
  constraint general_mail_attachments_disposition_check
    check (content_disposition is null or content_disposition in ('inline', 'attachment')),
  constraint general_mail_attachments_size_check
    check (size_bytes is null or size_bytes >= 0),
  constraint general_mail_attachments_sha256_check
    check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  constraint general_mail_attachments_storage_length_check
    check (
      (storage_bucket is null or char_length(storage_bucket) <= 100)
      and (storage_path is null or char_length(storage_path) <= 1000)
    ),
  constraint general_mail_attachments_state_check
    check (attachment_state in ('pending', 'processing', 'stored', 'attached', 'rejected', 'failed')),
  constraint general_mail_attachments_outbound_storage_check
    check (
      source_kind <> 'outbound_upload'
      or attachment_state not in ('stored', 'attached')
      or (storage_bucket is not null and storage_path is not null and size_bytes is not null and sha256 is not null)
    )
);

create index if not exists general_mail_threads_folder_idx
  on public.general_mail_threads(mailbox_key, archived_at, latest_message_at desc);

create index if not exists general_mail_threads_unread_idx
  on public.general_mail_threads(mailbox_key, admin_read_at, last_inbound_at desc)
  where archived_at is null;

create index if not exists general_mail_messages_thread_idx
  on public.general_mail_messages(thread_id, created_at asc);

create index if not exists general_mail_messages_folder_state_idx
  on public.general_mail_messages(direction, message_state, created_at desc);

create unique index if not exists general_mail_messages_source_inbound_key
  on public.general_mail_messages(source_inbound_email_id)
  where source_inbound_email_id is not null;

create unique index if not exists general_mail_messages_source_reply_key
  on public.general_mail_messages(source_reply_id)
  where source_reply_id is not null;

create unique index if not exists general_mail_messages_provider_key
  on public.general_mail_messages(provider, provider_message_id)
  where provider_message_id is not null;

create index if not exists general_mail_messages_internet_message_id_idx
  on public.general_mail_messages(lower(internet_message_id))
  where internet_message_id is not null;

create unique index if not exists general_mail_messages_outbound_internet_message_id_key
  on public.general_mail_messages(lower(internet_message_id))
  where direction = 'outbound' and internet_message_id is not null;

create index if not exists general_mail_attachments_message_idx
  on public.general_mail_attachments(message_id, created_at asc);

create unique index if not exists general_mail_attachments_source_inbound_key
  on public.general_mail_attachments(source_inbound_attachment_id)
  where source_inbound_attachment_id is not null;

create unique index if not exists general_mail_attachments_storage_path_key
  on public.general_mail_attachments(storage_bucket, storage_path)
  where storage_bucket is not null and storage_path is not null;

alter table public.general_mail_threads enable row level security;
alter table public.general_mail_messages enable row level security;
alter table public.general_mail_attachments enable row level security;

revoke all on table public.general_mail_threads from public, anon, authenticated;
revoke all on table public.general_mail_messages from public, anon, authenticated;
revoke all on table public.general_mail_attachments from public, anon, authenticated;

grant select, insert, update, delete on table public.general_mail_threads to service_role;
grant select, insert, update, delete on table public.general_mail_messages to service_role;
grant select, insert, update, delete on table public.general_mail_attachments to service_role;

-- Each historical transport envelope starts as one conservative workspace thread.
-- S3 may match future envelopes through RFC headers, but this migration never guesses.
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
)
select
  envelope.inbound_email_id,
  case split_part(lower(trim(envelope.route_address)), '@', 1)
    when 'hello' then 'hello'
    when 'security' then 'security'
    when 'orders' then 'orders'
    when 'delivery' then 'delivery'
    else 'admin'
  end,
  left(coalesce(nullif(trim(envelope.subject), ''), '(No subject)'), 1000),
  envelope.created_at,
  envelope.created_at,
  envelope.admin_read_at,
  envelope.archived_at,
  envelope.created_at,
  envelope.updated_at
from public.inbound_email_envelopes envelope
where envelope.route_kind in ('general', 'operational_support')
  and not exists (
    select 1
    from public.general_mail_messages existing_message
    where existing_message.source_inbound_email_id = envelope.inbound_email_id
  )
on conflict (thread_id) do nothing;

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
)
select
  envelope.inbound_email_id,
  thread.thread_id,
  'inbound',
  'received',
  envelope.inbound_email_id,
  envelope.provider,
  envelope.provider_email_id,
  envelope.internet_message_id,
  coalesce(nullif(trim(envelope.from_email), ''), 'unknown@invalid.local'),
  coalesce(envelope.to_addresses, '{}'),
  left(coalesce(nullif(trim(envelope.subject), ''), '(No subject)'), 1000),
  envelope.body_text,
  envelope.in_reply_to,
  envelope.references_header,
  envelope.created_at,
  envelope.created_at,
  envelope.updated_at
from public.inbound_email_envelopes envelope
join public.general_mail_threads thread
  on thread.thread_id = envelope.inbound_email_id
where envelope.route_kind in ('general', 'operational_support')
on conflict do nothing;

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
)
select
  reply.reply_id,
  inbound_message.thread_id,
  'outbound',
  case reply.delivery_status
    when 'sent' then 'sent'
    when 'failed' then 'failed'
    else 'pending'
  end,
  reply.reply_id,
  reply.admin_customer_id,
  reply.email_event_id,
  'resend',
  reply.provider_email_id,
  reply.from_email,
  array[reply.to_email],
  array[reply.reply_to],
  left(coalesce(nullif(trim(reply.subject), ''), '(No subject)'), 1000),
  reply.body_text,
  reply.in_reply_to,
  reply.references_header,
  reply.sent_at,
  reply.failed_at,
  reply.created_at,
  reply.updated_at
from public.inbound_email_replies reply
join public.general_mail_messages inbound_message
  on inbound_message.source_inbound_email_id = reply.inbound_email_id
on conflict do nothing;

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
  inbound_message.message_id,
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
join public.general_mail_messages inbound_message
  on inbound_message.source_inbound_email_id = attachment.inbound_email_id
on conflict do nothing;

-- Recompute thread rollups from canonical messages. The distinct guard keeps
-- a clean rerun from churning updated_at or invalidating optimistic Admin state.
with rollup as (
  select
    message.thread_id,
    max(coalesce(message.received_at, message.sent_at, message.created_at)) as latest_message_at,
    max(coalesce(message.received_at, message.created_at))
      filter (where message.direction = 'inbound') as last_inbound_at,
    max(coalesce(message.sent_at, message.created_at))
      filter (where message.direction = 'outbound') as last_outbound_at
  from public.general_mail_messages message
  group by message.thread_id
)
update public.general_mail_threads thread
set
  latest_message_at = rollup.latest_message_at,
  last_inbound_at = rollup.last_inbound_at,
  last_outbound_at = rollup.last_outbound_at,
  updated_at = now()
from rollup
where thread.thread_id = rollup.thread_id
  and (
    thread.latest_message_at is distinct from rollup.latest_message_at
    or thread.last_inbound_at is distinct from rollup.last_inbound_at
    or thread.last_outbound_at is distinct from rollup.last_outbound_at
  );
