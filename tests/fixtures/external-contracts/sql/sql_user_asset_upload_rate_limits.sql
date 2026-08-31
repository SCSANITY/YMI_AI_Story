-- Deploy before the application route that calls consume_user_asset_upload_rate_limit.

create table if not exists public.user_asset_upload_rate_limits (
  scope text not null check (scope in ('owner', 'ip')),
  key_hash text not null check (key_hash ~ '^[a-f0-9]{64}$'),
  request_times timestamptz[] not null default '{}'::timestamptz[],
  updated_at timestamptz not null default now(),
  primary key (scope, key_hash)
);

alter table public.user_asset_upload_rate_limits enable row level security;
revoke all on table public.user_asset_upload_rate_limits from public, anon, authenticated;
grant all on table public.user_asset_upload_rate_limits to service_role;

create or replace function public.consume_user_asset_upload_rate_limit(
  p_owner_key text,
  p_ip_key text default null
)
returns table (allowed boolean, retry_after_seconds integer, limit_scope text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_owner public.user_asset_upload_rate_limits%rowtype;
  v_ip public.user_asset_upload_rate_limits%rowtype;
  v_owner_times timestamptz[];
  v_ip_times timestamptz[] := '{}'::timestamptz[];
  v_retry integer;
begin
  if p_owner_key is null or p_owner_key !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid upload owner key';
  end if;
  if p_ip_key is not null and p_ip_key !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid upload IP key';
  end if;

  insert into public.user_asset_upload_rate_limits (scope, key_hash)
  values ('owner', p_owner_key)
  on conflict do nothing;
  if p_ip_key is not null then
    insert into public.user_asset_upload_rate_limits (scope, key_hash)
    values ('ip', p_ip_key)
    on conflict do nothing;
  end if;

  select * into v_owner
  from public.user_asset_upload_rate_limits
  where scope = 'owner' and key_hash = p_owner_key
  for update;

  select coalesce(array_agg(t order by t), '{}'::timestamptz[])
  into v_owner_times
  from unnest(v_owner.request_times) t
  where t > v_now - interval '1 hour';

  if p_ip_key is not null then
    select * into v_ip
    from public.user_asset_upload_rate_limits
    where scope = 'ip' and key_hash = p_ip_key
    for update;

    select coalesce(array_agg(t order by t), '{}'::timestamptz[])
    into v_ip_times
    from unnest(v_ip.request_times) t
    where t > v_now - interval '1 hour';
  end if;

  if cardinality(v_owner_times) >= 12 then
    v_retry := greatest(1, ceil(extract(epoch from (v_owner_times[1] + interval '1 hour' - v_now)))::integer);
    return query select false, v_retry, 'owner_hourly'::text;
    return;
  end if;
  if p_ip_key is not null and cardinality(v_ip_times) >= 30 then
    v_retry := greatest(1, ceil(extract(epoch from (v_ip_times[1] + interval '1 hour' - v_now)))::integer);
    return query select false, v_retry, 'ip_hourly'::text;
    return;
  end if;

  update public.user_asset_upload_rate_limits
  set request_times = v_owner_times || v_now, updated_at = v_now
  where scope = 'owner' and key_hash = p_owner_key;
  if p_ip_key is not null then
    update public.user_asset_upload_rate_limits
    set request_times = v_ip_times || v_now, updated_at = v_now
    where scope = 'ip' and key_hash = p_ip_key;
  end if;

  return query select true, 0, 'allowed'::text;
end;
$$;

revoke all on function public.consume_user_asset_upload_rate_limit(text, text) from public, anon, authenticated;
grant execute on function public.consume_user_asset_upload_rate_limit(text, text) to service_role;
