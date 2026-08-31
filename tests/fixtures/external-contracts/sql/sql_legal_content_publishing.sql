-- T3-003 S4: revisioned legal-content publishing foundation.
-- Apply this before opening /admin/legal.
-- Public legal surfaces remain code-backed until S5.

create table if not exists public.legal_documents (
  document_id uuid primary key default gen_random_uuid(),
  document_key text not null unique,
  default_locale text not null default 'en',
  current_published_revision_id uuid,
  created_by_customer_id uuid references public.customers(customer_id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint legal_documents_key_check
    check (document_key in ('privacy', 'terms', 'shipping', 'refund')),
  constraint legal_documents_default_locale_check
    check (default_locale = 'en')
);

create table if not exists public.legal_document_revisions (
  revision_id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.legal_documents(document_id) on delete restrict,
  revision_number integer not null,
  status text not null,
  content_by_locale jsonb not null,
  draft_version integer not null default 0,
  base_published_revision_id uuid references public.legal_document_revisions(revision_id) on delete restrict,
  source_revision_id uuid references public.legal_document_revisions(revision_id) on delete restrict,
  created_by_customer_id uuid references public.customers(customer_id) on delete restrict,
  created_at timestamp with time zone not null default now(),
  updated_by_customer_id uuid references public.customers(customer_id) on delete restrict,
  updated_at timestamp with time zone not null default now(),
  published_by_customer_id uuid references public.customers(customer_id) on delete restrict,
  published_at timestamp with time zone,
  constraint legal_document_revisions_document_number_key
    unique (document_id, revision_number),
  constraint legal_document_revisions_document_revision_key
    unique (document_id, revision_id),
  constraint legal_document_revisions_status_check
    check (status in ('draft', 'published', 'archived')),
  constraint legal_document_revisions_draft_version_check
    check (draft_version >= 0),
  constraint legal_document_revisions_content_check
    check (
      jsonb_typeof(content_by_locale) = 'object'
      and content_by_locale ? 'en'
      and jsonb_typeof(content_by_locale -> 'en') = 'object'
    ),
  constraint legal_document_revisions_publish_metadata_check
    check (
      (status = 'published' and published_at is not null and published_by_customer_id is not null)
      or status <> 'published'
    )
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'legal_documents_current_revision_fk'
      and conrelid = 'public.legal_documents'::regclass
  ) then
    alter table public.legal_documents
      add constraint legal_documents_current_revision_fk
      foreign key (document_id, current_published_revision_id)
      references public.legal_document_revisions(document_id, revision_id)
      on delete restrict
      deferrable initially deferred;
  end if;
end;
$$;

create unique index if not exists idx_legal_document_one_active_draft
  on public.legal_document_revisions (document_id)
  where status = 'draft';

create index if not exists idx_legal_document_revision_history
  on public.legal_document_revisions (document_id, revision_number desc);

create table if not exists public.legal_document_audit_events (
  audit_event_id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.legal_documents(document_id) on delete restrict,
  event_type text not null,
  actor_customer_id uuid references public.customers(customer_id) on delete restrict,
  draft_revision_id uuid references public.legal_document_revisions(revision_id) on delete restrict,
  base_published_revision_id uuid references public.legal_document_revisions(revision_id) on delete restrict,
  source_revision_id uuid references public.legal_document_revisions(revision_id) on delete restrict,
  resulting_revision_id uuid references public.legal_document_revisions(revision_id) on delete restrict,
  occurred_at timestamp with time zone not null default now(),
  constraint legal_document_audit_event_type_check
    check (event_type in ('bootstrap_published', 'draft_saved', 'published', 'rolled_back'))
);

create index if not exists idx_legal_document_audit_history
  on public.legal_document_audit_events (document_id, occurred_at desc);

create or replace function public.protect_published_legal_revision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'published' then
    raise exception using
      errcode = '55000',
      message = 'Published legal revisions are immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_published_legal_revision
  on public.legal_document_revisions;
create trigger trg_protect_published_legal_revision
before update or delete on public.legal_document_revisions
for each row execute function public.protect_published_legal_revision();

create or replace function public.protect_legal_audit_event()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'Legal publishing audit history is immutable';
end;
$$;

drop trigger if exists trg_protect_legal_audit_event
  on public.legal_document_audit_events;
create trigger trg_protect_legal_audit_event
before update or delete on public.legal_document_audit_events
for each row execute function public.protect_legal_audit_event();

create or replace function public.bootstrap_legal_document(
  p_document_key text,
  p_content_by_locale jsonb,
  p_actor_customer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.legal_documents%rowtype;
  v_revision_id uuid;
  v_revision_number integer;
begin
  if p_actor_customer_id is null then
    raise exception using errcode = '22023', message = 'Admin actor is required';
  end if;
  if p_document_key is null
     or p_document_key not in ('privacy', 'terms', 'shipping', 'refund') then
    raise exception using errcode = '22023', message = 'Unsupported legal document';
  end if;
  if p_content_by_locale is null
     or jsonb_typeof(p_content_by_locale) <> 'object'
     or not (p_content_by_locale ? 'en')
     or jsonb_typeof(p_content_by_locale -> 'en') <> 'object' then
    raise exception using errcode = '22023', message = 'Invalid legal content';
  end if;

  insert into public.legal_documents (
    document_key,
    created_by_customer_id
  )
  values (
    p_document_key,
    p_actor_customer_id
  )
  on conflict (document_key) do nothing;

  select *
  into v_document
  from public.legal_documents
  where document_key = p_document_key
  for update;

  if v_document.current_published_revision_id is not null then
    return v_document.current_published_revision_id;
  end if;

  select coalesce(max(revision_number), 0) + 1
  into v_revision_number
  from public.legal_document_revisions
  where document_id = v_document.document_id;

  insert into public.legal_document_revisions (
    document_id,
    revision_number,
    status,
    content_by_locale,
    draft_version,
    created_by_customer_id,
    updated_by_customer_id,
    published_by_customer_id,
    published_at
  )
  values (
    v_document.document_id,
    v_revision_number,
    'published',
    p_content_by_locale,
    0,
    p_actor_customer_id,
    p_actor_customer_id,
    p_actor_customer_id,
    now()
  )
  returning revision_id into v_revision_id;

  update public.legal_documents
  set current_published_revision_id = v_revision_id,
      updated_at = now()
  where document_id = v_document.document_id;

  insert into public.legal_document_audit_events (
    document_id,
    event_type,
    actor_customer_id,
    resulting_revision_id
  )
  values (
    v_document.document_id,
    'bootstrap_published',
    p_actor_customer_id,
    v_revision_id
  );

  return v_revision_id;
end;
$$;

create or replace function public.save_legal_document_draft(
  p_document_key text,
  p_content_by_locale jsonb,
  p_expected_draft_revision_id uuid,
  p_expected_draft_version integer,
  p_base_published_revision_id uuid,
  p_actor_customer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.legal_documents%rowtype;
  v_draft public.legal_document_revisions%rowtype;
  v_revision_id uuid;
  v_revision_number integer;
begin
  if p_actor_customer_id is null then
    raise exception using errcode = '22023', message = 'Admin actor is required';
  end if;
  if p_content_by_locale is null
     or jsonb_typeof(p_content_by_locale) <> 'object'
     or not (p_content_by_locale ? 'en')
     or jsonb_typeof(p_content_by_locale -> 'en') <> 'object' then
    raise exception using errcode = '22023', message = 'Invalid legal content';
  end if;

  select *
  into v_document
  from public.legal_documents
  where document_key = p_document_key
  for update;

  if not found or v_document.current_published_revision_id is null then
    raise exception using errcode = 'P0002', message = 'Legal document is not initialized';
  end if;
  if v_document.current_published_revision_id is distinct from p_base_published_revision_id then
    raise exception using
      errcode = '40001',
      message = 'The live legal revision changed. Reload before saving.';
  end if;

  select *
  into v_draft
  from public.legal_document_revisions
  where document_id = v_document.document_id
    and status = 'draft'
  for update;

  if found then
    if p_expected_draft_revision_id is distinct from v_draft.revision_id
       or p_expected_draft_version is distinct from v_draft.draft_version then
      raise exception using
        errcode = '40001',
        message = 'The legal draft changed. Reload before saving.';
    end if;
    if v_draft.base_published_revision_id is distinct from p_base_published_revision_id then
      raise exception using
        errcode = '40001',
        message = 'The draft is based on an older live revision.';
    end if;

    update public.legal_document_revisions
    set content_by_locale = p_content_by_locale,
        draft_version = draft_version + 1,
        updated_by_customer_id = p_actor_customer_id,
        updated_at = now()
    where revision_id = v_draft.revision_id
    returning revision_id into v_revision_id;
  else
    if p_expected_draft_revision_id is not null
       or p_expected_draft_version is not null then
      raise exception using
        errcode = '40001',
        message = 'The expected legal draft no longer exists.';
    end if;

    select coalesce(max(revision_number), 0) + 1
    into v_revision_number
    from public.legal_document_revisions
    where document_id = v_document.document_id;

    insert into public.legal_document_revisions (
      document_id,
      revision_number,
      status,
      content_by_locale,
      draft_version,
      base_published_revision_id,
      created_by_customer_id,
      updated_by_customer_id
    )
    values (
      v_document.document_id,
      v_revision_number,
      'draft',
      p_content_by_locale,
      1,
      p_base_published_revision_id,
      p_actor_customer_id,
      p_actor_customer_id
    )
    returning revision_id into v_revision_id;
  end if;

  update public.legal_documents
  set updated_at = now()
  where document_id = v_document.document_id;

  insert into public.legal_document_audit_events (
    document_id,
    event_type,
    actor_customer_id,
    draft_revision_id,
    base_published_revision_id
  )
  values (
    v_document.document_id,
    'draft_saved',
    p_actor_customer_id,
    v_revision_id,
    p_base_published_revision_id
  );

  return v_revision_id;
end;
$$;

create or replace function public.publish_legal_document_draft(
  p_document_key text,
  p_draft_revision_id uuid,
  p_expected_draft_version integer,
  p_base_published_revision_id uuid,
  p_actor_customer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.legal_documents%rowtype;
  v_draft public.legal_document_revisions%rowtype;
  v_revision_id uuid;
  v_revision_number integer;
begin
  if p_actor_customer_id is null then
    raise exception using errcode = '22023', message = 'Admin actor is required';
  end if;

  select *
  into v_document
  from public.legal_documents
  where document_key = p_document_key
  for update;

  if not found or v_document.current_published_revision_id is null then
    raise exception using errcode = 'P0002', message = 'Legal document is not initialized';
  end if;
  if v_document.current_published_revision_id is distinct from p_base_published_revision_id then
    raise exception using
      errcode = '40001',
      message = 'The live legal revision changed. Reload before publishing.';
  end if;

  select *
  into v_draft
  from public.legal_document_revisions
  where revision_id = p_draft_revision_id
    and document_id = v_document.document_id
    and status = 'draft'
  for update;

  if not found then
    raise exception using errcode = '40001', message = 'The legal draft no longer exists';
  end if;
  if v_draft.draft_version is distinct from p_expected_draft_version
     or v_draft.base_published_revision_id is distinct from p_base_published_revision_id then
    raise exception using
      errcode = '40001',
      message = 'The legal draft changed. Reload before publishing.';
  end if;

  select coalesce(max(revision_number), 0) + 1
  into v_revision_number
  from public.legal_document_revisions
  where document_id = v_document.document_id;

  insert into public.legal_document_revisions (
    document_id,
    revision_number,
    status,
    content_by_locale,
    draft_version,
    base_published_revision_id,
    source_revision_id,
    created_by_customer_id,
    updated_by_customer_id,
    published_by_customer_id,
    published_at
  )
  values (
    v_document.document_id,
    v_revision_number,
    'published',
    v_draft.content_by_locale,
    0,
    p_base_published_revision_id,
    v_draft.revision_id,
    p_actor_customer_id,
    p_actor_customer_id,
    p_actor_customer_id,
    now()
  )
  returning revision_id into v_revision_id;

  update public.legal_document_revisions
  set status = 'archived',
      updated_by_customer_id = p_actor_customer_id,
      updated_at = now()
  where revision_id = v_draft.revision_id;

  update public.legal_documents
  set current_published_revision_id = v_revision_id,
      updated_at = now()
  where document_id = v_document.document_id;

  insert into public.legal_document_audit_events (
    document_id,
    event_type,
    actor_customer_id,
    draft_revision_id,
    base_published_revision_id,
    source_revision_id,
    resulting_revision_id
  )
  values (
    v_document.document_id,
    'published',
    p_actor_customer_id,
    v_draft.revision_id,
    p_base_published_revision_id,
    v_draft.revision_id,
    v_revision_id
  );

  return v_revision_id;
end;
$$;

create or replace function public.rollback_legal_document_revision(
  p_document_key text,
  p_source_revision_id uuid,
  p_expected_current_published_revision_id uuid,
  p_actor_customer_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document public.legal_documents%rowtype;
  v_source public.legal_document_revisions%rowtype;
  v_revision_id uuid;
  v_revision_number integer;
begin
  if p_actor_customer_id is null then
    raise exception using errcode = '22023', message = 'Admin actor is required';
  end if;

  select *
  into v_document
  from public.legal_documents
  where document_key = p_document_key
  for update;

  if not found or v_document.current_published_revision_id is null then
    raise exception using errcode = 'P0002', message = 'Legal document is not initialized';
  end if;
  if v_document.current_published_revision_id is distinct from p_expected_current_published_revision_id then
    raise exception using
      errcode = '40001',
      message = 'The live legal revision changed. Reload before rolling back.';
  end if;
  if p_source_revision_id = v_document.current_published_revision_id then
    raise exception using errcode = '22023', message = 'The selected revision is already live';
  end if;

  select *
  into v_source
  from public.legal_document_revisions
  where revision_id = p_source_revision_id
    and document_id = v_document.document_id
    and status = 'published';

  if not found then
    raise exception using errcode = 'P0002', message = 'Rollback source revision was not found';
  end if;

  update public.legal_document_revisions
  set status = 'archived',
      updated_by_customer_id = p_actor_customer_id,
      updated_at = now()
  where document_id = v_document.document_id
    and status = 'draft';

  select coalesce(max(revision_number), 0) + 1
  into v_revision_number
  from public.legal_document_revisions
  where document_id = v_document.document_id;

  insert into public.legal_document_revisions (
    document_id,
    revision_number,
    status,
    content_by_locale,
    draft_version,
    base_published_revision_id,
    source_revision_id,
    created_by_customer_id,
    updated_by_customer_id,
    published_by_customer_id,
    published_at
  )
  values (
    v_document.document_id,
    v_revision_number,
    'published',
    v_source.content_by_locale,
    0,
    p_expected_current_published_revision_id,
    v_source.revision_id,
    p_actor_customer_id,
    p_actor_customer_id,
    p_actor_customer_id,
    now()
  )
  returning revision_id into v_revision_id;

  update public.legal_documents
  set current_published_revision_id = v_revision_id,
      updated_at = now()
  where document_id = v_document.document_id;

  insert into public.legal_document_audit_events (
    document_id,
    event_type,
    actor_customer_id,
    base_published_revision_id,
    source_revision_id,
    resulting_revision_id
  )
  values (
    v_document.document_id,
    'rolled_back',
    p_actor_customer_id,
    p_expected_current_published_revision_id,
    v_source.revision_id,
    v_revision_id
  );

  return v_revision_id;
end;
$$;

alter table public.legal_documents enable row level security;
alter table public.legal_document_revisions enable row level security;
alter table public.legal_document_audit_events enable row level security;

insert into public.legal_documents (document_key)
values ('privacy'), ('terms'), ('shipping'), ('refund')
on conflict (document_key) do nothing;

revoke all on table public.legal_documents from public, anon, authenticated;
revoke all on table public.legal_document_revisions from public, anon, authenticated;
revoke all on table public.legal_document_audit_events from public, anon, authenticated;

revoke all on table public.legal_documents from service_role;
revoke all on table public.legal_document_revisions from service_role;
revoke all on table public.legal_document_audit_events from service_role;

grant select on table public.legal_documents to service_role;
grant select on table public.legal_document_revisions to service_role;
grant select on table public.legal_document_audit_events to service_role;

revoke all on function public.bootstrap_legal_document(text, jsonb, uuid)
  from public, anon, authenticated;
revoke all on function public.save_legal_document_draft(text, jsonb, uuid, integer, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.publish_legal_document_draft(text, uuid, integer, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.rollback_legal_document_revision(text, uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.bootstrap_legal_document(text, jsonb, uuid)
  to service_role;
grant execute on function public.save_legal_document_draft(text, jsonb, uuid, integer, uuid, uuid)
  to service_role;
grant execute on function public.publish_legal_document_draft(text, uuid, integer, uuid, uuid)
  to service_role;
grant execute on function public.rollback_legal_document_revision(text, uuid, uuid, uuid)
  to service_role;
