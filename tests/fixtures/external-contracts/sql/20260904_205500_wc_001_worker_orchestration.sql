-- WC-001: harden Worker queue admission, lane-aware claims, and owned leases.
-- Production execution is not authorized by the existence of this file.

do $preflight$
declare
  v_missing_columns text[];
  v_missing_final_job_columns text[];
  v_missing_final_page_columns text[];
begin
  if to_regclass('public.jobs') is null then
    raise exception 'Required table public.jobs is unavailable';
  end if;
  if to_regclass('public.final_jobs') is null
    or to_regclass('public.final_job_pages') is null then
    raise exception 'Required Final review tables are unavailable';
  end if;

  if to_regprocedure('public.claim_next_job()') is null
    or to_regprocedure('public.claim_next_job(text,text[],integer)') is null
    or to_regprocedure('public.renew_job_lease(uuid,text,integer)') is null then
    raise exception 'Required Worker claim/lease functions are unavailable';
  end if;

  select pg_catalog.array_agg(required.column_name order by required.column_name)
  into v_missing_columns
  from (
    values
      ('claimed_at'),
      ('claimed_by'),
      ('claim_attempts'),
      ('created_at'),
      ('job_id'),
      ('job_type'),
      ('lease_expires_at'),
      ('status'),
      ('updated_at')
  ) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'jobs'
      and column_row.column_name = required.column_name
  );

  if v_missing_columns is not null then
    raise exception 'public.jobs is missing required columns: %', v_missing_columns;
  end if;

  select pg_catalog.array_agg(required.column_name order by required.column_name)
  into v_missing_final_job_columns
  from (
    values
      ('approved_pages'),
      ('error_message'),
      ('final_job_id'),
      ('job_id'),
      ('review_status'),
      ('status'),
      ('total_pages'),
      ('updated_at')
  ) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'final_jobs'
      and column_row.column_name = required.column_name
  );

  if v_missing_final_job_columns is not null then
    raise exception 'public.final_jobs is missing required columns: %', v_missing_final_job_columns;
  end if;

  if to_regprocedure('public.enforce_job_queue_admission_v1()') is not null then
    raise exception 'WC-001 admission function already exists';
  end if;

  if to_regprocedure('public.checkpoint_final_job_v1(uuid,text,text,text,integer,integer,text,boolean)') is not null
    or to_regprocedure('public.checkpoint_final_job_pages_v1(uuid,text,integer[],text,text,text,boolean)') is not null then
    raise exception 'WC-001 Final checkpoint functions already exist';
  end if;

  select pg_catalog.array_agg(required.column_name order by required.column_name)
  into v_missing_final_page_columns
  from (
    values
      ('ai_output_path'),
      ('approved_output_path'),
      ('error_message'),
      ('final_job_id'),
      ('page_index'),
      ('status'),
      ('updated_at')
  ) as required(column_name)
  where not exists (
    select 1
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = 'final_job_pages'
      and column_row.column_name = required.column_name
  );

  if v_missing_final_page_columns is not null then
    raise exception 'public.final_job_pages is missing required columns: %', v_missing_final_page_columns;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_indexes index_row
    where index_row.schemaname = 'public'
      and index_row.indexname in (
        'idx_jobs_claim_lane_queue',
        'idx_jobs_preview_active_customer',
        'idx_jobs_preview_active_anon'
      )
  ) then
    raise exception 'One or more WC-001 queue indexes already exist';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    join pg_catalog.pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_catalog.pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
    where namespace_row.nspname = 'public'
      and table_row.relname = 'jobs'
      and trigger_row.tgname = 'jobs_enforce_queue_admission_v1'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'WC-001 admission trigger already exists';
  end if;
end;
$preflight$;

create index idx_jobs_claim_lane_queue
  on public.jobs (job_type, status, created_at)
  where status in ('queued'::public.job_status, 'running'::public.job_status);

create index idx_jobs_preview_active_customer
  on public.jobs (customer_id, status)
  where job_type = 'preview'::public.job_type
    and status in ('queued'::public.job_status, 'running'::public.job_status)
    and customer_id is not null;

create index idx_jobs_preview_active_anon
  on public.jobs (anon_session_id, status)
  where job_type = 'preview'::public.job_type
    and status in ('queued'::public.job_status, 'running'::public.job_status)
    and anon_session_id is not null;

create function public.enforce_job_queue_admission_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_queued_preview integer;
  v_owner_active_preview integer;
begin
  -- Final jobs represent paid fulfillment and must remain durably admissible.
  -- Only repeatable customer Preview creation is bounded here.
  if new.status::text <> 'queued' or new.job_type::text <> 'preview' then
    return new;
  end if;

  -- Serialize only the small admission decision. Worker claim/read traffic does
  -- not take this lock, so Realtime wake and queue consumption remain independent.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ymi.jobs.queue-admission.v1', 0)
  );

  select pg_catalog.count(*)::integer
  into v_queued_preview
  from public.jobs job_row
  where job_row.status = 'queued'::public.job_status
    and job_row.job_type = 'preview'::public.job_type;

  if v_queued_preview >= 80 then
    raise exception 'job_queue_overloaded:queued_preview'
      using errcode = 'P0001', detail = 'The durable Preview queue has reached its admission limit.';
  end if;

  select pg_catalog.count(*)::integer
  into v_owner_active_preview
  from public.jobs job_row
  where job_row.job_type = 'preview'::public.job_type
    and job_row.status in ('queued'::public.job_status, 'running'::public.job_status)
    and job_row.owner_type = new.owner_type
    and job_row.anon_session_id is not distinct from new.anon_session_id
    and job_row.customer_id is not distinct from new.customer_id;

  if v_owner_active_preview >= 6 then
    raise exception 'job_queue_overloaded:preview_owner_active'
      using errcode = 'P0001', detail = 'The owner has reached the active Preview admission limit.';
  end if;

  return new;
end;
$function$;

create trigger jobs_enforce_queue_admission_v1
before insert on public.jobs
for each row
execute function public.enforce_job_queue_admission_v1();

-- The existing typed claim and renewal RPCs carry legacy parameter defaults.
-- PostgreSQL cannot remove those defaults with CREATE OR REPLACE, so replace
-- the three dependency-free overloads explicitly. DROP without CASCADE keeps
-- this migration fail-closed if an unexpected database dependency appears.
drop function public.claim_next_job();
drop function public.claim_next_job(text, text[], integer);
drop function public.renew_job_lease(uuid, text, integer);

create or replace function public.claim_next_job(
  p_worker_id text,
  p_job_types text[],
  p_lease_seconds integer
)
returns setof public.jobs
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if nullif(pg_catalog.btrim(p_worker_id), '') is null then
    raise exception 'worker_id_required' using errcode = '22023';
  end if;
  if p_job_types is null
    or pg_catalog.array_length(p_job_types, 1) is null
    or exists (
      select 1
      from pg_catalog.unnest(p_job_types) requested(job_type)
      where requested.job_type not in ('preview', 'final')
    ) then
    raise exception 'job_types_invalid' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 90 and 21600 then
    raise exception 'lease_seconds_invalid' using errcode = '22023';
  end if;

  return query
  with candidate as (
    select job_row.job_id
    from public.jobs job_row
    where job_row.job_type::text = any (p_job_types)
      and (
        job_row.status = 'queued'::public.job_status
        or (
          job_row.status = 'running'::public.job_status
          and (
            (
              job_row.lease_expires_at is not null
              and job_row.lease_expires_at < pg_catalog.clock_timestamp()
            )
            or (
              job_row.lease_expires_at is null
              and coalesce(job_row.claimed_at, job_row.updated_at, job_row.created_at)
                < pg_catalog.clock_timestamp() - interval '1 hour'
            )
          )
        )
      )
    order by
      case job_row.job_type::text when 'preview' then 0 else 1 end,
      job_row.created_at,
      job_row.job_id
    limit 1
    for update skip locked
  )
  update public.jobs job_row
  set status = 'running'::public.job_status,
      progress = greatest(coalesce(job_row.progress, 0), 1),
      claimed_by = pg_catalog.btrim(p_worker_id),
      claimed_at = pg_catalog.clock_timestamp(),
      lease_expires_at = pg_catalog.clock_timestamp()
        + pg_catalog.make_interval(secs => p_lease_seconds),
      claim_attempts = coalesce(job_row.claim_attempts, 0) + 1,
      updated_at = pg_catalog.clock_timestamp()
  from candidate
  where job_row.job_id = candidate.job_id
  returning job_row.*;
end;
$function$;

-- Temporary bridge for the owner-controlled local claimant. WC-001's
-- post-cutover migration removes this overload after the local process stops.
create or replace function public.claim_next_job()
returns setof public.jobs
language sql
security definer
set search_path = ''
as $function$
  select *
  from public.claim_next_job(
    'legacy:noarg',
    array['preview', 'final']::text[],
    21600
  );
$function$;

create or replace function public.renew_job_lease(
  p_job_id uuid,
  p_worker_id text,
  p_lease_seconds integer
)
returns public.jobs
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.jobs;
begin
  if p_job_id is null then
    raise exception 'job_id_required' using errcode = '22023';
  end if;
  if nullif(pg_catalog.btrim(p_worker_id), '') is null then
    raise exception 'worker_id_required' using errcode = '22023';
  end if;
  if p_lease_seconds is null or p_lease_seconds not between 90 and 21600 then
    raise exception 'lease_seconds_invalid' using errcode = '22023';
  end if;

  update public.jobs job_row
  set lease_expires_at = pg_catalog.clock_timestamp()
        + pg_catalog.make_interval(secs => p_lease_seconds),
      updated_at = pg_catalog.clock_timestamp()
  where job_row.job_id = p_job_id
    and job_row.status = 'running'::public.job_status
    and job_row.claimed_by = pg_catalog.btrim(p_worker_id)
  returning job_row.* into v_job;

  return v_job;
end;
$function$;

create function public.checkpoint_final_job_v1(
  p_job_id uuid,
  p_worker_id text,
  p_status text,
  p_review_status text,
  p_total_pages integer,
  p_approved_pages integer,
  p_error_message text,
  p_clear_error boolean
)
returns public.final_jobs
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.jobs;
  v_final_job public.final_jobs;
begin
  select job_row.*
  into v_job
  from public.jobs job_row
  where job_row.job_id = p_job_id
    and job_row.status = 'running'::public.job_status
    and job_row.claimed_by = pg_catalog.btrim(p_worker_id)
    and job_row.lease_expires_at > pg_catalog.clock_timestamp()
  for update;

  if v_job.job_id is null then
    raise exception 'job_lease_not_owned' using errcode = '55000';
  end if;

  update public.final_jobs final_job
  set status = coalesce(p_status, final_job.status),
      review_status = coalesce(p_review_status, final_job.review_status),
      total_pages = coalesce(p_total_pages, final_job.total_pages),
      approved_pages = coalesce(p_approved_pages, final_job.approved_pages),
      error_message = case
        when coalesce(p_clear_error, false) then null
        when p_error_message is not null then p_error_message
        else final_job.error_message
      end,
      updated_at = pg_catalog.clock_timestamp()
  where final_job.job_id = p_job_id
  returning final_job.* into v_final_job;

  if v_final_job.final_job_id is null then
    raise exception 'final_job_not_found' using errcode = 'P0002';
  end if;

  return v_final_job;
end;
$function$;

create function public.checkpoint_final_job_pages_v1(
  p_job_id uuid,
  p_worker_id text,
  p_page_indices integer[],
  p_status text,
  p_ai_output_path text,
  p_error_message text,
  p_protect_approved boolean
)
returns setof public.final_job_pages
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.jobs;
begin
  if p_page_indices is null or pg_catalog.array_length(p_page_indices, 1) is null then
    raise exception 'page_indices_required' using errcode = '22023';
  end if;

  select job_row.*
  into v_job
  from public.jobs job_row
  where job_row.job_id = p_job_id
    and job_row.status = 'running'::public.job_status
    and job_row.claimed_by = pg_catalog.btrim(p_worker_id)
    and job_row.lease_expires_at > pg_catalog.clock_timestamp()
  for update;

  if v_job.job_id is null then
    raise exception 'job_lease_not_owned' using errcode = '55000';
  end if;

  return query
  update public.final_job_pages final_page
  set status = coalesce(p_status, final_page.status),
      ai_output_path = case
        when p_ai_output_path is not null then p_ai_output_path
        else final_page.ai_output_path
      end,
      error_message = p_error_message,
      updated_at = pg_catalog.clock_timestamp()
  from public.final_jobs final_job
  where final_job.job_id = p_job_id
    and final_page.final_job_id = final_job.final_job_id
    and final_page.page_index = any (p_page_indices)
    and (
      not coalesce(p_protect_approved, false)
      or final_page.approved_output_path is null
    )
  returning final_page.*;
end;
$function$;

revoke all on function public.enforce_job_queue_admission_v1() from public, anon, authenticated;
revoke all on function public.claim_next_job(text, text[], integer) from public, anon, authenticated;
revoke all on function public.claim_next_job() from public, anon, authenticated;
revoke all on function public.renew_job_lease(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.checkpoint_final_job_v1(uuid, text, text, text, integer, integer, text, boolean) from public, anon, authenticated;
revoke all on function public.checkpoint_final_job_pages_v1(uuid, text, integer[], text, text, text, boolean) from public, anon, authenticated;

grant execute on function public.claim_next_job(text, text[], integer) to service_role;
grant execute on function public.claim_next_job() to service_role;
grant execute on function public.renew_job_lease(uuid, text, integer) to service_role;
grant execute on function public.checkpoint_final_job_v1(uuid, text, text, text, integer, integer, text, boolean) to service_role;
grant execute on function public.checkpoint_final_job_pages_v1(uuid, text, integer[], text, text, text, boolean) to service_role;
