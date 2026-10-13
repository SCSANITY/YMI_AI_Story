-- Preview-first phase1: formal manual production state, source-only candidate.
-- No business data, permissions, policies, claim functions or defaults changed.
begin;

do $preflight$
declare
  v_labels text[];
  v_table text;
  v_constraint text;
  v_allowed text[];
  v_definition text;
  v_expected text;
  v_extended text;
begin
  if pg_catalog.to_regclass('public.jobs') is null
    or pg_catalog.to_regclass('public.final_jobs') is null
    or pg_catalog.to_regclass('public.final_job_pages') is null
    or pg_catalog.to_regprocedure('public.claim_next_job(text,text[],integer)') is null then
    raise exception 'Required Final production relations/typed claim are missing';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_attribute
    where attrelid = 'public.jobs'::regclass and attname = 'status'
      and atttypid = pg_catalog.to_regtype('public.job_status') and not attisdropped
  ) then
    raise exception 'Unexpected jobs.status type';
  end if;
  select pg_catalog.array_agg(e.enumlabel::text order by e.enumsortorder)
    into v_labels
  from pg_catalog.pg_enum e
  where e.enumtypid = pg_catalog.to_regtype('public.job_status')
    and e.enumlabel <> 'manual_pending';
  if v_labels is distinct from array['queued','running','done','failed','cancel_requested','cancelled']::text[] then
    raise exception 'Unexpected job_status labels; stop for catalog alignment';
  end if;

  for v_table, v_constraint, v_allowed in
    select * from (values
      ('final_jobs', 'final_jobs_status_check', array['queued','processing','review_pending','needs_fix','releasing','completed','failed']::text[]),
      ('final_job_pages', 'final_job_pages_status_check', array['queued','processing','pending_review','approved','needs_fix','rerunning','replaced','failed']::text[])
    ) as expected(table_name, constraint_name, allowed_values)
  loop
    select pg_catalog.regexp_replace(pg_catalog.lower(pg_catalog.pg_get_constraintdef(c.oid)), '[[:space:]()]', '', 'g')
      into v_definition
    from pg_catalog.pg_constraint c
    where c.conrelid = pg_catalog.to_regclass('public.' || v_table)
      and c.conname = v_constraint and c.contype = 'c' and c.convalidated;
    select 'checkstatus=anyarray[' || pg_catalog.string_agg(pg_catalog.format('%L::text', value), ',' order by position) || ']'
      into v_expected
    from pg_catalog.unnest(v_allowed) with ordinality as allowed(value, position);
    select 'checkstatus=anyarray[' || pg_catalog.string_agg(pg_catalog.format('%L::text', value), ',' order by position) || ']'
      into v_extended
    from pg_catalog.unnest(v_allowed || array['manual_pending']::text[]) with ordinality as allowed(value, position);
    if v_definition is null or v_definition not in (v_expected, v_extended) then
      raise exception 'Unexpected Final status constraint; stop for catalog alignment';
    end if;
  end loop;
end;
$preflight$;

-- Do not cast/use this new enum value until this transaction has committed.
alter type public.job_status add value if not exists 'manual_pending';

alter table public.final_jobs drop constraint final_jobs_status_check;
alter table public.final_jobs add constraint final_jobs_status_check check (
  status = any (array['queued','processing','review_pending','needs_fix','releasing','completed','failed','manual_pending']::text[])
);
alter table public.final_job_pages drop constraint final_job_pages_status_check;
alter table public.final_job_pages add constraint final_job_pages_status_check check (
  status = any (array['queued','processing','pending_review','approved','needs_fix','rerunning','replaced','failed','manual_pending']::text[])
);

commit;
notify pgrst, 'reload schema';
