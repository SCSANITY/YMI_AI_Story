-- T3-031 destructive cleanup.
-- DO NOT apply until the T3-031 application code is deployed and verified.

drop index if exists public.templates_home_sections_gin_idx;
drop index if exists public.templates_home_flags_idx;

alter table public.templates
  drop column if exists price_cents,
  drop column if exists compare_at_price_cents,
  drop column if exists discount_percent,
  drop column if exists home_sections,
  drop column if exists is_brand_new,
  drop column if exists is_for_boys,
  drop column if exists is_for_girls,
  drop column if exists is_discount;

