begin;

alter table public.orders
  add column if not exists checkout_session_id text,
  add column if not exists checkout_session_locked_at timestamptz;

create unique index if not exists idx_orders_checkout_session_id_unique
  on public.orders (checkout_session_id)
  where checkout_session_id is not null;

create or replace function public.guard_locked_checkout_cart_item()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_id uuid;
  v_is_locked boolean;
begin
  for v_order_id in
    select distinct candidate
    from unnest(array[
      case when tg_op <> 'INSERT' then old.order_id else null end,
      case when tg_op <> 'DELETE' then new.order_id else null end
    ]) candidate
    where candidate is not null
  loop
    select exists (
      select 1
      from public.orders o
      where o.order_id = v_order_id
        and o.order_status::text = 'unpaid'
        and o.checkout_session_id is not null
    ) into v_is_locked;

    if v_is_locked then
      raise exception 'Checkout session is active; order items are locked'
        using errcode = 'P0001';
    end if;
  end loop;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists cart_items_guard_locked_checkout on public.cart_items;
create trigger cart_items_guard_locked_checkout
before insert or update or delete on public.cart_items
for each row execute function public.guard_locked_checkout_cart_item();

create or replace function public.guard_locked_checkout_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.order_status::text = 'unpaid' and old.checkout_session_id is not null then
      raise exception 'Checkout session is active; order is locked'
        using errcode = 'P0001';
    end if;
    return old;
  end if;

  if old.order_status::text = 'unpaid'
     and old.checkout_session_id is not null
     and new.order_status::text = 'unpaid'
     and new.checkout_session_id is not null
     and (
       new.customer_id is distinct from old.customer_id
       or new.email is distinct from old.email
       or new.shipping_address is distinct from old.shipping_address
       or new.billing_address is distinct from old.billing_address
       or new.checkout_currency is distinct from old.checkout_currency
       or new.shipping_amount_usd is distinct from old.shipping_amount_usd
       or new.shipping_rate_snapshot is distinct from old.shipping_rate_snapshot
       or new.shipping_method is distinct from old.shipping_method
       or new.shipping_zone_code is distinct from old.shipping_zone_code
       or new.discount_amount_usd is distinct from old.discount_amount_usd
       or new.shipping_discount_amount_usd is distinct from old.shipping_discount_amount_usd
       or new.applied_product_discount_instrument_id is distinct from old.applied_product_discount_instrument_id
       or new.applied_shipping_discount_instrument_id is distinct from old.applied_shipping_discount_instrument_id
     ) then
    raise exception 'Checkout session is active; order payment terms are locked'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists orders_guard_locked_checkout on public.orders;
create trigger orders_guard_locked_checkout
before update or delete on public.orders
for each row execute function public.guard_locked_checkout_order();

revoke all on function public.guard_locked_checkout_cart_item() from public, anon, authenticated;
revoke all on function public.guard_locked_checkout_order() from public, anon, authenticated;

commit;
