-- YMI Support ticket center: threaded customer questions, Admin replies, and
-- Resend Inbound webhook idempotency.
--
-- Run after sql_support_questions.sql and sql_email_events.sql.

create extension if not exists pgcrypto;

alter table public.support_questions
  add column if not exists ticket_code text,
  add column if not exists reply_token text,
  add column if not exists order_id uuid references public.orders(order_id) on delete set null,
  add column if not exists assigned_admin_customer_id uuid references public.customers(customer_id) on delete set null,
  add column if not exists last_message_at timestamptz,
  add column if not exists last_message_preview text,
  add column if not exists last_message_direction text,
  add column if not exists unread_admin_count integer not null default 0,
  add column if not exists closed_at timestamptz;

update public.support_questions
set ticket_code = upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10))
where ticket_code is null;

update public.support_questions
set reply_token = encode(gen_random_bytes(12), 'hex')
where reply_token is null;

alter table public.support_questions
  drop constraint if exists support_questions_status_check;

update public.support_questions
set status = 'waiting_customer'
where status = 'replied';

alter table public.support_questions
  alter column ticket_code set default upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10)),
  alter column ticket_code set not null,
  alter column reply_token set default encode(gen_random_bytes(12), 'hex'),
  alter column reply_token set not null;

alter table public.support_questions
  add constraint support_questions_status_check
  check (status in ('new', 'waiting_customer', 'customer_replied', 'closed', 'archived'));

alter table public.support_questions
  drop constraint if exists support_questions_last_message_direction_check;

alter table public.support_questions
  add constraint support_questions_last_message_direction_check
  check (last_message_direction is null or last_message_direction in ('customer', 'admin'));

alter table public.support_questions
  drop constraint if exists support_questions_unread_admin_count_check;

alter table public.support_questions
  add constraint support_questions_unread_admin_count_check
  check (unread_admin_count >= 0);

create unique index if not exists support_questions_ticket_code_key
  on public.support_questions(ticket_code);

create unique index if not exists support_questions_reply_token_key
  on public.support_questions(reply_token);

create index if not exists support_questions_last_message_at_idx
  on public.support_questions(last_message_at desc nulls last);

create table if not exists public.support_messages (
  message_id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.support_questions(question_id) on delete cascade,
  direction text not null,
  source text not null,
  body_text text not null,
  sender_email text not null,
  sender_display_name text,
  admin_customer_id uuid references public.customers(customer_id) on delete set null,
  delivery_status text not null,
  delivery_error text,
  email_event_id uuid references public.email_events(email_event_id) on delete set null,
  provider_email_id text,
  internet_message_id text,
  in_reply_to text,
  references_header text,
  attachment_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  constraint support_messages_direction_check
    check (direction in ('customer', 'admin')),
  constraint support_messages_source_check
    check (source in ('web_form', 'admin_reply', 'email_inbound')),
  constraint support_messages_delivery_status_check
    check (delivery_status in ('received', 'pending', 'sent', 'failed')),
  constraint support_messages_body_length_check
    check (char_length(body_text) between 1 and 20000),
  constraint support_messages_attachment_count_check
    check (attachment_count >= 0)
);

create index if not exists support_messages_question_created_at_idx
  on public.support_messages(question_id, created_at asc);

create unique index if not exists support_messages_provider_email_id_key
  on public.support_messages(provider_email_id)
  where provider_email_id is not null;

create unique index if not exists support_messages_internet_message_id_key
  on public.support_messages(internet_message_id)
  where internet_message_id is not null;

-- Preserve existing questions as the first message in each ticket.
insert into public.support_messages (
  question_id,
  direction,
  source,
  body_text,
  sender_email,
  sender_display_name,
  delivery_status,
  created_at,
  updated_at
)
select
  question_id,
  'customer',
  'web_form',
  question,
  email,
  display_name,
  'received',
  created_at,
  updated_at
from public.support_questions q
where not exists (
  select 1
  from public.support_messages m
  where m.question_id = q.question_id
    and m.source = 'web_form'
);

update public.support_questions q
set
  last_message_at = coalesce(q.last_message_at, q.created_at),
  last_message_preview = coalesce(q.last_message_preview, left(q.question, 240)),
  last_message_direction = coalesce(q.last_message_direction, 'customer'),
  unread_admin_count = case
    when q.status in ('new', 'customer_replied') then greatest(q.unread_admin_count, 1)
    else q.unread_admin_count
  end;

create table if not exists public.support_webhook_events (
  webhook_event_id text primary key,
  event_type text not null,
  provider_email_id text,
  question_id uuid references public.support_questions(question_id) on delete set null,
  processing_status text not null default 'processing',
  reason text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint support_webhook_events_status_check
    check (processing_status in ('processing', 'processed', 'ignored', 'rejected', 'failed'))
);

create unique index if not exists support_webhook_events_provider_email_id_key
  on public.support_webhook_events(provider_email_id)
  where provider_email_id is not null;

create or replace function public.sync_support_ticket_from_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_should_sync boolean := false;
begin
  if tg_op = 'INSERT' then
    v_should_sync :=
      (new.direction = 'customer' and new.delivery_status = 'received')
      or (new.direction = 'admin' and new.delivery_status = 'sent');
  elsif tg_op = 'UPDATE' then
    v_should_sync :=
      new.delivery_status is distinct from old.delivery_status
      and new.delivery_status in ('received', 'sent');
  end if;

  if not v_should_sync then
    return new;
  end if;

  if new.direction = 'customer' then
    update public.support_questions
    set
      status = case when new.source = 'web_form' then 'new' else 'customer_replied' end,
      last_message_at = new.created_at,
      last_message_preview = left(new.body_text, 240),
      last_message_direction = 'customer',
      unread_admin_count = unread_admin_count + 1,
      closed_at = null,
      updated_at = now()
    where question_id = new.question_id;
  else
    update public.support_questions
    set
      status = 'waiting_customer',
      last_message_at = coalesce(new.sent_at, new.created_at),
      last_message_preview = left(new.body_text, 240),
      last_message_direction = 'admin',
      closed_at = null,
      updated_at = now()
    where question_id = new.question_id;
  end if;

  return new;
end;
$$;

drop trigger if exists support_messages_sync_ticket on public.support_messages;
create trigger support_messages_sync_ticket
after insert or update of delivery_status on public.support_messages
for each row execute function public.sync_support_ticket_from_message();

create or replace function public.create_support_question(
  p_customer_id uuid,
  p_email text,
  p_display_name text,
  p_question text,
  p_order_id uuid default null
)
returns table(question_id uuid, ticket_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_question public.support_questions%rowtype;
  v_normalized_email text := lower(trim(p_email));
begin
  perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text, 0));

  if char_length(trim(p_question)) < 1 or char_length(trim(p_question)) > 4000 then
    raise exception 'support_question_invalid' using errcode = '22023';
  end if;

  if v_normalized_email = '' then
    raise exception 'support_email_invalid' using errcode = '22023';
  end if;

  if (
    select count(*)
    from public.support_questions
    where customer_id = p_customer_id
      and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'support_rate_limited' using errcode = 'P0001';
  end if;

  if p_order_id is not null and not exists (
    select 1
    from public.orders
    where order_id = p_order_id
      and customer_id = p_customer_id
  ) then
    raise exception 'support_order_not_owned' using errcode = '42501';
  end if;

  insert into public.support_questions (
    customer_id,
    email,
    display_name,
    question,
    order_id,
    status
  ) values (
    p_customer_id,
    v_normalized_email,
    nullif(trim(p_display_name), ''),
    trim(p_question),
    p_order_id,
    'new'
  )
  returning * into v_question;

  insert into public.support_messages (
    question_id,
    direction,
    source,
    body_text,
    sender_email,
    sender_display_name,
    delivery_status
  ) values (
    v_question.question_id,
    'customer',
    'web_form',
    trim(p_question),
    v_normalized_email,
    nullif(trim(p_display_name), ''),
    'received'
  );

  return query select v_question.question_id, v_question.ticket_code;
end;
$$;

alter table public.support_questions enable row level security;
alter table public.support_messages enable row level security;
alter table public.support_webhook_events enable row level security;

revoke all on table public.support_questions from public, anon, authenticated;
revoke all on table public.support_messages from public, anon, authenticated;
revoke all on table public.support_webhook_events from public, anon, authenticated;
revoke all on function public.create_support_question(uuid, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.sync_support_ticket_from_message()
  from public, anon, authenticated;

grant select, insert, update, delete on table public.support_questions to service_role;
grant select, insert, update, delete on table public.support_messages to service_role;
grant select, insert, update, delete on table public.support_webhook_events to service_role;
grant execute on function public.create_support_question(uuid, text, text, text, uuid)
  to service_role;
