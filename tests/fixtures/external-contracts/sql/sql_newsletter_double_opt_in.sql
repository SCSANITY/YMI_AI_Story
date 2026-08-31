alter table public.newsletter_subscribers
  drop constraint if exists newsletter_subscribers_status_check;

alter table public.newsletter_subscribers
  add column if not exists confirmation_token_hash text,
  add column if not exists confirmation_expires_at timestamptz;

alter table public.newsletter_subscribers
  add constraint newsletter_subscribers_status_check
  check (status in ('pending', 'active', 'unsubscribed', 'bounced'));

create unique index if not exists newsletter_confirmation_token_unique
  on public.newsletter_subscribers (confirmation_token_hash)
  where confirmation_token_hash is not null;

alter table public.newsletter_subscribers enable row level security;
revoke all on table public.newsletter_subscribers from public, anon, authenticated;
grant all on table public.newsletter_subscribers to service_role;

create table if not exists public.newsletter_signup_rate_limits (
  scope text not null check (scope in ('email', 'ip')),
  key_hash text not null check (key_hash ~ '^[a-f0-9]{64}$'),
  request_times timestamptz[] not null default '{}'::timestamptz[],
  updated_at timestamptz not null default now(),
  primary key (scope, key_hash)
);

alter table public.newsletter_signup_rate_limits enable row level security;
revoke all on table public.newsletter_signup_rate_limits from public, anon, authenticated;
grant all on table public.newsletter_signup_rate_limits to service_role;

create or replace function public.consume_newsletter_signup_rate_limit(
  p_email_key text,
  p_ip_key text default null
)
returns table (allowed boolean, retry_after_seconds integer, limit_scope text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_email public.newsletter_signup_rate_limits%rowtype;
  v_ip public.newsletter_signup_rate_limits%rowtype;
  v_email_times timestamptz[];
  v_ip_times timestamptz[] := '{}'::timestamptz[];
  v_retry integer;
begin
  if p_email_key is null or p_email_key !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid newsletter email key';
  end if;
  if p_ip_key is not null and p_ip_key !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid newsletter IP key';
  end if;

  insert into public.newsletter_signup_rate_limits (scope, key_hash)
  values ('email', p_email_key) on conflict do nothing;
  if p_ip_key is not null then
    insert into public.newsletter_signup_rate_limits (scope, key_hash)
    values ('ip', p_ip_key) on conflict do nothing;
  end if;

  select * into v_email
  from public.newsletter_signup_rate_limits
  where scope = 'email' and key_hash = p_email_key
  for update;

  select coalesce(array_agg(t order by t), '{}'::timestamptz[])
  into v_email_times
  from unnest(v_email.request_times) t
  where t > v_now - interval '1 hour';

  if p_ip_key is not null then
    select * into v_ip
    from public.newsletter_signup_rate_limits
    where scope = 'ip' and key_hash = p_ip_key
    for update;

    select coalesce(array_agg(t order by t), '{}'::timestamptz[])
    into v_ip_times
    from unnest(v_ip.request_times) t
    where t > v_now - interval '1 hour';
  end if;

  if cardinality(v_email_times) >= 3 then
    v_retry := greatest(1, ceil(extract(epoch from (v_email_times[1] + interval '1 hour' - v_now)))::integer);
    return query select false, v_retry, 'email_hourly'::text;
    return;
  end if;
  if p_ip_key is not null and cardinality(v_ip_times) >= 10 then
    v_retry := greatest(1, ceil(extract(epoch from (v_ip_times[1] + interval '1 hour' - v_now)))::integer);
    return query select false, v_retry, 'ip_hourly'::text;
    return;
  end if;

  update public.newsletter_signup_rate_limits
  set request_times = v_email_times || v_now, updated_at = v_now
  where scope = 'email' and key_hash = p_email_key;
  if p_ip_key is not null then
    update public.newsletter_signup_rate_limits
    set request_times = v_ip_times || v_now, updated_at = v_now
    where scope = 'ip' and key_hash = p_ip_key;
  end if;

  return query select true, 0, 'allowed'::text;
end;
$$;

revoke all on function public.consume_newsletter_signup_rate_limit(text, text) from public, anon, authenticated;
grant execute on function public.consume_newsletter_signup_rate_limit(text, text) to service_role;
