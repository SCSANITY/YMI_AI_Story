-- Professional, customer-visible reply aliases for Support and KOL threads.
-- Run after sql_support_ticket_center.sql and sql_kol_partnership_foundation.sql.
-- Existing reply_token values remain the private compatibility route for emails
-- that were already delivered with an older Reply-To address.

begin;

create extension if not exists pgcrypto;

create or replace function public.generate_email_reply_alias()
returns text
language plpgsql
volatile
set search_path = public, extensions, pg_temp
as $$
declare
  v_alphabet constant text := '23456789abcdefghjkmnpqrstuvwxyz';
  v_alias text := '';
  v_value integer;
begin
  -- Rejection sampling avoids modulo bias for the 31-character alphabet.
  while length(v_alias) < 12 loop
    v_value := get_byte(gen_random_bytes(1), 0);
    if v_value < 248 then
      v_alias := v_alias || substr(v_alphabet, (v_value % 31) + 1, 1);
    end if;
  end loop;
  return v_alias;
end;
$$;

revoke all on function public.generate_email_reply_alias() from public, anon, authenticated;
grant execute on function public.generate_email_reply_alias() to service_role;

alter table public.support_questions
  add column if not exists reply_alias text;

alter table public.kol_collaboration_leads
  add column if not exists reply_alias text;

do $$
declare
  v_question_id uuid;
  v_alias text;
begin
  for v_question_id in
    select question_id
    from public.support_questions
    where reply_alias is null
    order by question_id
  loop
    loop
      v_alias := public.generate_email_reply_alias();
      exit when not exists (
        select 1 from public.support_questions where reply_alias = v_alias
      );
    end loop;

    update public.support_questions
    set reply_alias = v_alias
    where question_id = v_question_id and reply_alias is null;
  end loop;
end;
$$;

do $$
declare
  v_lead_id uuid;
  v_alias text;
begin
  for v_lead_id in
    select lead_id
    from public.kol_collaboration_leads
    where reply_alias is null
    order by lead_id
  loop
    loop
      v_alias := public.generate_email_reply_alias();
      exit when not exists (
        select 1 from public.kol_collaboration_leads where reply_alias = v_alias
      );
    end loop;

    update public.kol_collaboration_leads
    set reply_alias = v_alias
    where lead_id = v_lead_id and reply_alias is null;
  end loop;
end;
$$;

alter table public.support_questions
  alter column reply_alias set default public.generate_email_reply_alias(),
  alter column reply_alias set not null;

alter table public.kol_collaboration_leads
  alter column reply_alias set default public.generate_email_reply_alias(),
  alter column reply_alias set not null;

alter table public.support_questions
  drop constraint if exists support_questions_reply_alias_check,
  add constraint support_questions_reply_alias_check
    check (reply_alias ~ '^[23456789abcdefghjkmnpqrstuvwxyz]{12}$');

alter table public.kol_collaboration_leads
  drop constraint if exists kol_collaboration_leads_reply_alias_check,
  add constraint kol_collaboration_leads_reply_alias_check
    check (reply_alias ~ '^[23456789abcdefghjkmnpqrstuvwxyz]{12}$');

create unique index if not exists support_questions_reply_alias_key
  on public.support_questions(reply_alias);

create unique index if not exists kol_collaboration_leads_reply_alias_key
  on public.kol_collaboration_leads(reply_alias);

comment on column public.support_questions.reply_alias is
  'Public 12-character route identifier used in case-XXXX-XXXX-XXXX Reply-To addresses.';

comment on column public.kol_collaboration_leads.reply_alias is
  'Public 12-character route identifier used in partner-XXXX-XXXX-XXXX Reply-To addresses.';

commit;
