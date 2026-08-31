-- YMI root-domain inbound email M3: General Inbox operational surface.
--
-- Run after sql_root_email_direct_support.sql.

begin;

do $$
begin
  if to_regclass('public.inbound_email_envelopes') is null
    or to_regclass('public.email_events') is null then
    raise exception 'Inbound email foundation and email events must be applied first';
  end if;
end;
$$;

alter table public.inbound_email_envelopes
  add column if not exists in_reply_to text,
  add column if not exists references_header text,
  add column if not exists admin_read_at timestamptz,
  add column if not exists archived_at timestamptz;

alter table public.inbound_email_envelopes
  drop constraint if exists inbound_email_envelopes_in_reply_to_length_check,
  drop constraint if exists inbound_email_envelopes_references_header_length_check;

alter table public.inbound_email_envelopes
  add constraint inbound_email_envelopes_in_reply_to_length_check
    check (in_reply_to is null or char_length(in_reply_to) <= 500),
  add constraint inbound_email_envelopes_references_header_length_check
    check (references_header is null or char_length(references_header) <= 4000);

create index if not exists inbound_email_envelopes_general_inbox_idx
  on public.inbound_email_envelopes(archived_at, admin_read_at, created_at desc)
  where route_kind in ('general', 'operational_support');

create table if not exists public.inbound_email_replies (
  reply_id uuid primary key,
  inbound_email_id uuid not null
    references public.inbound_email_envelopes(inbound_email_id) on delete cascade,
  admin_customer_id uuid
    references public.customers(customer_id) on delete set null,
  from_email text not null,
  to_email text not null,
  reply_to text not null,
  subject text not null,
  body_text text not null,
  delivery_status text not null default 'pending',
  delivery_error text,
  email_event_id uuid references public.email_events(email_event_id) on delete set null,
  provider_email_id text,
  in_reply_to text,
  references_header text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  constraint inbound_email_replies_delivery_status_check
    check (delivery_status in ('pending', 'sent', 'failed')),
  constraint inbound_email_replies_from_email_length_check
    check (char_length(from_email) between 3 and 320),
  constraint inbound_email_replies_to_email_length_check
    check (char_length(to_email) between 3 and 320),
  constraint inbound_email_replies_reply_to_length_check
    check (char_length(reply_to) between 3 and 320),
  constraint inbound_email_replies_subject_length_check
    check (char_length(subject) between 1 and 1000),
  constraint inbound_email_replies_body_length_check
    check (char_length(body_text) between 1 and 20000),
  constraint inbound_email_replies_provider_email_id_length_check
    check (provider_email_id is null or char_length(provider_email_id) <= 500),
  constraint inbound_email_replies_in_reply_to_length_check
    check (in_reply_to is null or char_length(in_reply_to) <= 500),
  constraint inbound_email_replies_references_header_length_check
    check (references_header is null or char_length(references_header) <= 4000)
);

create index if not exists inbound_email_replies_inbound_created_at_idx
  on public.inbound_email_replies(inbound_email_id, created_at asc);

create unique index if not exists inbound_email_replies_provider_email_id_key
  on public.inbound_email_replies(provider_email_id)
  where provider_email_id is not null;

alter table public.inbound_email_replies enable row level security;

revoke all on table public.inbound_email_replies from public, anon, authenticated;
grant select, insert, update, delete on table public.inbound_email_replies to service_role;

-- M1 parked these rows until M3 existed. Re-enter them at their durable
-- content checkpoint so the existing claim/recovery path applies the M3 route.
update public.inbound_email_envelopes
set
  processing_status = 'failed',
  processing_started_at = null,
  last_error = 'm3_route_ready',
  updated_at = now()
where route_kind in ('general', 'operational_support')
  and processing_status = 'pending_route'
  and processing_checkpoint = 'content_loaded';

commit;
