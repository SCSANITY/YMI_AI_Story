-- Atomic attempt limit for Guest Checkout OTP verification.
-- Apply before deploying the route that calls verify_guest_otp.

alter table public.verification_codes
  add column if not exists failed_attempts integer not null default 0,
  add column if not exists last_attempt_at timestamp with time zone;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'verification_codes_failed_attempts_check'
      and conrelid = 'public.verification_codes'::regclass
  ) then
    alter table public.verification_codes
      add constraint verification_codes_failed_attempts_check
      check (failed_attempts between 0 and 5);
  end if;
end;
$$;

create or replace function public.verify_guest_otp(
  p_email text,
  p_code text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamp with time zone := clock_timestamp();
  v_verification public.verification_codes%rowtype;
  v_next_attempts integer;
begin
  if p_email is null or p_code is null then
    return false;
  end if;

  select *
  into v_verification
  from public.verification_codes
  where email = lower(trim(p_email))
    and expires_at > v_now
  order by expires_at desc, created_at desc
  limit 1
  for update;

  if not found then
    return false;
  end if;

  if v_verification.failed_attempts >= 5 then
    delete from public.verification_codes where email = v_verification.email;
    return false;
  end if;

  if v_verification.code = trim(p_code) then
    delete from public.verification_codes where email = v_verification.email;
    return true;
  end if;

  v_next_attempts := v_verification.failed_attempts + 1;
  if v_next_attempts >= 5 then
    delete from public.verification_codes where email = v_verification.email;
  else
    update public.verification_codes
    set failed_attempts = v_next_attempts,
        last_attempt_at = v_now
    where verification_id = v_verification.verification_id;
  end if;

  return false;
end;
$$;

revoke all on function public.verify_guest_otp(text, text) from public, anon, authenticated;
grant execute on function public.verify_guest_otp(text, text) to service_role;
