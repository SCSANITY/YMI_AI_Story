-- T3-030: authoritative per-template, per-package USD pricing.
-- Apply before deploying the corresponding application code.

create table if not exists public.template_package_prices (
  template_id text not null references public.templates(template_id) on delete cascade,
  package_type text not null check (package_type in ('digital', 'basic', 'supreme')),
  list_price_usd numeric(10, 2) not null check (list_price_usd > 0),
  sale_price_usd numeric(10, 2) null check (
    sale_price_usd is null or (sale_price_usd > 0 and sale_price_usd < list_price_usd)
  ),
  row_version bigint not null default 1 check (row_version > 0),
  updated_by_customer_id uuid null references public.customers(customer_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (template_id, package_type)
);

comment on table public.template_package_prices is
  'Authoritative USD list and optional sale price for each sellable story package.';
comment on column public.template_package_prices.sale_price_usd is
  'Optional current catalog markdown. Order-level promo and voucher discounts are applied after this price.';
comment on column public.template_package_prices.row_version is
  'Optimistic concurrency version used by Admin Catalog updates.';

alter table public.template_package_prices enable row level security;
revoke all on table public.template_package_prices from public, anon, authenticated;
grant select, insert, update, delete on table public.template_package_prices to service_role;

-- Future templates receive a complete pricing contract in the same transaction.
-- Templates start inactive in T3-031, so placeholder prices are safe until Admin
-- supplies the real catalog values. This function intentionally has no dependency
-- on legacy templates.price_cents columns and remains safe after their cleanup.
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
  )
  values
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

-- Preserve legacy values on the first migration. After T3-031 removes those
-- columns, a rerun only fills genuinely missing rows with safe placeholders.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'templates' and column_name = 'price_cents'
  ) then
    execute $backfill$
      insert into public.template_package_prices (
        template_id, package_type, list_price_usd, sale_price_usd
      )
      select
        t.template_id,
        package.package_type,
        case
          when coalesce(t.compare_at_price_cents, 0) > t.price_cents
            then t.compare_at_price_cents + package.uplift
          else t.price_cents + package.uplift
        end::numeric(10, 2),
        case
          when coalesce(t.compare_at_price_cents, 0) > t.price_cents
            then (t.price_cents + package.uplift)::numeric(10, 2)
          else null
        end
      from public.templates t
      cross join (
        values
          ('digital'::text, 0::numeric),
          ('basic'::text, 0::numeric),
          ('supreme'::text, 50::numeric)
      ) as package(package_type, uplift)
      where t.price_cents > 0
      on conflict (template_id, package_type) do nothing
    $backfill$;
  else
    insert into public.template_package_prices (
      template_id, package_type, list_price_usd, sale_price_usd
    )
    select
      template.template_id,
      package.package_type,
      package.list_price_usd,
      null
    from public.templates template
    cross join (
      values
        ('digital'::text, 24.99::numeric),
        ('basic'::text, 24.99::numeric),
        ('supreme'::text, 74.99::numeric)
    ) as package(package_type, list_price_usd)
    on conflict (template_id, package_type) do nothing;
  end if;
end $$;

alter table public.cart_items
  add column if not exists package_type text null,
  add column if not exists package_price_version bigint null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cart_items_package_type_check'
      and conrelid = 'public.cart_items'::regclass
  ) then
    alter table public.cart_items
      add constraint cart_items_package_type_check
      check (package_type is null or package_type in ('digital', 'basic', 'supreme'));
  end if;
end $$;

comment on column public.cart_items.package_type is
  'Server-derived sellable package snapshot. Null is allowed only for legacy rows.';
comment on column public.cart_items.package_price_version is
  'template_package_prices.row_version used when the server wrote price_at_purchase.';

create index if not exists template_package_prices_updated_idx
  on public.template_package_prices(updated_at desc);
