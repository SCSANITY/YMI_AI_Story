-- YMI root-domain inbound email M4: bounded private attachment persistence.
--
-- Run after sql_root_email_general_inbox.sql.

begin;

do $$
begin
  if to_regclass('public.inbound_email_envelopes') is null
    or to_regclass('public.inbound_email_replies') is null then
    raise exception 'M3 General Inbox schema must be applied first';
  end if;
end;
$$;

alter table public.inbound_email_envelopes
  add column if not exists attachment_error text;

alter table public.inbound_email_envelopes
  drop constraint if exists inbound_email_envelopes_attachment_error_length_check;

alter table public.inbound_email_envelopes
  add constraint inbound_email_envelopes_attachment_error_length_check
  check (attachment_error is null or char_length(attachment_error) <= 500);

create table if not exists public.inbound_email_attachments (
  attachment_id uuid primary key default gen_random_uuid(),
  inbound_email_id uuid not null
    references public.inbound_email_envelopes(inbound_email_id) on delete cascade,
  provider_attachment_id text not null,
  original_filename text,
  safe_filename text not null,
  declared_content_type text,
  served_content_type text not null default 'application/octet-stream',
  content_disposition text,
  declared_size_bytes bigint not null default 0,
  stored_size_bytes bigint,
  sha256 text,
  provider_expires_at timestamptz,
  storage_bucket text,
  storage_path text,
  status text not null default 'pending',
  rejection_reason text,
  attempt_count integer not null default 0,
  processing_started_at timestamptz,
  stored_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inbound_email_attachments_provider_id_length_check
    check (char_length(provider_attachment_id) between 1 and 500),
  constraint inbound_email_attachments_original_filename_length_check
    check (original_filename is null or char_length(original_filename) <= 500),
  constraint inbound_email_attachments_safe_filename_length_check
    check (char_length(safe_filename) between 1 and 140),
  constraint inbound_email_attachments_content_type_length_check
    check (declared_content_type is null or char_length(declared_content_type) <= 200),
  constraint inbound_email_attachments_served_content_type_check
    check (served_content_type = 'application/octet-stream'),
  constraint inbound_email_attachments_content_disposition_check
    check (content_disposition is null or content_disposition in ('inline', 'attachment')),
  constraint inbound_email_attachments_size_check
    check (
      declared_size_bytes >= 0
      and (stored_size_bytes is null or stored_size_bytes >= 0)
    ),
  constraint inbound_email_attachments_sha256_check
    check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  constraint inbound_email_attachments_storage_check
    check (
      (status = 'stored' and storage_bucket is not null and storage_path is not null
        and stored_size_bytes is not null and sha256 is not null and stored_at is not null)
      or status <> 'stored'
    ),
  constraint inbound_email_attachments_status_check
    check (status in ('pending', 'processing', 'stored', 'rejected', 'failed')),
  constraint inbound_email_attachments_attempt_count_check
    check (attempt_count >= 0),
  constraint inbound_email_attachments_storage_bucket_length_check
    check (storage_bucket is null or char_length(storage_bucket) <= 100),
  constraint inbound_email_attachments_storage_path_length_check
    check (storage_path is null or char_length(storage_path) <= 1000),
  constraint inbound_email_attachments_rejection_reason_length_check
    check (rejection_reason is null or char_length(rejection_reason) <= 500)
);

create unique index if not exists inbound_email_attachments_provider_key
  on public.inbound_email_attachments(inbound_email_id, provider_attachment_id);

create unique index if not exists inbound_email_attachments_storage_path_key
  on public.inbound_email_attachments(storage_bucket, storage_path)
  where storage_bucket is not null and storage_path is not null;

create index if not exists inbound_email_attachments_status_idx
  on public.inbound_email_attachments(status, processing_started_at, created_at);

alter table public.inbound_email_attachments enable row level security;

revoke all on table public.inbound_email_attachments from public, anon, authenticated;
grant select, insert, update, delete on table public.inbound_email_attachments to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'inbound-email-private',
  'inbound-email-private',
  false,
  10485760,
  array['application/octet-stream']::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Existing accepted messages with attachments were deliberately left pending
-- for M4. Re-enter them at content_loaded so the M1 claim path imports bytes.
update public.inbound_email_envelopes
set
  processing_status = 'failed',
  processing_started_at = null,
  last_error = 'm4_attachment_import_ready',
  updated_at = now()
where attachment_count > 0
  and attachment_status = 'pending'
  and processing_checkpoint in ('content_loaded', 'route_applied', 'complete');

commit;
