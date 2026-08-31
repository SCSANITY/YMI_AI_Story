-- T3-034 S1: KOL partnership schema, legacy self-service retirement, and
-- transactional Admin-issued partnership Codes.
--
-- Run after sql_unified_discount_system.sql, sql_kol_collaboration_leads.sql,
-- sql_email_events.sql, and sql_root_email_inbound_foundation.sql.

begin;

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.kol_collaboration_leads') is null
    or to_regclass('public.discount_offers') is null
    or to_regclass('public.discount_instruments') is null
    or to_regclass('public.discount_redemptions') is null
    or to_regclass('public.inbound_email_envelopes') is null then
    raise exception 'T3-034 prerequisites are missing';
  end if;
end;
$$;

-- S4b routes opaque KOL reply identities through the existing durable inbound
-- envelope. Preserve every established route kind and add only the dedicated
-- partnership namespace.
alter table public.inbound_email_envelopes
  drop constraint if exists inbound_email_envelopes_route_kind_check;

alter table public.inbound_email_envelopes
  add constraint inbound_email_envelopes_route_kind_check
    check (route_kind in (
      'ticket_reply',
      'kol_reply',
      'support_direct',
      'operational_support',
      'general',
      'rejected_unknown',
      'rejected_ambiguous'
    ));

-- Lead linkage is installed before retirement so reruns can distinguish old
-- self-service instruments from Admin-issued partnership Codes.
alter table public.discount_instruments
  add column if not exists collaboration_lead_id uuid;

-- Freeze and clean the old self-service population inside one atomic statement.
-- Supabase SQL Editor may use a different transaction or session for each
-- statement, so this block intentionally owns no cross-statement temp objects.
do $$
declare
  v_legacy_instrument_ids uuid[] := '{}'::uuid[];
  v_preserved_instrument_ids uuid[] := '{}'::uuid[];
  v_preserved_offer_ids uuid[] := '{}'::uuid[];
  v_deletable_instrument_ids uuid[] := '{}'::uuid[];
  v_deletable_offer_ids uuid[] := '{}'::uuid[];
  v_deletable_order_ids uuid[] := '{}'::uuid[];
  v_expected_redemptions bigint;
  v_deleted_redemptions bigint;
  v_expected_orders bigint;
  v_deleted_orders bigint;
  v_expected_instruments bigint;
  v_deleted_instruments bigint;
begin
  select coalesce(array_agg(instrument.instrument_id), '{}'::uuid[])
  into v_legacy_instrument_ids
  from public.discount_instruments instrument
  where instrument.source = 'collaboration'
    and instrument.collaboration_lead_id is null;

  -- Anything that reached a paid-like order is audit history, even if a stale
  -- redemption status failed to advance to paid.
  select
    coalesce(array_agg(distinct legacy.instrument_id), '{}'::uuid[]),
    coalesce(array_agg(distinct legacy.offer_id), '{}'::uuid[])
  into v_preserved_instrument_ids, v_preserved_offer_ids
  from public.discount_instruments legacy
  left join public.discount_redemptions redemption
    on redemption.instrument_id = legacy.instrument_id
  left join public.orders redemption_order
    on redemption_order.order_id = redemption.order_id
  left join public.orders product_order
    on product_order.applied_product_discount_instrument_id = legacy.instrument_id
  left join public.orders shipping_order
    on shipping_order.applied_shipping_discount_instrument_id = legacy.instrument_id
  where legacy.instrument_id = any(v_legacy_instrument_ids)
    and (
      redemption.status = 'paid'
      or redemption_order.payment_id is not null
      or redemption_order.order_status::text in ('paid', 'production', 'shipped', 'delivered', 'refunded')
      or product_order.payment_id is not null
      or product_order.order_status::text in ('paid', 'production', 'shipped', 'delivered', 'refunded')
      or shipping_order.payment_id is not null
      or shipping_order.order_status::text in ('paid', 'production', 'shipped', 'delivered', 'refunded')
    );

  select
    coalesce(array_agg(legacy.instrument_id), '{}'::uuid[]),
    coalesce(array_agg(legacy.offer_id), '{}'::uuid[])
  into v_deletable_instrument_ids, v_deletable_offer_ids
  from public.discount_instruments legacy
  where legacy.instrument_id = any(v_legacy_instrument_ids)
    and not (legacy.instrument_id = any(v_preserved_instrument_ids));

  select coalesce(array_agg(distinct affected.order_id), '{}'::uuid[])
  into v_deletable_order_ids
  from (
    select redemption.order_id
    from public.discount_redemptions redemption
    where redemption.instrument_id = any(v_deletable_instrument_ids)
    union
    select orders.order_id
    from public.orders orders
    where orders.applied_product_discount_instrument_id = any(v_deletable_instrument_ids)
    union
    select orders.order_id
    from public.orders orders
    where orders.applied_shipping_discount_instrument_id = any(v_deletable_instrument_ids)
  ) affected
  where affected.order_id is not null;

  -- Hard precondition gate. Deletable legacy instruments may only touch clean,
  -- unpaid test orders with no payment, production artifact, or unrelated Code.
  if exists (
    select 1
    from unnest(v_deletable_order_ids) target(order_id)
    left join public.orders orders on orders.order_id = target.order_id
    where orders.order_id is null or orders.order_status::text <> 'unpaid' or orders.payment_id is not null
  ) then
    raise exception 'T3-034 cleanup blocked: legacy Code references a non-unpaid order';
  end if;

  if exists (
    select 1
    from public.payments payment
    where payment.order_id = any(v_deletable_order_ids)
  ) then
    raise exception 'T3-034 cleanup blocked: legacy test order has a payment row';
  end if;

  if exists (
    select 1
    from public.final_jobs final_job
    where final_job.order_id = any(v_deletable_order_ids)
  ) then
    raise exception 'T3-034 cleanup blocked: legacy test order has final-job storage artifacts';
  end if;

  if exists (
    select 1
    from public.discount_redemptions redemption
    where redemption.order_id = any(v_deletable_order_ids)
      and not (redemption.instrument_id = any(v_deletable_instrument_ids))
  ) then
    raise exception 'T3-034 cleanup blocked: legacy test order has an unrelated discount';
  end if;

  if exists (
    select 1
    from public.orders orders
    where orders.order_id = any(v_deletable_order_ids)
      and (
        (
          orders.applied_product_discount_instrument_id is not null
          and not (orders.applied_product_discount_instrument_id = any(v_deletable_instrument_ids))
        ) or (
          orders.applied_shipping_discount_instrument_id is not null
          and not (orders.applied_shipping_discount_instrument_id = any(v_deletable_instrument_ids))
        )
      )
  ) then
    raise exception 'T3-034 cleanup blocked: legacy test order points at an unrelated instrument';
  end if;

  if exists (
    select 1
    from public.discount_instruments legacy
    join public.discount_instruments sibling on sibling.offer_id = legacy.offer_id
    where legacy.instrument_id = any(v_legacy_instrument_ids)
      and not (sibling.instrument_id = any(v_legacy_instrument_ids))
  ) then
    raise exception 'T3-034 cleanup blocked: a legacy offer is shared with a non-legacy instrument';
  end if;

  -- Paid history remains fully traceable but can never be redeemed again.
  update public.discount_instruments instrument
  set
    source = 'admin',
    status = 'disabled',
    is_active = false,
    updated_at = now()
  where instrument.instrument_id = any(v_preserved_instrument_ids);

  update public.discount_offers offer
  set
    description = 'Retired legacy self-service collaboration code',
    is_active = false,
    updated_at = now()
  where offer.offer_id = any(v_preserved_offer_ids);

  -- Unpaid test orders are removed as complete orders. Delete redemptions
  -- explicitly first so their audit loss is counted rather than hidden by cascade.
  select count(*) into v_expected_redemptions
  from public.discount_redemptions redemption
  where redemption.instrument_id = any(v_deletable_instrument_ids);

  delete from public.discount_redemptions redemption
  where redemption.instrument_id = any(v_deletable_instrument_ids);
  get diagnostics v_deleted_redemptions = row_count;

  if v_deleted_redemptions <> v_expected_redemptions then
    raise exception 'T3-034 cleanup blocked: redemption delete count changed concurrently';
  end if;

  update public.jobs job
  set cart_item_id = null, updated_at = now()
  where exists (
    select 1
    from public.cart_items item
    where item.order_id = any(v_deletable_order_ids)
      and item.cart_item_id = job.cart_item_id
  );

  delete from public.cart_items item
  where item.order_id = any(v_deletable_order_ids);

  v_expected_orders := cardinality(v_deletable_order_ids);
  delete from public.orders orders
  where orders.order_id = any(v_deletable_order_ids);
  get diagnostics v_deleted_orders = row_count;

  if v_deleted_orders <> v_expected_orders then
    raise exception 'T3-034 cleanup blocked: order delete count changed concurrently';
  end if;

  v_expected_instruments := cardinality(v_deletable_instrument_ids);
  delete from public.discount_instruments instrument
  where instrument.instrument_id = any(v_deletable_instrument_ids);
  get diagnostics v_deleted_instruments = row_count;

  if v_deleted_instruments <> v_expected_instruments then
    raise exception 'T3-034 cleanup blocked: instrument delete count changed concurrently';
  end if;

  delete from public.discount_offers offer
  where offer.offer_id = any(v_deletable_offer_ids)
    and not exists (
      select 1 from public.discount_instruments instrument
      where instrument.offer_id = offer.offer_id
    );
end;
$$;

-- Evolve the legacy lead table without making archived anonymous history look
-- account-owned. All new/open records must have a real customer.
alter table public.kol_collaboration_leads
  add column if not exists account_email_snapshot text,
  add column if not exists contact_email text,
  add column if not exists country_region text,
  add column if not exists primary_market text,
  add column if not exists audience_size integer,
  add column if not exists content_focus text,
  add column if not exists website_url text,
  add column if not exists assigned_admin_customer_id uuid references public.customers(customer_id) on delete set null,
  add column if not exists lead_code text,
  add column if not exists reply_token text,
  add column if not exists internal_notes text,
  add column if not exists last_message_at timestamptz,
  add column if not exists last_message_preview text,
  add column if not exists last_message_direction text,
  add column if not exists unread_admin_count integer not null default 0,
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewing_at timestamptz,
  add column if not exists contacting_at timestamptz,
  add column if not exists partnered_at timestamptz,
  add column if not exists declined_at timestamptz,
  add column if not exists archived_at timestamptz;

alter table public.kol_collaboration_leads
  drop constraint if exists kol_collaboration_leads_gender_check,
  drop constraint if exists kol_collaboration_leads_review_status_check,
  alter column gender drop not null;

update public.kol_collaboration_leads lead
set
  contact_email = coalesce(lead.contact_email, nullif(lower(btrim(lead.email)), '')),
  account_email_snapshot = coalesce(
    lead.account_email_snapshot,
    nullif(lower(btrim(customer.email)), '')
  ),
  submitted_at = coalesce(lead.submitted_at, lead.created_at),
  updated_at = now()
from public.customers customer
where customer.customer_id = lead.customer_id;

update public.kol_collaboration_leads lead
set
  contact_email = coalesce(lead.contact_email, nullif(lower(btrim(lead.email)), '')),
  submitted_at = coalesce(lead.submitted_at, lead.created_at),
  review_status = case
    when lead.customer_id is null then 'archived'
    when lead.review_status = 'contacted' then 'contacting'
    when lead.review_status = 'closed' then 'archived'
    when lead.review_status in ('new', 'reviewing', 'contacting', 'partnered', 'declined', 'archived')
      then lead.review_status
    else 'archived'
  end,
  archived_at = case
    when lead.customer_id is null or lead.review_status in ('closed', 'archived')
      then coalesce(lead.archived_at, now())
    else lead.archived_at
  end,
  updated_at = now();

-- Keep only the newest open legacy application for each customer.
with ranked as (
  select
    lead_id,
    row_number() over (
      partition by customer_id
      order by created_at desc, lead_id desc
    ) as position
  from public.kol_collaboration_leads
  where customer_id is not null
    and review_status in ('new', 'reviewing', 'contacting', 'partnered')
)
update public.kol_collaboration_leads lead
set review_status = 'archived', archived_at = coalesce(archived_at, now()), updated_at = now()
from ranked
where ranked.lead_id = lead.lead_id and ranked.position > 1;

update public.kol_collaboration_leads
set lead_code = upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10))
where lead_code is null;

update public.kol_collaboration_leads
set reply_token = encode(gen_random_bytes(16), 'hex')
where reply_token is null;

alter table public.kol_collaboration_leads
  alter column lead_code set default upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 10)),
  alter column lead_code set not null,
  alter column reply_token set default encode(gen_random_bytes(16), 'hex'),
  alter column reply_token set not null;

alter table public.kol_collaboration_leads
  drop constraint if exists kol_collaboration_leads_open_owner_check,
  drop constraint if exists kol_collaboration_leads_audience_size_check,
  drop constraint if exists kol_collaboration_leads_unread_admin_count_check,
  drop constraint if exists kol_collaboration_leads_last_message_direction_check,
  add constraint kol_collaboration_leads_review_status_check
    check (review_status in ('new', 'reviewing', 'contacting', 'partnered', 'declined', 'archived')),
  add constraint kol_collaboration_leads_open_owner_check
    check (customer_id is not null or review_status in ('declined', 'archived')),
  add constraint kol_collaboration_leads_audience_size_check
    check (audience_size is null or audience_size >= 0),
  add constraint kol_collaboration_leads_unread_admin_count_check
    check (unread_admin_count >= 0),
  add constraint kol_collaboration_leads_last_message_direction_check
    check (last_message_direction is null or last_message_direction in ('applicant', 'admin'));

create unique index if not exists kol_collaboration_leads_lead_code_key
  on public.kol_collaboration_leads(lead_code);

create unique index if not exists kol_collaboration_leads_reply_token_key
  on public.kol_collaboration_leads(reply_token);

create unique index if not exists kol_collaboration_leads_one_open_per_customer_key
  on public.kol_collaboration_leads(customer_id)
  where review_status in ('new', 'reviewing', 'contacting', 'partnered');

create index if not exists kol_collaboration_leads_queue_idx
  on public.kol_collaboration_leads(review_status, unread_admin_count desc, submitted_at desc);

create table if not exists public.kol_collaboration_messages (
  message_id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.kol_collaboration_leads(lead_id) on delete cascade,
  direction text not null,
  source text not null,
  association_state text not null default 'confirmed',
  association_reviewed_by uuid references public.customers(customer_id) on delete set null,
  association_reviewed_at timestamptz,
  body_text text not null,
  sender_email text not null,
  sender_display_name text,
  admin_customer_id uuid references public.customers(customer_id) on delete set null,
  delivery_status text not null,
  delivery_error text,
  request_id uuid,
  email_event_id uuid references public.email_events(email_event_id) on delete set null,
  inbound_email_id uuid references public.inbound_email_envelopes(inbound_email_id) on delete set null,
  provider_email_id text,
  internet_message_id text,
  in_reply_to text,
  references_header text,
  attachment_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  failed_at timestamptz,
  constraint kol_collaboration_messages_direction_check
    check (direction in ('applicant', 'admin')),
  constraint kol_collaboration_messages_source_check
    check (source in ('web_application', 'admin_email', 'email_inbound')),
  constraint kol_collaboration_messages_association_state_check
    check (association_state in ('pending', 'confirmed', 'rejected')),
  constraint kol_collaboration_messages_delivery_status_check
    check (delivery_status in ('received', 'pending', 'sent', 'failed')),
  constraint kol_collaboration_messages_body_length_check
    check (char_length(body_text) between 1 and 20000),
  constraint kol_collaboration_messages_attachment_count_check
    check (attachment_count >= 0),
  constraint kol_collaboration_messages_quarantine_source_check
    check (association_state = 'confirmed' or source = 'email_inbound')
);

alter table public.kol_collaboration_messages
  add column if not exists association_reviewed_by uuid
    references public.customers(customer_id) on delete set null,
  add column if not exists association_reviewed_at timestamptz;

create index if not exists kol_collaboration_messages_lead_created_at_idx
  on public.kol_collaboration_messages(lead_id, created_at asc);

create index if not exists kol_collaboration_messages_quarantine_idx
  on public.kol_collaboration_messages(association_state, created_at desc)
  where association_state = 'pending';

create unique index if not exists kol_collaboration_messages_request_id_key
  on public.kol_collaboration_messages(request_id)
  where request_id is not null;

create unique index if not exists kol_collaboration_messages_provider_email_id_key
  on public.kol_collaboration_messages(provider_email_id)
  where provider_email_id is not null;

create unique index if not exists kol_collaboration_messages_internet_message_id_key
  on public.kol_collaboration_messages(internet_message_id)
  where internet_message_id is not null;

create or replace function public.sync_kol_lead_from_message()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_should_sync boolean := false;
begin
  if tg_op = 'INSERT' then
    v_should_sync := new.association_state = 'confirmed';
  elsif tg_op = 'UPDATE' then
    v_should_sync :=
      new.association_state = 'confirmed'
      and (
        old.association_state is distinct from new.association_state
        or old.delivery_status is distinct from new.delivery_status
      );
  end if;

  if not v_should_sync then
    return new;
  end if;

  if new.direction = 'applicant' and new.delivery_status = 'received' then
    update public.kol_collaboration_leads
    set
      last_message_at = new.created_at,
      last_message_preview = left(new.body_text, 240),
      last_message_direction = 'applicant',
      unread_admin_count = unread_admin_count + 1,
      updated_at = now()
    where lead_id = new.lead_id;
  elsif new.direction = 'admin' and new.delivery_status = 'sent' then
    update public.kol_collaboration_leads
    set
      last_message_at = coalesce(new.sent_at, new.created_at),
      last_message_preview = left(new.body_text, 240),
      last_message_direction = 'admin',
      updated_at = now()
    where lead_id = new.lead_id;
  end if;

  return new;
end;
$$;

drop trigger if exists kol_collaboration_messages_sync_lead
  on public.kol_collaboration_messages;
create trigger kol_collaboration_messages_sync_lead
after insert or update of delivery_status, association_state
on public.kol_collaboration_messages
for each row execute function public.sync_kol_lead_from_message();

alter table public.discount_instruments
  drop constraint if exists discount_instruments_collaboration_lead_id_fkey,
  drop constraint if exists discount_instruments_collaboration_owner_check;

alter table public.discount_instruments
  add constraint discount_instruments_collaboration_lead_id_fkey
    foreign key (collaboration_lead_id)
    references public.kol_collaboration_leads(lead_id) on delete restrict,
  add constraint discount_instruments_collaboration_owner_check
    check (
      (source = 'collaboration' and collaboration_lead_id is not null and owner_customer_id is not null)
      or (source <> 'collaboration' and collaboration_lead_id is null)
    );

drop index if exists public.discount_instruments_collaboration_lead_key;
create unique index discount_instruments_collaboration_lead_key
  on public.discount_instruments(collaboration_lead_id)
  where source = 'collaboration' and status = 'active';

-- Self-use includes the account identity, the instrument owner snapshot, and
-- the lead's separate partnership contact email.
create or replace function public.prevent_creator_promo_self_redemption()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source text;
  v_owner_customer_id uuid;
  v_owner_email text;
  v_account_email text;
  v_contact_email text;
  v_redeemer_email text := nullif(lower(btrim(coalesce(new.email, ''))), '');
begin
  select
    instrument.source,
    instrument.owner_customer_id,
    nullif(lower(btrim(coalesce(instrument.owner_email, ''))), ''),
    nullif(lower(btrim(coalesce(lead.account_email_snapshot, ''))), ''),
    nullif(lower(btrim(coalesce(lead.contact_email, ''))), '')
  into v_source, v_owner_customer_id, v_owner_email, v_account_email, v_contact_email
  from public.discount_instruments instrument
  left join public.kol_collaboration_leads lead
    on lead.lead_id = instrument.collaboration_lead_id
  where instrument.instrument_id = new.instrument_id;

  if v_source = 'collaboration'
     and (
       (new.customer_id is not null and v_owner_customer_id = new.customer_id)
       or (v_redeemer_email is not null and v_redeemer_email in (
         v_owner_email, v_account_email, v_contact_email
       ))
     ) then
    raise exception 'You cannot use your own partnership code.';
  end if;

  return new;
end;
$$;

-- Reclaim legacy anonymous leads after the customer identity has been resolved.
-- The unique open-lead policy is reconciled inside the same transaction.
create or replace function public.claim_kol_collaboration_leads_for_customer(
  p_customer_id uuid,
  p_account_email text
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := lower(btrim(coalesce(p_account_email, '')));
  v_has_open boolean;
  v_claimed integer := 0;
  v_archived_claimed integer := 0;
begin
  if v_email = '' or not exists (
    select 1
    from public.customers customer
    where customer.customer_id = p_customer_id
      and lower(customer.email) = v_email
  ) then
    raise exception 'KOL ownership identity does not match the customer' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text, 0));

  select exists (
    select 1
    from public.kol_collaboration_leads lead
    where lead.customer_id = p_customer_id
      and lead.review_status in ('new', 'reviewing', 'contacting', 'partnered')
  ) into v_has_open;

  if v_has_open then
    update public.kol_collaboration_leads lead
    set
      review_status = case
        when lead.review_status in ('new', 'reviewing', 'contacting', 'partnered') then 'archived'
        else lead.review_status
      end,
      archived_at = case
        when lead.review_status in ('new', 'reviewing', 'contacting', 'partnered')
          then coalesce(lead.archived_at, now())
        else lead.archived_at
      end,
      customer_id = p_customer_id,
      account_email_snapshot = v_email,
      updated_at = now()
    where lead.customer_id is null
      and lower(coalesce(lead.contact_email, lead.email, '')) = v_email;
    get diagnostics v_claimed = row_count;
  else
    with candidates as (
      select
        lead_id,
        row_number() over (
          order by created_at desc, lead_id desc
        ) as open_position
      from public.kol_collaboration_leads
      where customer_id is null
        and lower(coalesce(contact_email, email, '')) = v_email
        and review_status in ('new', 'reviewing', 'contacting', 'partnered')
    )
    update public.kol_collaboration_leads lead
    set
      review_status = case when candidates.open_position = 1 then lead.review_status else 'archived' end,
      archived_at = case
        when candidates.open_position > 1 then coalesce(lead.archived_at, now())
        else lead.archived_at
      end,
      customer_id = p_customer_id,
      account_email_snapshot = v_email,
      updated_at = now()
    from candidates
    where candidates.lead_id = lead.lead_id;
    get diagnostics v_claimed = row_count;

    update public.kol_collaboration_leads lead
    set customer_id = p_customer_id, account_email_snapshot = v_email, updated_at = now()
    where lead.customer_id is null
      and lower(coalesce(lead.contact_email, lead.email, '')) = v_email
      and lead.review_status in ('declined', 'archived');
    get diagnostics v_archived_claimed = row_count;
    v_claimed := v_claimed + v_archived_claimed;
  end if;

  return v_claimed;
end;
$$;

create or replace function public.create_kol_collaboration_code(
  p_admin_customer_id uuid,
  p_lead_id uuid,
  p_code text,
  p_effect_type text,
  p_value numeric,
  p_expires_at timestamptz default null,
  p_max_redemptions integer default null,
  p_max_redemptions_per_customer integer default null
)
returns table(created_offer_id uuid, created_instrument_id uuid, normalized_code text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead public.kol_collaboration_leads%rowtype;
  v_offer_id uuid;
  v_instrument_id uuid;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_effect_config jsonb;
  v_owner_email text;
begin
  if not exists (
    select 1 from public.customers
    where customer_id = p_admin_customer_id and role = 'admin'
  ) then
    raise exception 'Admin authorization required' using errcode = '42501';
  end if;

  select * into v_lead
  from public.kol_collaboration_leads
  where lead_id = p_lead_id
  for update;

  if not found then
    raise exception 'KOL lead not found' using errcode = 'P0002';
  end if;
  if v_lead.review_status <> 'partnered' or v_lead.customer_id is null then
    raise exception 'KOL lead must be partnered and account-owned' using errcode = '22023';
  end if;
  if exists (
    select 1
    from public.discount_instruments instrument
    where instrument.collaboration_lead_id = v_lead.lead_id
      and instrument.source = 'collaboration'
      and instrument.status = 'active'
  ) then
    raise exception 'KOL lead already has an active Code' using errcode = '23505';
  end if;
  if v_code !~ '^[A-Z0-9][A-Z0-9_-]{3,31}$' then
    raise exception 'KOL Code must contain 4-32 letters, numbers, underscores, or hyphens' using errcode = '22023';
  end if;
  if p_effect_type not in ('fixed_amount', 'percentage') then
    raise exception 'Unsupported KOL discount effect' using errcode = '22023';
  end if;
  if p_value is null or p_value <= 0 or (p_effect_type = 'percentage' and p_value > 100) then
    raise exception 'Invalid KOL discount value' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'KOL Code expiry must be in the future' using errcode = '22023';
  end if;
  if p_max_redemptions is not null and p_max_redemptions <= 0 then
    raise exception 'KOL Code usage limit must be positive' using errcode = '22023';
  end if;
  if p_max_redemptions_per_customer is not null and p_max_redemptions_per_customer <= 0 then
    raise exception 'KOL Code per-customer limit must be positive' using errcode = '22023';
  end if;

  select lower(email) into v_owner_email
  from public.customers
  where customer_id = v_lead.customer_id;

  if v_owner_email is null then
    raise exception 'KOL account email is missing' using errcode = '22023';
  end if;

  if p_effect_type = 'fixed_amount' then
    v_effect_config := jsonb_build_object('amount_usd', round(p_value, 2));
  else
    v_effect_config := jsonb_build_object('percent', round(p_value, 2));
  end if;

  insert into public.discount_offers (
    name,
    description,
    effect_type,
    effect_config,
    stacking_group,
    is_active,
    expires_at,
    first_order_only,
    created_by_admin_id
  ) values (
    'KOL partnership: ' || v_lead.nickname,
    'Admin-issued KOL partnership Code',
    p_effect_type,
    v_effect_config,
    'product_discount',
    true,
    p_expires_at,
    false,
    p_admin_customer_id
  ) returning offer_id into v_offer_id;

  begin
    insert into public.discount_instruments (
      offer_id,
      instrument_type,
      source,
      code,
      owner_customer_id,
      owner_email,
      collaboration_lead_id,
      is_public,
      is_active,
      max_redemptions,
      max_redemptions_per_customer,
      status,
      created_by_admin_id
    ) values (
      v_offer_id,
      'promo_code',
      'collaboration',
      v_code,
      v_lead.customer_id,
      v_owner_email,
      v_lead.lead_id,
      true,
      true,
      p_max_redemptions,
      p_max_redemptions_per_customer,
      'active',
      p_admin_customer_id
    ) returning instrument_id into v_instrument_id;
  exception when unique_violation then
    raise exception 'KOL Code is already reserved' using errcode = '23505';
  end;

  return query select v_offer_id, v_instrument_id, v_code;
end;
$$;

create or replace function public.update_kol_collaboration_code(
  p_admin_customer_id uuid,
  p_lead_id uuid,
  p_instrument_id uuid,
  p_expected_updated_at timestamptz,
  p_effect_type text,
  p_value numeric,
  p_expires_at timestamptz default null,
  p_max_redemptions integer default null,
  p_max_redemptions_per_customer integer default null,
  p_is_active boolean default true
)
returns table(updated_offer_id uuid, updated_instrument_id uuid, updated_status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead public.kol_collaboration_leads%rowtype;
  v_instrument public.discount_instruments%rowtype;
  v_offer public.discount_offers%rowtype;
  v_effect_config jsonb;
  v_committed_status text;
  v_committed_at timestamptz := now();
  v_max_customer_usage integer := 0;
begin
  if not exists (
    select 1 from public.customers
    where customer_id = p_admin_customer_id and role = 'admin'
  ) then
    raise exception 'Admin authorization required' using errcode = '42501';
  end if;

  select * into v_lead
  from public.kol_collaboration_leads
  where lead_id = p_lead_id
  for update;

  if not found then
    raise exception 'KOL lead not found' using errcode = 'P0002';
  end if;
  if v_lead.review_status <> 'partnered' or v_lead.customer_id is null then
    raise exception 'KOL lead must be partnered and account-owned' using errcode = '22023';
  end if;

  select * into v_instrument
  from public.discount_instruments instrument
  where instrument.instrument_id = p_instrument_id
    and instrument.collaboration_lead_id = p_lead_id
    and instrument.source = 'collaboration'
  for update;

  if not found then
    raise exception 'KOL Code not found' using errcode = 'P0002';
  end if;
  if v_instrument.updated_at is distinct from p_expected_updated_at then
    raise exception 'KOL Code changed in another session' using errcode = '40001';
  end if;
  if v_instrument.status not in ('active', 'disabled') then
    raise exception 'Historical KOL Code cannot be edited' using errcode = '22023';
  end if;

  select * into v_offer
  from public.discount_offers offer
  where offer.offer_id = v_instrument.offer_id
  for update;

  if not found then
    raise exception 'KOL discount offer not found' using errcode = 'P0002';
  end if;
  if p_effect_type not in ('fixed_amount', 'percentage') then
    raise exception 'Unsupported KOL discount effect' using errcode = '22023';
  end if;
  if p_value is null or p_value <= 0 or (p_effect_type = 'percentage' and p_value > 100) then
    raise exception 'Invalid KOL discount value' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'KOL Code expiry must be in the future' using errcode = '22023';
  end if;
  if p_max_redemptions is not null
     and p_max_redemptions < (v_instrument.reserved_count + v_instrument.paid_count) then
    raise exception 'KOL Code usage limit cannot be below existing usage' using errcode = '22023';
  end if;
  if p_max_redemptions is not null and p_max_redemptions <= 0 then
    raise exception 'KOL Code usage limit must be positive' using errcode = '22023';
  end if;
  if p_max_redemptions_per_customer is not null and p_max_redemptions_per_customer <= 0 then
    raise exception 'KOL Code per-customer limit must be positive' using errcode = '22023';
  end if;

  if p_max_redemptions_per_customer is not null then
    select coalesce(max(customer_usage.usage_count), 0)::integer
      into v_max_customer_usage
    from (
      select count(*)::integer as usage_count
      from public.discount_redemptions redemption
      where redemption.instrument_id = v_instrument.instrument_id
        and redemption.status in ('applied', 'paid')
      group by coalesce(redemption.customer_id::text, lower(redemption.email))
    ) customer_usage;

    if p_max_redemptions_per_customer < v_max_customer_usage then
      raise exception 'KOL Code per-customer limit cannot be below existing usage' using errcode = '22023';
    end if;
  end if;

  if p_is_active and exists (
    select 1
    from public.discount_instruments instrument
    where instrument.collaboration_lead_id = p_lead_id
      and instrument.source = 'collaboration'
      and instrument.status = 'active'
      and instrument.instrument_id <> p_instrument_id
  ) then
    raise exception 'Another KOL Code is already active for this lead' using errcode = '23505';
  end if;

  if p_effect_type = 'fixed_amount' then
    v_effect_config := jsonb_build_object('amount_usd', round(p_value, 2));
  else
    v_effect_config := jsonb_build_object('percent', round(p_value, 2));
  end if;
  v_committed_status := case when p_is_active then 'active' else 'disabled' end;

  update public.discount_offers
  set
    effect_type = p_effect_type,
    effect_config = v_effect_config,
    is_active = p_is_active,
    expires_at = p_expires_at,
    updated_at = v_committed_at
  where offer_id = v_offer.offer_id;

  update public.discount_instruments
  set
    is_active = p_is_active,
    status = v_committed_status,
    max_redemptions = p_max_redemptions,
    max_redemptions_per_customer = p_max_redemptions_per_customer,
    updated_at = v_committed_at
  where instrument_id = v_instrument.instrument_id;

  return query select v_offer.offer_id, v_instrument.instrument_id, v_committed_status;
end;
$$;

create or replace function public.rotate_kol_collaboration_code(
  p_admin_customer_id uuid,
  p_lead_id uuid,
  p_current_instrument_id uuid,
  p_expected_updated_at timestamptz,
  p_code text,
  p_effect_type text,
  p_value numeric,
  p_expires_at timestamptz default null,
  p_max_redemptions integer default null,
  p_max_redemptions_per_customer integer default null
)
returns table(
  superseded_instrument_id uuid,
  created_offer_id uuid,
  created_instrument_id uuid,
  normalized_code text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lead public.kol_collaboration_leads%rowtype;
  v_current public.discount_instruments%rowtype;
  v_created record;
begin
  if not exists (
    select 1 from public.customers
    where customer_id = p_admin_customer_id and role = 'admin'
  ) then
    raise exception 'Admin authorization required' using errcode = '42501';
  end if;

  select * into v_lead
  from public.kol_collaboration_leads
  where lead_id = p_lead_id
  for update;

  if not found then
    raise exception 'KOL lead not found' using errcode = 'P0002';
  end if;
  if v_lead.review_status <> 'partnered' or v_lead.customer_id is null then
    raise exception 'KOL lead must be partnered and account-owned' using errcode = '22023';
  end if;

  select * into v_current
  from public.discount_instruments instrument
  where instrument.instrument_id = p_current_instrument_id
    and instrument.collaboration_lead_id = p_lead_id
    and instrument.source = 'collaboration'
  for update;

  if not found then
    raise exception 'Current KOL Code not found' using errcode = 'P0002';
  end if;
  if v_current.status <> 'active' or not v_current.is_active then
    raise exception 'Only the active KOL Code can be superseded' using errcode = '22023';
  end if;
  if v_current.updated_at is distinct from p_expected_updated_at then
    raise exception 'KOL Code changed in another session' using errcode = '40001';
  end if;

  update public.discount_offers
  set is_active = false,
      description = 'Superseded KOL partnership Code',
      updated_at = now()
  where offer_id = v_current.offer_id;

  update public.discount_instruments
  set is_active = false,
      status = 'disabled',
      updated_at = now()
  where instrument_id = v_current.instrument_id;

  select * into v_created
  from public.create_kol_collaboration_code(
    p_admin_customer_id,
    p_lead_id,
    p_code,
    p_effect_type,
    p_value,
    p_expires_at,
    p_max_redemptions,
    p_max_redemptions_per_customer
  );

  return query select
    v_current.instrument_id,
    v_created.created_offer_id,
    v_created.created_instrument_id,
    v_created.normalized_code;
end;
$$;

alter table public.kol_collaboration_leads enable row level security;
alter table public.kol_collaboration_messages enable row level security;

revoke all on table public.kol_collaboration_leads from public, anon, authenticated;
revoke all on table public.kol_collaboration_messages from public, anon, authenticated;
revoke all on function public.sync_kol_lead_from_message() from public, anon, authenticated;
revoke all on function public.claim_kol_collaboration_leads_for_customer(uuid, text)
  from public, anon, authenticated;
revoke all on function public.create_kol_collaboration_code(uuid, uuid, text, text, numeric, timestamptz, integer, integer)
  from public, anon, authenticated;
revoke all on function public.update_kol_collaboration_code(uuid, uuid, uuid, timestamptz, text, numeric, timestamptz, integer, integer, boolean)
  from public, anon, authenticated;
revoke all on function public.rotate_kol_collaboration_code(uuid, uuid, uuid, timestamptz, text, text, numeric, timestamptz, integer, integer)
  from public, anon, authenticated;

grant select, insert, update, delete on table public.kol_collaboration_leads to service_role;
grant select, insert, update, delete on table public.kol_collaboration_messages to service_role;
grant execute on function public.claim_kol_collaboration_leads_for_customer(uuid, text)
  to service_role;
grant execute on function public.create_kol_collaboration_code(uuid, uuid, text, text, numeric, timestamptz, integer, integer)
  to service_role;
grant execute on function public.update_kol_collaboration_code(uuid, uuid, uuid, timestamptz, text, numeric, timestamptz, integer, integer, boolean)
  to service_role;
grant execute on function public.rotate_kol_collaboration_code(uuid, uuid, uuid, timestamptz, text, text, numeric, timestamptz, integer, integer)
  to service_role;

-- The self-service Creator Promo runtime is removed in the matching S6 deploy.
-- This setting no longer has a reader or writer after that cutover.
delete from public.admin_settings
where setting_key = 'creator_promo_config';

commit;
