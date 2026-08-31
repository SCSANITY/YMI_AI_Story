-- T4-001 S1: fixed-slot Home banner publishing foundation.
-- Apply before deploying the corresponding application code.

create table if not exists public.homepage_banner_slots (
  slot_key text primary key,
  display_name text not null,
  desktop_asset_source text not null,
  desktop_asset_path text not null,
  desktop_width integer not null,
  desktop_height integer not null,
  mobile_asset_source text not null,
  mobile_asset_path text not null,
  mobile_width integer not null,
  mobile_height integer not null,
  alt_text text not null,
  href text not null default '/books',
  is_visible boolean not null default true,
  row_version bigint not null default 1,
  updated_by_customer_id uuid null references public.customers(customer_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint homepage_banner_slots_slot_key_check check (
    slot_key in ('after_hero', 'after_for_boys', 'after_in_discount')
  ),
  constraint homepage_banner_slots_display_name_check check (
    char_length(btrim(display_name)) between 1 and 120
  ),
  constraint homepage_banner_slots_asset_source_check check (
    desktop_asset_source in ('builtin', 'storage')
    and mobile_asset_source in ('builtin', 'storage')
  ),
  constraint homepage_banner_slots_desktop_path_check check (
    (
      desktop_asset_source = 'builtin'
      and desktop_asset_path ~* '^banners/optimized/[a-z0-9-]+\.(webp|png|jpe?g)$'
    )
    or (
      desktop_asset_source = 'storage'
      and desktop_asset_path ~* '^homepage-banners/[a-z0-9/_-]+\.(webp|png|jpe?g)$'
    )
  ),
  constraint homepage_banner_slots_mobile_path_check check (
    (
      mobile_asset_source = 'builtin'
      and mobile_asset_path ~* '^banners/optimized/[a-z0-9-]+\.(webp|png|jpe?g)$'
    )
    or (
      mobile_asset_source = 'storage'
      and mobile_asset_path ~* '^homepage-banners/[a-z0-9/_-]+\.(webp|png|jpe?g)$'
    )
  ),
  constraint homepage_banner_slots_desktop_geometry_check check (
    desktop_width > 0
    and desktop_height > 0
    and desktop_width::numeric / desktop_height >= 1.5
  ),
  constraint homepage_banner_slots_mobile_geometry_check check (
    mobile_width > 0
    and mobile_height > 0
    and mobile_width::numeric / mobile_height >= 1.5
  ),
  constraint homepage_banner_slots_alt_text_check check (
    char_length(btrim(alt_text)) between 1 and 240
  ),
  constraint homepage_banner_slots_href_check check (
    left(href, 1) = '/'
    and left(href, 2) <> '//'
    and href !~ E'[\r\n]'
  ),
  constraint homepage_banner_slots_row_version_check check (row_version > 0)
);

comment on table public.homepage_banner_slots is
  'Exactly three owner-managed, responsive Home banner slots. Desktop and mobile assets are independent.';

alter table public.homepage_banner_slots enable row level security;
revoke all on table public.homepage_banner_slots from public, anon, authenticated;
grant select, insert, update on table public.homepage_banner_slots to service_role;

insert into public.homepage_banner_slots (
  slot_key,
  display_name,
  desktop_asset_source,
  desktop_asset_path,
  desktop_width,
  desktop_height,
  mobile_asset_source,
  mobile_asset_path,
  mobile_width,
  mobile_height,
  alt_text,
  href,
  is_visible
)
values
  (
    'after_hero',
    'How YMI Story Works',
    'builtin',
    'banners/optimized/workflow-desktop.webp',
    2400,
    1200,
    'builtin',
    'banners/optimized/workflow-mobile.webp',
    1100,
    550,
    'How YMI Story works in five simple steps',
    '/books',
    true
  ),
  (
    'after_for_boys',
    'Personalised Storybooks That Make Their Dreams Come True',
    'builtin',
    'banners/optimized/swapface-desktop.webp',
    2400,
    1080,
    'builtin',
    'banners/optimized/swapface-mobile.webp',
    1100,
    495,
    'A child becomes the hero of personalised YMI Story books',
    '/books',
    true
  ),
  (
    'after_in_discount',
    'A Memory to Keep',
    'builtin',
    'banners/optimized/banner-01-desktop.webp',
    2400,
    1350,
    'builtin',
    'banners/optimized/banner-01-mobile.webp',
    1100,
    619,
    'A personalised audio storybook powered by a familiar voice',
    '/books',
    true
  )
on conflict (slot_key) do nothing;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'site-public',
  'site-public',
  true,
  5242880,
  array['image/webp', 'image/png', 'image/jpeg']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.publish_homepage_banner_slot(
  p_slot_key text,
  p_expected_version bigint,
  p_admin_customer_id uuid,
  p_display_name text,
  p_desktop_asset_source text,
  p_desktop_asset_path text,
  p_desktop_width integer,
  p_desktop_height integer,
  p_mobile_asset_source text,
  p_mobile_asset_path text,
  p_mobile_width integer,
  p_mobile_height integer,
  p_alt_text text,
  p_href text,
  p_is_visible boolean
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next_version bigint;
begin
  if not exists (
    select 1
    from public.customers customer
    where customer.customer_id = p_admin_customer_id
      and customer.role = 'admin'
  ) then
    raise exception 'Admin access required';
  end if;

  update public.homepage_banner_slots slot
  set
    display_name = btrim(p_display_name),
    desktop_asset_source = p_desktop_asset_source,
    desktop_asset_path = p_desktop_asset_path,
    desktop_width = p_desktop_width,
    desktop_height = p_desktop_height,
    mobile_asset_source = p_mobile_asset_source,
    mobile_asset_path = p_mobile_asset_path,
    mobile_width = p_mobile_width,
    mobile_height = p_mobile_height,
    alt_text = btrim(p_alt_text),
    href = btrim(p_href),
    is_visible = p_is_visible,
    row_version = slot.row_version + 1,
    updated_by_customer_id = p_admin_customer_id,
    updated_at = now()
  where slot.slot_key = p_slot_key
    and slot.row_version = p_expected_version
  returning slot.row_version into v_next_version;

  if v_next_version is null then
    raise exception 'Homepage banner changed in another session';
  end if;

  return v_next_version;
end;
$$;

revoke all on function public.publish_homepage_banner_slot(
  text, bigint, uuid, text, text, text, integer, integer,
  text, text, integer, integer, text, text, boolean
) from public, anon, authenticated;
grant execute on function public.publish_homepage_banner_slot(
  text, bigint, uuid, text, text, text, integer, integer,
  text, text, integer, integer, text, text, boolean
) to service_role;

create or replace function public.swap_homepage_banner_slots(
  p_first_slot_key text,
  p_first_expected_version bigint,
  p_second_slot_key text,
  p_second_expected_version bigint,
  p_admin_customer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_first public.homepage_banner_slots%rowtype;
  v_second public.homepage_banner_slots%rowtype;
begin
  if not exists (
    select 1
    from public.customers customer
    where customer.customer_id = p_admin_customer_id
      and customer.role = 'admin'
  ) then
    raise exception 'Admin access required';
  end if;

  if p_first_slot_key = p_second_slot_key then
    raise exception 'Choose two different Homepage banner slots';
  end if;

  perform 1
  from public.homepage_banner_slots slot
  where slot.slot_key in (p_first_slot_key, p_second_slot_key)
  order by slot.slot_key
  for update;

  select * into v_first
  from public.homepage_banner_slots slot
  where slot.slot_key = p_first_slot_key;
  if not found then
    raise exception 'First Homepage banner slot not found';
  end if;

  select * into v_second
  from public.homepage_banner_slots slot
  where slot.slot_key = p_second_slot_key;
  if not found then
    raise exception 'Second Homepage banner slot not found';
  end if;

  if v_first.row_version <> p_first_expected_version
    or v_second.row_version <> p_second_expected_version then
    raise exception 'Homepage banner changed in another session';
  end if;

  update public.homepage_banner_slots slot
  set
    display_name = v_second.display_name,
    desktop_asset_source = v_second.desktop_asset_source,
    desktop_asset_path = v_second.desktop_asset_path,
    desktop_width = v_second.desktop_width,
    desktop_height = v_second.desktop_height,
    mobile_asset_source = v_second.mobile_asset_source,
    mobile_asset_path = v_second.mobile_asset_path,
    mobile_width = v_second.mobile_width,
    mobile_height = v_second.mobile_height,
    alt_text = v_second.alt_text,
    href = v_second.href,
    is_visible = v_second.is_visible,
    row_version = v_first.row_version + 1,
    updated_by_customer_id = p_admin_customer_id,
    updated_at = now()
  where slot.slot_key = p_first_slot_key;

  update public.homepage_banner_slots slot
  set
    display_name = v_first.display_name,
    desktop_asset_source = v_first.desktop_asset_source,
    desktop_asset_path = v_first.desktop_asset_path,
    desktop_width = v_first.desktop_width,
    desktop_height = v_first.desktop_height,
    mobile_asset_source = v_first.mobile_asset_source,
    mobile_asset_path = v_first.mobile_asset_path,
    mobile_width = v_first.mobile_width,
    mobile_height = v_first.mobile_height,
    alt_text = v_first.alt_text,
    href = v_first.href,
    is_visible = v_first.is_visible,
    row_version = v_second.row_version + 1,
    updated_by_customer_id = p_admin_customer_id,
    updated_at = now()
  where slot.slot_key = p_second_slot_key;

  return jsonb_build_object(
    p_first_slot_key, v_first.row_version + 1,
    p_second_slot_key, v_second.row_version + 1
  );
end;
$$;

revoke all on function public.swap_homepage_banner_slots(
  text, bigint, text, bigint, uuid
) from public, anon, authenticated;
grant execute on function public.swap_homepage_banner_slots(
  text, bigint, text, bigint, uuid
) to service_role;
