-- Consumer Runtime Phase 2K forward-only migration.
-- Adds one authenticated current-user atomic daily nutrition summary persistence function.
-- No seed, fixture, bootstrap, table redesign, production credential, or UI change is included.

create or replace function public.persist_authenticated_daily_nutrition_summary(
  p_summary_date date,
  p_timezone text default 'Asia/Taipei',
  p_calculation_version text default 'consumer-daily-summary-v1',
  p_total_calories numeric default 0,
  p_total_protein_g numeric default 0,
  p_total_carbohydrates_g numeric default 0,
  p_total_fat_g numeric default 0,
  p_total_fiber_g numeric default null,
  p_meal_count integer default 0,
  p_item_count integer default null,
  p_source_cutoff_at timestamptz default null,
  p_recalculated_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_summary public.daily_nutrition_summaries%rowtype;
begin
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  if p_summary_date is null then
    raise exception 'SUMMARY_DATE_REQUIRED' using errcode = '22023';
  end if;

  if coalesce(length(btrim(p_timezone)), 0) = 0 or length(btrim(p_timezone)) > 64 then
    raise exception 'INVALID_TIMEZONE' using errcode = '22023';
  end if;

  if coalesce(length(btrim(p_calculation_version)), 0) = 0 or length(btrim(p_calculation_version)) > 80 then
    raise exception 'INVALID_CALCULATION_VERSION' using errcode = '22023';
  end if;

  if p_total_calories is null or p_total_calories < 0 then
    raise exception 'INVALID_TOTAL_CALORIES' using errcode = '22023';
  end if;

  if p_total_protein_g is null or p_total_protein_g < 0 then
    raise exception 'INVALID_TOTAL_PROTEIN' using errcode = '22023';
  end if;

  if p_total_carbohydrates_g is null or p_total_carbohydrates_g < 0 then
    raise exception 'INVALID_TOTAL_CARBOHYDRATES' using errcode = '22023';
  end if;

  if p_total_fat_g is null or p_total_fat_g < 0 then
    raise exception 'INVALID_TOTAL_FAT' using errcode = '22023';
  end if;

  if p_total_fiber_g is not null and p_total_fiber_g < 0 then
    raise exception 'INVALID_TOTAL_FIBER' using errcode = '22023';
  end if;

  if p_meal_count is null or p_meal_count < 0 then
    raise exception 'INVALID_MEAL_COUNT' using errcode = '22023';
  end if;

  if p_item_count is not null and p_item_count < 0 then
    raise exception 'INVALID_ITEM_COUNT' using errcode = '22023';
  end if;

  insert into public.daily_nutrition_summaries (
    user_id,
    local_date,
    timezone,
    calculation_version,
    total_calories,
    total_protein_g,
    total_carbohydrates_g,
    total_fat_g,
    total_fiber_g,
    meal_count,
    source_cutoff_at,
    recalculated_at,
    is_current
  )
  values (
    v_user_id,
    p_summary_date,
    btrim(p_timezone),
    btrim(p_calculation_version),
    p_total_calories,
    p_total_protein_g,
    p_total_carbohydrates_g,
    p_total_fat_g,
    p_total_fiber_g,
    p_meal_count,
    coalesce(p_source_cutoff_at, p_recalculated_at, now()),
    coalesce(p_recalculated_at, now()),
    true
  )
  on conflict (user_id, local_date, timezone, calculation_version) where is_current = true
  do update set
    total_calories = excluded.total_calories,
    total_protein_g = excluded.total_protein_g,
    total_carbohydrates_g = excluded.total_carbohydrates_g,
    total_fat_g = excluded.total_fat_g,
    total_fiber_g = excluded.total_fiber_g,
    meal_count = excluded.meal_count,
    source_cutoff_at = excluded.source_cutoff_at,
    recalculated_at = excluded.recalculated_at,
    is_current = true
  returning * into v_summary;

  return jsonb_build_object(
    'id', v_summary.id,
    'user_id', v_summary.user_id,
    'local_date', v_summary.local_date,
    'timezone', v_summary.timezone,
    'calculation_version', v_summary.calculation_version,
    'total_calories', v_summary.total_calories,
    'total_protein_g', v_summary.total_protein_g,
    'total_carbohydrates_g', v_summary.total_carbohydrates_g,
    'total_fat_g', v_summary.total_fat_g,
    'total_fiber_g', v_summary.total_fiber_g,
    'meal_count', v_summary.meal_count,
    'source_cutoff_at', v_summary.source_cutoff_at,
    'recalculated_at', v_summary.recalculated_at,
    'is_current', v_summary.is_current
  );
end;
$$;

revoke all on function public.persist_authenticated_daily_nutrition_summary(
  date,
  text,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  integer,
  integer,
  timestamptz,
  timestamptz
) from public;

revoke all on function public.persist_authenticated_daily_nutrition_summary(
  date,
  text,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  integer,
  integer,
  timestamptz,
  timestamptz
) from anon;

grant execute on function public.persist_authenticated_daily_nutrition_summary(
  date,
  text,
  text,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  integer,
  integer,
  timestamptz,
  timestamptz
) to authenticated;

revoke insert, update, delete on table public.daily_nutrition_summaries from authenticated;
revoke insert, update, delete on table public.daily_nutrition_summaries from anon;
