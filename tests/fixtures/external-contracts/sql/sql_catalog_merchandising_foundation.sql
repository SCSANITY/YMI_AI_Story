-- T3-031: catalog merchandising foundation.
-- Apply BEFORE deploying the corresponding application code.

alter table public.template_package_prices
  add column if not exists display_discount_percent smallint null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'template_package_prices_display_discount_check'
      and conrelid = 'public.template_package_prices'::regclass
  ) then
    alter table public.template_package_prices
      add constraint template_package_prices_display_discount_check
      check (
        display_discount_percent is null
        or (
          sale_price_usd is not null
          and display_discount_percent between 1 and 99
        )
      );
  end if;
end $$;

comment on column public.template_package_prices.display_discount_percent is
  'Optional marketing badge percentage. It never changes the charged sale_price_usd.';

alter table public.templates
  add column if not exists catalog_display_package_type text not null default 'digital';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'templates_catalog_display_package_check'
      and conrelid = 'public.templates'::regclass
  ) then
    alter table public.templates
      add constraint templates_catalog_display_package_check
      check (catalog_display_package_type in ('digital', 'basic', 'supreme'));
  end if;
end $$;

comment on column public.templates.catalog_display_package_type is
  'Package whose list/sale price and marketing discount are shown on public catalog cards.';

create table if not exists public.template_home_section_state (
  section_key text primary key check (
    section_key in ('brand_new', 'for_boys', 'for_girls', 'in_discount')
  ),
  row_version bigint not null default 1 check (row_version > 0),
  updated_by_customer_id uuid null references public.customers(customer_id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.template_home_placements (
  section_key text not null references public.template_home_section_state(section_key) on delete cascade,
  position smallint not null check (position between 1 and 4),
  template_id text not null references public.templates(template_id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (section_key, position),
  unique (section_key, template_id)
);

comment on table public.template_home_placements is
  'Four owner-curated story slots for each public Home catalog section.';

insert into public.template_home_section_state (section_key)
values ('brand_new'), ('for_boys'), ('for_girls'), ('in_discount')
on conflict (section_key) do nothing;

alter table public.template_home_section_state enable row level security;
alter table public.template_home_placements enable row level security;
revoke all on table public.template_home_section_state from public, anon, authenticated;
revoke all on table public.template_home_placements from public, anon, authenticated;
grant select, insert, update, delete on table public.template_home_section_state to service_role;
grant select, insert, update, delete on table public.template_home_placements to service_role;

-- Preserve the four cards currently produced by explicit flags, fixed fallbacks,
-- and catalog order. This block is skipped after legacy placement columns are removed.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'templates' and column_name = 'home_sections'
  ) then
    execute $seed$
      with section_defs(section_key, fallback_ids) as (
        values
          ('brand_new'::text, array['Planet_story','Seed_story','Music_story','Adventure_story']::text[]),
          ('for_boys'::text, array['Planet_story','Noah_story','Space_story','Scientist_story']::text[]),
          ('for_girls'::text, array['Adventure_story','Sister_story','Birthday_story','Seed_story']::text[]),
          ('in_discount'::text, array['Music_story','Explorer_story','Planet_story','Seed_story']::text[])
      ),
      candidates as (
        select
          sections.section_key,
          templates.template_id,
          case
            when (sections.section_key = 'brand_new' and templates.is_brand_new)
              or (sections.section_key = 'for_boys' and templates.is_for_boys)
              or (sections.section_key = 'for_girls' and templates.is_for_girls)
              or (sections.section_key = 'in_discount' and templates.is_discount)
              or templates.home_sections @> array[sections.section_key]::text[]
              then 0
            when templates.template_id = any(sections.fallback_ids) then 1
            else 2
          end as source_priority,
          array_position(sections.fallback_ids, templates.template_id) as fallback_position,
          templates.display_order,
          templates.created_at
        from section_defs sections
        cross join public.templates templates
        where templates.is_active = true
          and (
            sections.section_key <> 'in_discount'
            or exists (
              select 1
              from public.template_package_prices price
              where price.template_id = templates.template_id
                and price.package_type = templates.catalog_display_package_type
                and price.sale_price_usd is not null
            )
          )
      ),
      ranked as (
        select
          section_key,
          template_id,
          row_number() over (
            partition by section_key
            order by
              source_priority,
              fallback_position nulls last,
              display_order nulls last,
              created_at desc,
              template_id
          ) as position
        from candidates
      )
      insert into public.template_home_placements (section_key, position, template_id)
      select ranked.section_key, ranked.position, ranked.template_id
      from ranked
      where ranked.position <= 4
        and not exists (
          select 1 from public.template_home_placements existing
          where existing.section_key = ranked.section_key
        )
      on conflict do nothing
    $seed$;
  end if;
end $$;

create or replace function public.replace_template_home_section(
  p_section_key text,
  p_template_ids text[],
  p_expected_version bigint,
  p_admin_customer_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next_version bigint;
begin
  if p_section_key not in ('brand_new', 'for_boys', 'for_girls', 'in_discount') then
    raise exception 'Unsupported Home section';
  end if;

  if coalesce(cardinality(p_template_ids), 0) > 4 then
    raise exception 'A Home section supports at most four stories';
  end if;

  if exists (
    select 1 from unnest(coalesce(p_template_ids, array[]::text[])) as requested(template_id)
    where requested.template_id is null or btrim(requested.template_id) = ''
  ) then
    raise exception 'Home section contains an invalid template ID';
  end if;

  if (
    select count(*) from unnest(coalesce(p_template_ids, array[]::text[])) as requested(template_id)
  ) <> (
    select count(distinct requested.template_id)
    from unnest(coalesce(p_template_ids, array[]::text[])) as requested(template_id)
  ) then
    raise exception 'A story cannot occupy two slots in one Home section';
  end if;

  if not exists (
    select 1 from public.customers
    where customer_id = p_admin_customer_id and role = 'admin'
  ) then
    raise exception 'Admin authorization required';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_template_ids, array[]::text[])) requested(template_id)
    left join public.templates template on template.template_id = requested.template_id
    where template.template_id is null or template.is_active is distinct from true
  ) then
    raise exception 'Home section contains an unknown or inactive template';
  end if;

  if p_section_key = 'in_discount' and exists (
    select 1
    from unnest(coalesce(p_template_ids, array[]::text[])) requested(template_id)
    join public.templates template on template.template_id = requested.template_id
    left join public.template_package_prices price
      on price.template_id = template.template_id
      and price.package_type = template.catalog_display_package_type
    where price.sale_price_usd is null
  ) then
    raise exception 'In Discount stories require a sale on their public display package';
  end if;

  update public.template_home_section_state
  set
    row_version = row_version + 1,
    updated_by_customer_id = p_admin_customer_id,
    updated_at = now()
  where section_key = p_section_key
    and row_version = p_expected_version
  returning row_version into v_next_version;

  if v_next_version is null then
    raise exception 'Home section changed in another session';
  end if;

  delete from public.template_home_placements
  where section_key = p_section_key;

  insert into public.template_home_placements (section_key, position, template_id)
  select p_section_key, placement.ordinality::smallint, placement.template_id
  from unnest(coalesce(p_template_ids, array[]::text[])) with ordinality
    as placement(template_id, ordinality);

  return v_next_version;
end;
$$;

revoke all on function public.replace_template_home_section(text, text[], bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.replace_template_home_section(text, text[], bigint, uuid)
  to service_role;

-- New templates start inactive and receive safe placeholder prices. Admin must
-- set all three real prices before activation; no legacy template price is needed.
alter table public.templates alter column is_active set default false;

create or replace function public.seed_template_package_prices_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.template_package_prices (
    template_id,
    package_type,
    list_price_usd,
    sale_price_usd
  ) values
    (new.template_id, 'digital', 24.99, null),
    (new.template_id, 'basic', 24.99, null),
    (new.template_id, 'supreme', 74.99, null)
  on conflict (template_id, package_type) do nothing;

  return new;
end;
$$;

revoke all on function public.seed_template_package_prices_after_insert() from public, anon, authenticated;
grant execute on function public.seed_template_package_prices_after_insert() to service_role;

drop trigger if exists template_package_prices_seed_after_insert on public.templates;
create trigger template_package_prices_seed_after_insert
after insert on public.templates
for each row
execute function public.seed_template_package_prices_after_insert();

create or replace function public.guard_discount_home_placement_price()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.sale_price_usd is null and exists (
    select 1
    from public.template_home_placements placement
    join public.templates template on template.template_id = placement.template_id
    where placement.section_key = 'in_discount'
      and placement.template_id = new.template_id
      and template.catalog_display_package_type = new.package_type
  ) then
    raise exception 'The public display package must stay on sale while this story is in Home In Discount';
  end if;
  return new;
end;
$$;

drop trigger if exists template_package_prices_discount_placement_guard
  on public.template_package_prices;
create trigger template_package_prices_discount_placement_guard
before update of sale_price_usd on public.template_package_prices
for each row
execute function public.guard_discount_home_placement_price();

create or replace function public.guard_discount_home_placement_display_package()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.is_active is distinct from true
    and old.is_active is true
    and exists (
      select 1 from public.template_home_placements placement
      where placement.template_id = new.template_id
    )
  then
    raise exception 'Remove this story from Home placements before deactivating it';
  end if;

  if new.catalog_display_package_type is distinct from old.catalog_display_package_type
    and exists (
      select 1 from public.template_home_placements placement
      where placement.section_key = 'in_discount'
        and placement.template_id = new.template_id
    )
    and not exists (
      select 1 from public.template_package_prices price
      where price.template_id = new.template_id
        and price.package_type = new.catalog_display_package_type
        and price.sale_price_usd is not null
    )
  then
    raise exception 'The selected public package must be on sale while this story is in Home In Discount';
  end if;
  return new;
end;
$$;

drop trigger if exists templates_discount_placement_display_guard on public.templates;
drop trigger if exists templates_home_placement_guard on public.templates;
create trigger templates_home_placement_guard
before update of catalog_display_package_type, is_active on public.templates
for each row
execute function public.guard_discount_home_placement_display_package();

create index if not exists template_home_placements_template_idx
  on public.template_home_placements(template_id);
