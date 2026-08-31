-- T3-017 S3: immutable, manually prepared print-PDF handoff.
-- Run after sql_final_jobs_print_version.sql and before deploying the S3 app code.

create table if not exists public.final_print_artifacts (
  artifact_id uuid primary key default gen_random_uuid(),
  final_job_id uuid not null references public.final_jobs(final_job_id) on delete cascade,
  storage_bucket text not null default 'raw-private',
  storage_path text not null unique,
  original_filename text not null,
  declared_size_bytes bigint not null,
  verified_size_bytes bigint null,
  content_type text not null,
  status text not null default 'pending',
  uploaded_by uuid not null references public.customers(customer_id),
  verified_at timestamptz null,
  released_by uuid null references public.customers(customer_id),
  released_at timestamptz null,
  failure_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint final_print_artifacts_bucket_check check (storage_bucket = 'raw-private'),
  constraint final_print_artifacts_size_check check (
    declared_size_bytes > 0 and declared_size_bytes <= 629145600
  ),
  constraint final_print_artifacts_verified_size_check check (
    verified_size_bytes is null
    or (verified_size_bytes > 0 and verified_size_bytes <= 629145600)
  ),
  constraint final_print_artifacts_content_type_check check (content_type = 'application/pdf'),
  constraint final_print_artifacts_status_check check (
    status in ('pending', 'verified', 'released', 'superseded', 'failed')
  )
);

-- Existing projects may still have the original 250 MiB checks. Keep the
-- widening atomic under the SQL Editor's per-statement execution model.
do $block$
declare
  v_declared_definition text;
  v_verified_definition text;
begin
  select pg_get_constraintdef(oid)
  into v_declared_definition
  from pg_constraint
  where conrelid = 'public.final_print_artifacts'::regclass
    and conname = 'final_print_artifacts_size_check';

  if position('629145600' in coalesce(v_declared_definition, '')) = 0 then
    alter table public.final_print_artifacts
      drop constraint if exists final_print_artifacts_size_check;
    alter table public.final_print_artifacts
      add constraint final_print_artifacts_size_check
      check (declared_size_bytes > 0 and declared_size_bytes <= 629145600)
      not valid;
    alter table public.final_print_artifacts
      validate constraint final_print_artifacts_size_check;
  end if;

  select pg_get_constraintdef(oid)
  into v_verified_definition
  from pg_constraint
  where conrelid = 'public.final_print_artifacts'::regclass
    and conname = 'final_print_artifacts_verified_size_check';

  if position('629145600' in coalesce(v_verified_definition, '')) = 0 then
    alter table public.final_print_artifacts
      drop constraint if exists final_print_artifacts_verified_size_check;
    alter table public.final_print_artifacts
      add constraint final_print_artifacts_verified_size_check
      check (
        verified_size_bytes is null
        or (verified_size_bytes > 0 and verified_size_bytes <= 629145600)
      )
      not valid;
    alter table public.final_print_artifacts
      validate constraint final_print_artifacts_verified_size_check;
  end if;
end;
$block$;

alter table public.final_jobs
  add column if not exists print_package_artifact_id uuid null;

do $block$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'final_jobs_print_package_artifact_id_fkey'
      and conrelid = 'public.final_jobs'::regclass
  ) then
    alter table public.final_jobs
      add constraint final_jobs_print_package_artifact_id_fkey
      foreign key (print_package_artifact_id)
      references public.final_print_artifacts(artifact_id);
  end if;
end;
$block$;

create index if not exists idx_final_print_artifacts_job_created
  on public.final_print_artifacts(final_job_id, created_at desc);

create unique index if not exists idx_final_print_artifacts_one_verified
  on public.final_print_artifacts(final_job_id)
  where status = 'verified';

create unique index if not exists idx_final_print_artifacts_one_released
  on public.final_print_artifacts(final_job_id)
  where status = 'released';

alter table public.final_print_artifacts enable row level security;

create or replace function public.create_final_print_artifact(
  p_final_job_id uuid,
  p_artifact_id uuid,
  p_storage_path text,
  p_original_filename text,
  p_declared_size_bytes bigint,
  p_content_type text,
  p_admin_customer_id uuid
)
returns table (
  artifact_id uuid,
  storage_path text,
  artifact_status text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.final_jobs%rowtype;
begin
  if not exists (
    select 1 from public.customers
    where customer_id = p_admin_customer_id and role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Admin actor is required';
  end if;

  if p_storage_path is null
    or p_storage_path not like 'orders/%/final/print/manual/%.pdf'
    or p_original_filename is null
    or length(p_original_filename) > 180
    or p_declared_size_bytes <= 0
    or p_declared_size_bytes > 629145600
    or p_content_type is distinct from 'application/pdf' then
    raise exception using errcode = '22023', message = 'Invalid manual print PDF metadata';
  end if;

  select * into v_job
  from public.final_jobs
  where final_job_id = p_final_job_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Final job not found';
  end if;
  if v_job.released_at is null then
    raise exception using errcode = '55000', message = 'Customer PDF must be released first';
  end if;
  if v_job.print_status = 'released' or v_job.print_released_at is not null then
    raise exception using errcode = '55000', message = 'Print version has already been released';
  end if;

  insert into public.final_print_artifacts (
    artifact_id,
    final_job_id,
    storage_bucket,
    storage_path,
    original_filename,
    declared_size_bytes,
    content_type,
    status,
    uploaded_by
  ) values (
    p_artifact_id,
    p_final_job_id,
    'raw-private',
    p_storage_path,
    p_original_filename,
    p_declared_size_bytes,
    p_content_type,
    'pending',
    p_admin_customer_id
  );

  return query select p_artifact_id, p_storage_path, 'pending'::text;
end;
$function$;

create or replace function public.reject_final_print_artifact(
  p_final_job_id uuid,
  p_artifact_id uuid,
  p_failure_reason text,
  p_admin_customer_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_updated integer := 0;
begin
  if not exists (
    select 1 from public.customers
    where customer_id = p_admin_customer_id and role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Admin actor is required';
  end if;

  update public.final_print_artifacts as artifact
  set status = 'failed',
      failure_reason = left(coalesce(p_failure_reason, 'PDF verification failed'), 500),
      updated_at = now()
  where artifact.artifact_id = p_artifact_id
    and artifact.final_job_id = p_final_job_id
    and artifact.uploaded_by = p_admin_customer_id
    and artifact.status = 'pending';

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$function$;

create or replace function public.commit_final_print_artifact(
  p_final_job_id uuid,
  p_artifact_id uuid,
  p_verified_size_bytes bigint,
  p_content_type text,
  p_admin_customer_id uuid
)
returns table (
  artifact_id uuid,
  storage_path text,
  artifact_status text,
  verified_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.final_jobs%rowtype;
  v_artifact public.final_print_artifacts%rowtype;
  v_now timestamptz := now();
begin
  if not exists (
    select 1 from public.customers
    where customer_id = p_admin_customer_id and role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Admin actor is required';
  end if;

  select * into v_job
  from public.final_jobs
  where final_job_id = p_final_job_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Final job not found';
  end if;

  select * into v_artifact
  from public.final_print_artifacts as artifact
  where artifact.artifact_id = p_artifact_id
    and artifact.final_job_id = p_final_job_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Print PDF revision not found';
  end if;

  if v_job.print_status = 'released' or v_job.print_released_at is not null then
    if v_job.print_package_artifact_id = p_artifact_id and v_artifact.status = 'released' then
      return query select v_artifact.artifact_id, v_artifact.storage_path, v_artifact.status, v_artifact.verified_at;
      return;
    end if;
    raise exception using errcode = '55000', message = 'Print version has already been released';
  end if;

  if v_job.released_at is null then
    raise exception using errcode = '55000', message = 'Customer PDF must be released first';
  end if;

  if v_artifact.status = 'verified'
    and v_job.print_package_artifact_id = p_artifact_id
    and v_job.print_package_path = v_artifact.storage_path then
    return query select v_artifact.artifact_id, v_artifact.storage_path, v_artifact.status, v_artifact.verified_at;
    return;
  end if;

  if v_artifact.status <> 'pending' or v_artifact.uploaded_by <> p_admin_customer_id then
    raise exception using errcode = '40001', message = 'Print PDF revision is no longer pending for this upload';
  end if;
  if p_content_type is distinct from 'application/pdf'
    or p_verified_size_bytes <= 0
    or p_verified_size_bytes > 629145600
    or p_verified_size_bytes <> v_artifact.declared_size_bytes then
    raise exception using errcode = '22023', message = 'Verified print PDF metadata does not match the upload';
  end if;

  update public.final_print_artifacts as artifact
  set status = 'superseded',
      updated_at = v_now
  where artifact.final_job_id = p_final_job_id
    and artifact.status = 'verified'
    and artifact.artifact_id <> p_artifact_id;

  update public.final_print_artifacts as artifact
  set status = 'verified',
      verified_size_bytes = p_verified_size_bytes,
      content_type = p_content_type,
      verified_at = v_now,
      failure_reason = null,
      updated_at = v_now
  where artifact.artifact_id = p_artifact_id;

  update public.final_jobs
  set print_package_artifact_id = p_artifact_id,
      print_package_path = v_artifact.storage_path,
      print_status = 'ready',
      print_completed_pages = 0,
      updated_at = v_now
  where final_job_id = p_final_job_id;

  return query select p_artifact_id, v_artifact.storage_path, 'verified'::text, v_now;
end;
$function$;

drop function if exists public.release_final_print_artifact(uuid, uuid);

create or replace function public.release_final_print_artifact(
  p_final_job_id uuid,
  p_expected_artifact_id uuid,
  p_admin_customer_id uuid
)
returns table (
  release_result text,
  artifact_id uuid,
  storage_path text,
  released_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_job public.final_jobs%rowtype;
  v_artifact public.final_print_artifacts%rowtype;
  v_now timestamptz := now();
begin
  if not exists (
    select 1 from public.customers
    where customer_id = p_admin_customer_id and role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Admin actor is required';
  end if;

  select * into v_job
  from public.final_jobs
  where final_job_id = p_final_job_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Final job not found';
  end if;
  if v_job.released_at is null then
    raise exception using errcode = '55000', message = 'Customer PDF must be released first';
  end if;

  if v_job.print_status = 'released' or v_job.print_released_at is not null then
    if v_job.print_package_artifact_id is distinct from p_expected_artifact_id then
      raise exception using errcode = '40001', message = 'The selected print PDF changed before release';
    end if;
    return query select
      'already_released'::text,
      v_job.print_package_artifact_id,
      v_job.print_package_path,
      v_job.print_released_at;
    return;
  end if;

  if v_job.print_package_artifact_id is null or v_job.print_package_path is null then
    raise exception using errcode = '55000', message = 'Upload and verify the manual print PDF before release';
  end if;
  if v_job.print_package_artifact_id is distinct from p_expected_artifact_id then
    raise exception using errcode = '40001', message = 'The selected print PDF changed before release';
  end if;

  select * into v_artifact
  from public.final_print_artifacts as artifact
  where artifact.artifact_id = v_job.print_package_artifact_id
    and artifact.final_job_id = p_final_job_id
  for update;

  if not found
    or v_artifact.status <> 'verified'
    or v_artifact.storage_path <> v_job.print_package_path
    or v_artifact.verified_at is null then
    raise exception using errcode = '55000', message = 'The selected manual print PDF is not verified';
  end if;

  update public.final_print_artifacts as artifact
  set status = 'released',
      released_by = p_admin_customer_id,
      released_at = v_now,
      updated_at = v_now
  where artifact.artifact_id = v_artifact.artifact_id;

  update public.final_jobs
  set print_status = 'released',
      print_completed_pages = 0,
      print_released_at = v_now,
      updated_at = v_now
  where final_job_id = p_final_job_id;

  return query select 'released'::text, v_artifact.artifact_id, v_artifact.storage_path, v_now;
end;
$function$;

revoke all on table public.final_print_artifacts from public, anon, authenticated, service_role;
grant select on table public.final_print_artifacts to service_role;

revoke all on function public.create_final_print_artifact(uuid, uuid, text, text, bigint, text, uuid) from public;
revoke execute on function public.create_final_print_artifact(uuid, uuid, text, text, bigint, text, uuid) from anon, authenticated;
grant execute on function public.create_final_print_artifact(uuid, uuid, text, text, bigint, text, uuid) to service_role;

revoke all on function public.reject_final_print_artifact(uuid, uuid, text, uuid) from public;
revoke execute on function public.reject_final_print_artifact(uuid, uuid, text, uuid) from anon, authenticated;
grant execute on function public.reject_final_print_artifact(uuid, uuid, text, uuid) to service_role;

revoke all on function public.commit_final_print_artifact(uuid, uuid, bigint, text, uuid) from public;
revoke execute on function public.commit_final_print_artifact(uuid, uuid, bigint, text, uuid) from anon, authenticated;
grant execute on function public.commit_final_print_artifact(uuid, uuid, bigint, text, uuid) to service_role;

revoke all on function public.release_final_print_artifact(uuid, uuid, uuid) from public;
revoke execute on function public.release_final_print_artifact(uuid, uuid, uuid) from anon, authenticated;
grant execute on function public.release_final_print_artifact(uuid, uuid, uuid) to service_role;
