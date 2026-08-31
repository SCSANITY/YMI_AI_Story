-- YMI root-domain inbound email M2: direct Support intake and threading.
--
-- Run after sql_support_ticket_center.sql and
-- sql_root_email_inbound_foundation.sql.

begin;

do $$
begin
  if to_regclass('public.support_questions') is null
    or to_regclass('public.support_messages') is null
    or to_regclass('public.inbound_email_envelopes') is null then
    raise exception 'Support ticket center and inbound email foundation must be applied first';
  end if;
end;
$$;

-- A direct email address is a communication identity, not account authority.
-- Email-created tickets therefore remain unlinked until an authenticated flow
-- explicitly establishes customer ownership.
alter table public.support_questions
  alter column customer_id drop not null;

-- A first inbound email opens a new ticket. Later customer messages, including
-- replies to a closed ticket, move the existing ticket to customer_replied.
create or replace function public.sync_support_ticket_from_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_should_sync boolean := false;
  v_is_first_customer_message boolean := false;
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
    select not exists (
      select 1
      from public.support_messages existing
      where existing.question_id = new.question_id
        and existing.message_id <> new.message_id
        and existing.direction = 'customer'
        and existing.delivery_status = 'received'
    ) into v_is_first_customer_message;

    update public.support_questions
    set
      status = case
        when new.source = 'web_form' or v_is_first_customer_message then 'new'
        else 'customer_replied'
      end,
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

create or replace function public.create_inbound_support_ticket(
  p_provider_email_id text,
  p_internet_message_id text,
  p_sender_email text,
  p_sender_display_name text,
  p_body_text text,
  p_attachment_count integer default 0
)
returns table(created_question_id uuid, created_ticket_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_question public.support_questions%rowtype;
  v_existing_question_id uuid;
  v_existing_ticket_code text;
  v_normalized_email text := lower(trim(p_sender_email));
  v_body text := trim(p_body_text);
begin
  if p_provider_email_id is null
    or char_length(trim(p_provider_email_id)) < 1
    or char_length(trim(p_provider_email_id)) > 500 then
    raise exception 'support_provider_email_id_invalid' using errcode = '22023';
  end if;

  -- Provider email id is the sole thread-creation idempotency authority.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(trim(p_provider_email_id), 0)
  );

  select message.question_id, question.ticket_code
  into v_existing_question_id, v_existing_ticket_code
  from public.support_messages message
  join public.support_questions question on question.question_id = message.question_id
  where message.provider_email_id = trim(p_provider_email_id)
  limit 1;

  if found then
    return query select v_existing_question_id, v_existing_ticket_code;
    return;
  end if;

  if v_normalized_email is null
    or v_normalized_email = ''
    or char_length(v_normalized_email) > 320
    or v_normalized_email !~ '^[^[:space:]<>@]+@[^[:space:]<>@]+\.[^[:space:]<>@]+$' then
    raise exception 'support_email_invalid' using errcode = '22023';
  end if;

  if v_body is null or char_length(v_body) < 1 or char_length(v_body) > 20000 then
    raise exception 'support_question_invalid' using errcode = '22023';
  end if;

  if p_attachment_count is null or p_attachment_count < 0 or p_attachment_count > 1000 then
    raise exception 'support_attachment_count_invalid' using errcode = '22023';
  end if;

  -- Serialize the sender-level rolling-window check without granting account
  -- ownership or looking up a customer by email.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('support-email:' || v_normalized_email, 0)
  );

  if (
    select count(*)
    from public.support_questions
    where customer_id is null
      and lower(email) = v_normalized_email
      and created_at > now() - interval '1 hour'
  ) >= 5 then
    raise exception 'support_email_rate_limited' using errcode = 'P0001';
  end if;

  insert into public.support_questions (
    customer_id,
    email,
    display_name,
    question,
    order_id,
    status
  ) values (
    null,
    v_normalized_email,
    nullif(left(trim(p_sender_display_name), 200), ''),
    v_body,
    null,
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
    delivery_status,
    provider_email_id,
    internet_message_id,
    attachment_count
  ) values (
    v_question.question_id,
    'customer',
    'email_inbound',
    v_body,
    v_normalized_email,
    nullif(left(trim(p_sender_display_name), 200), ''),
    'received',
    trim(p_provider_email_id),
    p_internet_message_id,
    p_attachment_count
  );

  return query select v_question.question_id, v_question.ticket_code;
end;
$$;

-- Apply the M1 defense-in-depth carry-forward to installations that already
-- ran the foundation SQL.
alter function public.claim_inbound_email_envelope(text, integer)
  set search_path = '';

revoke all on function public.create_inbound_support_ticket(
  text, text, text, text, text, integer
) from public, anon, authenticated;
revoke all on function public.sync_support_ticket_from_message()
  from public, anon, authenticated;

grant execute on function public.create_inbound_support_ticket(
  text, text, text, text, text, integer
) to service_role;

commit;
