begin;

do $$
begin
  if to_regclass('public.support_questions') is null
    or to_regclass('public.support_messages') is null then
    raise exception 'sql_support_ticket_center.sql must be applied before sql_root_email_inbound_foundation.sql';
  end if;
end;
$$;

create table if not exists public.inbound_email_envelopes (
  inbound_email_id uuid primary key default gen_random_uuid(),
  provider text not null default 'resend',
  provider_email_id text not null,
  webhook_event_id text not null,
  internet_message_id text,
  from_email text,
  from_display_name text,
  to_addresses text[] not null default '{}',
  subject text,
  route_kind text not null,
  route_address text,
  processing_status text not null default 'persisted',
  processing_checkpoint text not null default 'envelope_persisted',
  body_text text,
  attachment_count integer not null default 0,
  attachment_status text not null default 'not_requested',
  question_id uuid references public.support_questions(question_id) on delete set null,
  attempt_count integer not null default 0,
  processing_started_at timestamptz,
  last_error text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inbound_email_envelopes_provider_check
    check (provider in ('resend')),
  constraint inbound_email_envelopes_provider_email_id_length_check
    check (char_length(provider_email_id) between 1 and 500),
  constraint inbound_email_envelopes_webhook_event_id_length_check
    check (char_length(webhook_event_id) between 1 and 500),
  constraint inbound_email_envelopes_internet_message_id_length_check
    check (internet_message_id is null or char_length(internet_message_id) <= 500),
  constraint inbound_email_envelopes_from_email_length_check
    check (from_email is null or char_length(from_email) <= 320),
  constraint inbound_email_envelopes_from_display_name_length_check
    check (from_display_name is null or char_length(from_display_name) <= 200),
  constraint inbound_email_envelopes_subject_length_check
    check (subject is null or char_length(subject) <= 1000),
  constraint inbound_email_envelopes_route_kind_check
    check (route_kind in (
      'ticket_reply',
      'support_direct',
      'operational_support',
      'general',
      'rejected_unknown',
      'rejected_ambiguous'
    )),
  constraint inbound_email_envelopes_route_address_length_check
    check (route_address is null or char_length(route_address) <= 320),
  constraint inbound_email_envelopes_processing_status_check
    check (processing_status in (
      'persisted',
      'processing',
      'pending_route',
      'processed',
      'rejected',
      'failed'
    )),
  constraint inbound_email_envelopes_processing_checkpoint_check
    check (processing_checkpoint in (
      'envelope_persisted',
      'content_loaded',
      'route_applied',
      'complete'
    )),
  constraint inbound_email_envelopes_body_length_check
    check (body_text is null or char_length(body_text) <= 20000),
  constraint inbound_email_envelopes_attachment_count_check
    check (attachment_count >= 0),
  constraint inbound_email_envelopes_attachment_status_check
    check (attachment_status in (
      'not_requested',
      'pending',
      'complete',
      'rejected',
      'failed'
    )),
  constraint inbound_email_envelopes_attempt_count_check
    check (attempt_count >= 0)
);

create unique index if not exists inbound_email_envelopes_provider_email_id_key
  on public.inbound_email_envelopes(provider, provider_email_id);

create unique index if not exists inbound_email_envelopes_webhook_event_id_key
  on public.inbound_email_envelopes(provider, webhook_event_id);

create index if not exists inbound_email_envelopes_recovery_idx
  on public.inbound_email_envelopes(processing_status, processing_started_at, created_at);

create index if not exists inbound_email_envelopes_route_idx
  on public.inbound_email_envelopes(route_kind, processing_status, created_at desc);

create index if not exists inbound_email_envelopes_internet_message_id_idx
  on public.inbound_email_envelopes(internet_message_id)
  where internet_message_id is not null;

create or replace function public.claim_inbound_email_envelope(
  p_provider_email_id text,
  p_stale_after_seconds integer default 120
)
returns setof public.inbound_email_envelopes
language sql
security definer
set search_path = ''
as $$
  update public.inbound_email_envelopes
  set
    processing_status = 'processing',
    processing_started_at = now(),
    attempt_count = attempt_count + 1,
    last_error = null,
    updated_at = now()
  where provider = 'resend'
    and provider_email_id = p_provider_email_id
    and (
      processing_status in ('persisted', 'failed')
      or (
        processing_status = 'processing'
        and processing_started_at <= now() - make_interval(secs => greatest(p_stale_after_seconds, 30))
      )
    )
  returning *;
$$;

alter table public.inbound_email_envelopes enable row level security;

revoke all on table public.inbound_email_envelopes from public, anon, authenticated;
revoke all on function public.claim_inbound_email_envelope(text, integer)
  from public, anon, authenticated;

grant select, insert, update, delete on table public.inbound_email_envelopes to service_role;
grant execute on function public.claim_inbound_email_envelope(text, integer) to service_role;

commit;
