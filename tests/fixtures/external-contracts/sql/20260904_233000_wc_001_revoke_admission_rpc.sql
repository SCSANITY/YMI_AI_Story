-- WC-001 postcheck correction: keep the admission function trigger-only.
-- Production execution requires separate owner authorization.

do $preflight$
begin
  if to_regprocedure('public.enforce_job_queue_admission_v1()') is null then
    raise exception 'Required admission function is unavailable';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    join pg_catalog.pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_catalog.pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
    where namespace_row.nspname = 'public'
      and table_row.relname = 'jobs'
      and trigger_row.tgname = 'jobs_enforce_queue_admission_v1'
      and trigger_row.tgenabled = 'O'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'Required enabled admission trigger is unavailable';
  end if;
end;
$preflight$;

revoke all on function public.enforce_job_queue_admission_v1()
from public, anon, authenticated, service_role;
