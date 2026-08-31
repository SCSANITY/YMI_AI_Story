-- T4-007 S6: General Mail server invariants and unbounded read-model aggregation.
-- SQL Editor safe: no transaction/session state, temporary tables, or destructive backfill.

do $$
begin
  if to_regclass('public.general_mail_threads') is null
    or to_regclass('public.general_mail_messages') is null then
    raise exception 'T4-007 S2/S3 General Mail schema must be applied first';
  end if;

  if exists (
    select 1
    from public.general_mail_messages
    where in_reply_to is not null
      and cardinality(bcc_addresses) > 0
  ) then
    raise exception 'T4-007 S6 found a threaded General Mail message with BCC recipients';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.general_mail_messages'::regclass
      and conname = 'general_mail_messages_threaded_bcc_check'
  ) then
    alter table public.general_mail_messages
      add constraint general_mail_messages_threaded_bcc_check
      check (in_reply_to is null or cardinality(bcc_addresses) = 0)
      not valid;
  end if;
end;
$$;

alter table public.general_mail_messages
  validate constraint general_mail_messages_threaded_bcc_check;

create or replace function public.get_general_mail_mailbox_counts()
returns table (
  mailbox_key text,
  unread_count bigint,
  inbox_count bigint,
  sent_count bigint,
  draft_count bigint,
  archived_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with mailbox_keys(mailbox_key) as (
    values ('admin'::text), ('hello'), ('security'), ('orders'), ('delivery')
  ),
  thread_counts as (
    select
      thread.mailbox_key,
      count(*) filter (
        where thread.last_inbound_at is not null
          and thread.admin_read_at is null
          and thread.archived_at is null
      )::bigint as unread_count,
      count(*) filter (
        where thread.last_inbound_at is not null
          and thread.archived_at is null
      )::bigint as inbox_count,
      count(*) filter (where thread.archived_at is not null)::bigint as archived_count
    from public.general_mail_threads thread
    group by thread.mailbox_key
  ),
  message_counts as (
    select
      thread.mailbox_key,
      count(distinct message.thread_id) filter (
        where message.direction = 'outbound'
          and message.message_state in (
            'sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'suppressed'
          )
      )::bigint as sent_count,
      count(distinct message.thread_id) filter (
        where message.direction = 'outbound'
          and message.message_state in ('draft', 'failed')
      )::bigint as draft_count
    from public.general_mail_threads thread
    left join public.general_mail_messages message on message.thread_id = thread.thread_id
    group by thread.mailbox_key
  )
  select
    key.mailbox_key,
    coalesce(thread_count.unread_count, 0)::bigint,
    coalesce(thread_count.inbox_count, 0)::bigint,
    coalesce(message_count.sent_count, 0)::bigint,
    coalesce(message_count.draft_count, 0)::bigint,
    coalesce(thread_count.archived_count, 0)::bigint
  from mailbox_keys key
  left join thread_counts thread_count using (mailbox_key)
  left join message_counts message_count using (mailbox_key)
  order by array_position(array['admin', 'hello', 'security', 'orders', 'delivery'], key.mailbox_key);
$$;

create or replace function public.list_general_mail_thread_summaries(
  p_mailbox_key text,
  p_folder text,
  p_search text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  thread_id uuid,
  mailbox_key text,
  subject text,
  latest_message_at timestamptz,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  admin_read_at timestamptz,
  archived_at timestamptz,
  latest_direction text,
  latest_state text,
  latest_from text,
  latest_to text[],
  preview text,
  attachment_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_search text := nullif(trim(coalesce(p_search, '')), '');
begin
  if p_mailbox_key not in ('admin', 'hello', 'security', 'orders', 'delivery')
    or p_folder not in ('inbox', 'sent', 'drafts', 'archived')
    or p_limit < 1
    or p_limit > 100
    or p_offset < 0
    or char_length(coalesce(v_search, '')) > 100 then
    raise exception 'general_mail_list_invalid' using errcode = '22023';
  end if;

  return query
  with eligible as (
    select
      thread.thread_id,
      thread.mailbox_key,
      thread.subject,
      thread.latest_message_at,
      thread.last_inbound_at,
      thread.last_outbound_at,
      thread.admin_read_at,
      thread.archived_at
    from public.general_mail_threads thread
    where thread.mailbox_key = p_mailbox_key
      and (
        (p_folder = 'inbox' and thread.last_inbound_at is not null and thread.archived_at is null)
        or (p_folder = 'archived' and thread.archived_at is not null)
        or (
          p_folder = 'sent'
          and exists (
            select 1
            from public.general_mail_messages sent_message
            where sent_message.thread_id = thread.thread_id
              and sent_message.direction = 'outbound'
              and sent_message.message_state in (
                'sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'suppressed'
              )
          )
        )
        or (
          p_folder = 'drafts'
          and exists (
            select 1
            from public.general_mail_messages draft_message
            where draft_message.thread_id = thread.thread_id
              and draft_message.direction = 'outbound'
              and draft_message.message_state in ('draft', 'failed')
          )
        )
      )
      and (
        v_search is null
        or thread.subject ilike '%' || v_search || '%'
        or exists (
          select 1
          from public.general_mail_messages search_message
          where search_message.thread_id = thread.thread_id
            and (
              search_message.subject ilike '%' || v_search || '%'
              or search_message.from_address ilike '%' || v_search || '%'
              or array_to_string(search_message.to_addresses, ' ') ilike '%' || v_search || '%'
              or array_to_string(search_message.cc_addresses, ' ') ilike '%' || v_search || '%'
              or coalesce(search_message.body_text, '') ilike '%' || v_search || '%'
            )
        )
      )
  ),
  paged as (
    select eligible.*, count(*) over ()::bigint as total_count
    from eligible
    order by eligible.latest_message_at desc, eligible.thread_id desc
    limit p_limit
    offset p_offset
  )
  select
    page.thread_id,
    page.mailbox_key,
    page.subject,
    page.latest_message_at,
    page.last_inbound_at,
    page.last_outbound_at,
    page.admin_read_at,
    page.archived_at,
    latest.direction as latest_direction,
    latest.message_state as latest_state,
    latest.from_address as latest_from,
    latest.to_addresses as latest_to,
    left(coalesce(latest.body_text, ''), 240) as preview,
    coalesce(attachment.attachment_count, 0)::bigint as attachment_count,
    page.total_count
  from paged page
  join lateral (
    select message.*
    from public.general_mail_messages message
    where message.thread_id = page.thread_id
    order by
      coalesce(message.received_at, message.sent_at, message.created_at) desc,
      message.created_at desc,
      message.message_id desc
    limit 1
  ) latest on true
  left join lateral (
    select count(*)::bigint as attachment_count
    from public.general_mail_attachments item
    where item.message_id = latest.message_id
  ) attachment on true
  order by page.latest_message_at desc, page.thread_id desc;
end;
$$;

revoke all on function public.get_general_mail_mailbox_counts()
  from public, anon, authenticated;
revoke all on function public.list_general_mail_thread_summaries(text, text, text, integer, integer)
  from public, anon, authenticated;

grant execute on function public.get_general_mail_mailbox_counts() to service_role;
grant execute on function public.list_general_mail_thread_summaries(text, text, text, integer, integer)
  to service_role;
