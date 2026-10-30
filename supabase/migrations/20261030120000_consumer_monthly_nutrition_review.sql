-- R1-A: owner-private monthly nutrition review v1 (Owner Q6 phase 1, 2026-10-30). Forward-only; local inactive package.
-- Content (Owner): recorded days, meal count, totals of calories/protein/carbohydrates/fat/fiber, averages per RECORDED day with the
-- recorded-day count beside them; days without records are not zero-filled; a missing nutrition value is never zero (it is counted
-- and disclosed); the current month is "in progress"; a month is recalculated with a new revision while its details still exist; no
-- score, grade or health judgement. Month attribution uses the account's fixed report timezone binding (Owner E), never the device zone.
-- Boundaries: no deletion, expiry, hiding, collapse or purge; no entitlement read; no grant (Free/Paid/permanent) of any kind; the
-- six-month interface below is NOT a retention or display rule for any tier. Ordinary consumer migration (no superuser requirement).

create schema consumer_review;
revoke all on schema consumer_review from public, anon, authenticated, authenticator, service_role;

-- Fixed report timezone. Append-only: version 1 is taken once from consumer_profiles.timezone (server row, never a client value).
-- A later version (not created by this package) would apply only from effective_from_month onwards; earlier months keep their binding.
create table consumer_review.report_timezone_bindings (
  user_id uuid not null references auth.users(id) on delete cascade,
  binding_version integer not null check (binding_version >= 1),
  timezone text not null check (length(timezone) between 1 and 64),
  effective_from_month text check (effective_from_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  source text not null check (source = 'consumer_profiles.timezone'),
  created_at timestamptz not null default transaction_timestamp(),
  primary key (user_id, binding_version),
  constraint report_timezone_binding_start check ((binding_version = 1) = (effective_from_month is null))
);

create table consumer_review.monthly_nutrition_reviews (
  user_id uuid not null references auth.users(id) on delete cascade,
  month_key text not null check (month_key ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  binding_version integer not null,
  report_timezone text not null,
  calculation_version text not null check (calculation_version = 'consumer-monthly-review-v1'),
  revision integer not null check (revision >= 1),
  source_digest text not null check (source_digest ~ '^[0-9a-f]{64}$'),
  recorded_days integer not null check (recorded_days between 0 and 31),
  meal_count integer not null check (meal_count >= 0),
  item_count integer not null check (item_count >= 0),
  calories_total numeric not null check (calories_total >= 0),
  calories_valid_items integer not null check (calories_valid_items >= 0),
  calories_missing_items integer not null check (calories_missing_items >= 0),
  calories_invalid_items integer not null check (calories_invalid_items >= 0),
  protein_total numeric not null check (protein_total >= 0),
  protein_valid_items integer not null check (protein_valid_items >= 0),
  protein_missing_items integer not null check (protein_missing_items >= 0),
  protein_invalid_items integer not null check (protein_invalid_items >= 0),
  carbohydrates_total numeric not null check (carbohydrates_total >= 0),
  carbohydrates_valid_items integer not null check (carbohydrates_valid_items >= 0),
  carbohydrates_missing_items integer not null check (carbohydrates_missing_items >= 0),
  carbohydrates_invalid_items integer not null check (carbohydrates_invalid_items >= 0),
  fat_total numeric not null check (fat_total >= 0),
  fat_valid_items integer not null check (fat_valid_items >= 0),
  fat_missing_items integer not null check (fat_missing_items >= 0),
  fat_invalid_items integer not null check (fat_invalid_items >= 0),
  fiber_total numeric not null check (fiber_total >= 0),
  fiber_valid_items integer not null check (fiber_valid_items >= 0),
  fiber_missing_items integer not null check (fiber_missing_items >= 0),
  fiber_invalid_items integer not null check (fiber_invalid_items >= 0),
  computed_at timestamptz not null,
  primary key (user_id, month_key),
  foreign key (user_id, binding_version) references consumer_review.report_timezone_bindings(user_id, binding_version) on delete cascade,
  constraint monthly_review_days_meals check ((recorded_days = 0) = (meal_count = 0) and recorded_days <= meal_count),
  constraint monthly_review_item_accounting check (
    calories_valid_items + calories_missing_items + calories_invalid_items = item_count
    and protein_valid_items + protein_missing_items + protein_invalid_items = item_count
    and carbohydrates_valid_items + carbohydrates_missing_items + carbohydrates_invalid_items = item_count
    and fat_valid_items + fat_missing_items + fat_invalid_items = item_count
    and fiber_valid_items + fiber_missing_items + fiber_invalid_items = item_count)
);

alter table consumer_review.report_timezone_bindings enable row level security;
alter table consumer_review.monthly_nutrition_reviews enable row level security;
revoke all on consumer_review.report_timezone_bindings from public, anon, authenticated, authenticator, service_role;
revoke all on consumer_review.monthly_nutrition_reviews from public, anon, authenticated, authenticator, service_role;

-- Bindings are append-only. A direct UPDATE or DELETE is refused; only the account-deletion cascade (a nested RI action) may remove them.
create function consumer_review.reject_binding_change() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and pg_catalog.pg_trigger_depth() > 1 then return old; end if;
  raise exception 'REPORT_TIMEZONE_BINDING_IMMUTABLE' using errcode = '23514';
end $$;
create trigger report_timezone_binding_immutable before update or delete on consumer_review.report_timezone_bindings
  for each row execute function consumer_review.reject_binding_change();

-- One nutrition value of one item: 'valid' (a JSON number >= 0), 'missing' (absent or JSON null) or 'invalid' (anything else).
-- The legacy read aliases kcal/carbs are honoured exactly as the meal mapper does (primary key first; alias only when the primary is absent or null).
create function consumer_review.nutrient_value(p_snapshot jsonb, p_key text, p_alias text) returns jsonb language sql immutable set search_path = '' as $$
  with v as (select case
    when p_snapshot is null or pg_catalog.jsonb_typeof(p_snapshot) <> 'object' then null
    when pg_catalog.jsonb_typeof(p_snapshot -> p_key) is not null and pg_catalog.jsonb_typeof(p_snapshot -> p_key) <> 'null' then p_snapshot -> p_key
    when p_alias is not null then p_snapshot -> p_alias
    else null end as x)
  select case
    when x is null or pg_catalog.jsonb_typeof(x) = 'null' then pg_catalog.jsonb_build_object('state', 'missing')
    when pg_catalog.jsonb_typeof(x) = 'number' and (x #>> '{}')::numeric >= 0 then pg_catalog.jsonb_build_object('state', 'valid', 'value', (x #>> '{}')::numeric)
    else pg_catalog.jsonb_build_object('state', 'invalid') end
  from v
$$;

-- Recalculates ONE month of ONE owner from the complete current details (no row limit). Same source digest => no write (revision
-- unchanged); changed digest => the whole month is recomputed from scratch and revision + 1 (never incremental, so no double count).
-- A month without any record and without a row stays without a row; an existing row is updated, never deleted.
create function consumer_review.refresh_month(p_user uuid, p_binding_version integer, p_timezone text, p_month_key text) returns void
language plpgsql set search_path = '' as $$
declare
  v_start timestamptz := pg_catalog.timezone(p_timezone, (p_month_key || '-01')::timestamp);
  v_end timestamptz := pg_catalog.timezone(p_timezone, ((p_month_key || '-01')::date + interval '1 month')::timestamp);
  v_digest text; v_row consumer_review.monthly_nutrition_reviews%rowtype; v_has boolean; a record;
begin
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      'consumer-monthly-review-v1|' || p_binding_version || '|' || p_timezone || '|' || coalesce((
        select pg_catalog.string_agg(m.id::text || '@' || pg_catalog.to_char(m.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '@' || pg_catalog.to_char(m.occurred_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '[' || coalesce((
            select pg_catalog.string_agg(i.id::text || '@' || pg_catalog.to_char(i.updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US') || '@' || i.consumed_ratio::text || '@' || i.nutrition_snapshot::text, ';' order by i.id)
            from public.meal_record_items i where i.meal_record_id = m.id), '') || ']', ',' order by m.id)
        from public.meal_records m
        where m.user_id = p_user and m.deleted_at is null and m.occurred_at >= v_start and m.occurred_at < v_end), ''), 'UTF8')), 'hex')
    into v_digest;
  select * into v_row from consumer_review.monthly_nutrition_reviews where user_id = p_user and month_key = p_month_key for update;
  v_has := found;
  if v_has and v_row.source_digest = v_digest and v_row.binding_version = p_binding_version then return; end if;
  with meals as (
    select m.id, (m.occurred_at at time zone p_timezone)::date as local_day
    from public.meal_records m
    where m.user_id = p_user and m.deleted_at is null and m.occurred_at >= v_start and m.occurred_at < v_end
  ), items as (
    select i.consumed_ratio,
      consumer_review.nutrient_value(i.nutrition_snapshot, 'calories', 'kcal') c,
      consumer_review.nutrient_value(i.nutrition_snapshot, 'protein', null) p,
      consumer_review.nutrient_value(i.nutrition_snapshot, 'carbohydrates', 'carbs') h,
      consumer_review.nutrient_value(i.nutrition_snapshot, 'fat', null) f,
      consumer_review.nutrient_value(i.nutrition_snapshot, 'fiber', null) b
    from public.meal_record_items i join meals on meals.id = i.meal_record_id
  )
  select
    (select count(distinct local_day)::integer from meals) days,
    (select count(*)::integer from meals) meal_n,
    (select count(*)::integer from items) item_n,
    coalesce((select sum((c ->> 'value')::numeric * consumed_ratio) from items where c ->> 'state' = 'valid'), 0) c_t,
    (select count(*)::integer from items where c ->> 'state' = 'valid') c_v, (select count(*)::integer from items where c ->> 'state' = 'missing') c_m, (select count(*)::integer from items where c ->> 'state' = 'invalid') c_i,
    coalesce((select sum((p ->> 'value')::numeric * consumed_ratio) from items where p ->> 'state' = 'valid'), 0) p_t,
    (select count(*)::integer from items where p ->> 'state' = 'valid') p_v, (select count(*)::integer from items where p ->> 'state' = 'missing') p_m, (select count(*)::integer from items where p ->> 'state' = 'invalid') p_i,
    coalesce((select sum((h ->> 'value')::numeric * consumed_ratio) from items where h ->> 'state' = 'valid'), 0) h_t,
    (select count(*)::integer from items where h ->> 'state' = 'valid') h_v, (select count(*)::integer from items where h ->> 'state' = 'missing') h_m, (select count(*)::integer from items where h ->> 'state' = 'invalid') h_i,
    coalesce((select sum((f ->> 'value')::numeric * consumed_ratio) from items where f ->> 'state' = 'valid'), 0) f_t,
    (select count(*)::integer from items where f ->> 'state' = 'valid') f_v, (select count(*)::integer from items where f ->> 'state' = 'missing') f_m, (select count(*)::integer from items where f ->> 'state' = 'invalid') f_i,
    coalesce((select sum((b ->> 'value')::numeric * consumed_ratio) from items where b ->> 'state' = 'valid'), 0) b_t,
    (select count(*)::integer from items where b ->> 'state' = 'valid') b_v, (select count(*)::integer from items where b ->> 'state' = 'missing') b_m, (select count(*)::integer from items where b ->> 'state' = 'invalid') b_i
  into a;
  if not v_has and a.meal_n = 0 then return; end if;
  if v_has then
    update consumer_review.monthly_nutrition_reviews set binding_version = p_binding_version, report_timezone = p_timezone, revision = revision + 1, source_digest = v_digest,
      recorded_days = a.days, meal_count = a.meal_n, item_count = a.item_n,
      calories_total = a.c_t, calories_valid_items = a.c_v, calories_missing_items = a.c_m, calories_invalid_items = a.c_i,
      protein_total = a.p_t, protein_valid_items = a.p_v, protein_missing_items = a.p_m, protein_invalid_items = a.p_i,
      carbohydrates_total = a.h_t, carbohydrates_valid_items = a.h_v, carbohydrates_missing_items = a.h_m, carbohydrates_invalid_items = a.h_i,
      fat_total = a.f_t, fat_valid_items = a.f_v, fat_missing_items = a.f_m, fat_invalid_items = a.f_i,
      fiber_total = a.b_t, fiber_valid_items = a.b_v, fiber_missing_items = a.b_m, fiber_invalid_items = a.b_i,
      computed_at = pg_catalog.clock_timestamp()
    where user_id = p_user and month_key = p_month_key;
  else
    insert into consumer_review.monthly_nutrition_reviews values (p_user, p_month_key, p_binding_version, p_timezone, 'consumer-monthly-review-v1', 1, v_digest,
      a.days, a.meal_n, a.item_n, a.c_t, a.c_v, a.c_m, a.c_i, a.p_t, a.p_v, a.p_m, a.p_i, a.h_t, a.h_v, a.h_m, a.h_i, a.f_t, a.f_v, a.f_m, a.f_i, a.b_t, a.b_v, a.b_m, a.b_i,
      pg_catalog.clock_timestamp());
  end if;
end $$;

-- A nutrient with no valid value in the month has total and average null (unknown), never 0; the item counts still disclose why.
create function consumer_review.month_json(r consumer_review.monthly_nutrition_reviews, p_in_progress boolean) returns jsonb language sql stable set search_path = '' as $$
  select pg_catalog.jsonb_build_object(
    'monthKey', r.month_key, 'hasRecords', true, 'inProgress', p_in_progress, 'revision', r.revision, 'computedAt', r.computed_at,
    'bindingVersion', r.binding_version, 'recordedDays', r.recorded_days, 'mealCount', r.meal_count, 'itemCount', r.item_count,
    'averageDenominator', 'recorded_days',
    'nutrients', pg_catalog.jsonb_build_object(
      'calories', pg_catalog.jsonb_build_object('total', case when r.calories_valid_items > 0 then round(r.calories_total, 2) end, 'averagePerRecordedDay', case when r.calories_valid_items > 0 and r.recorded_days > 0 then round(r.calories_total / r.recorded_days, 2) end, 'validItems', r.calories_valid_items, 'missingItems', r.calories_missing_items, 'invalidItems', r.calories_invalid_items),
      'protein', pg_catalog.jsonb_build_object('total', case when r.protein_valid_items > 0 then round(r.protein_total, 2) end, 'averagePerRecordedDay', case when r.protein_valid_items > 0 and r.recorded_days > 0 then round(r.protein_total / r.recorded_days, 2) end, 'validItems', r.protein_valid_items, 'missingItems', r.protein_missing_items, 'invalidItems', r.protein_invalid_items),
      'carbohydrates', pg_catalog.jsonb_build_object('total', case when r.carbohydrates_valid_items > 0 then round(r.carbohydrates_total, 2) end, 'averagePerRecordedDay', case when r.carbohydrates_valid_items > 0 and r.recorded_days > 0 then round(r.carbohydrates_total / r.recorded_days, 2) end, 'validItems', r.carbohydrates_valid_items, 'missingItems', r.carbohydrates_missing_items, 'invalidItems', r.carbohydrates_invalid_items),
      'fat', pg_catalog.jsonb_build_object('total', case when r.fat_valid_items > 0 then round(r.fat_total, 2) end, 'averagePerRecordedDay', case when r.fat_valid_items > 0 and r.recorded_days > 0 then round(r.fat_total / r.recorded_days, 2) end, 'validItems', r.fat_valid_items, 'missingItems', r.fat_missing_items, 'invalidItems', r.fat_invalid_items),
      'fiber', pg_catalog.jsonb_build_object('total', case when r.fiber_valid_items > 0 then round(r.fiber_total, 2) end, 'averagePerRecordedDay', case when r.fiber_valid_items > 0 and r.recorded_days > 0 then round(r.fiber_total / r.recorded_days, 2) end, 'validItems', r.fiber_valid_items, 'missingItems', r.fiber_missing_items, 'invalidItems', r.fiber_invalid_items)))
$$;

revoke all on function consumer_review.reject_binding_change() from public, anon, authenticated, authenticator, service_role;
revoke all on function consumer_review.nutrient_value(jsonb, text, text) from public, anon, authenticated, authenticator, service_role;
revoke all on function consumer_review.refresh_month(uuid, integer, text, text) from public, anon, authenticated, authenticator, service_role;
revoke all on function consumer_review.month_json(consumer_review.monthly_nutrition_reviews, boolean) from public, anon, authenticated, authenticator, service_role;

-- The only runtime entry. Owner = auth.uid() (never a parameter); PC-2 core gate first; per-owner transaction lock; the report month and
-- "now" come from the server clock. Returns the latest six report months including the current one. That window is the scope of this
-- interface only: it is not a Free/Paid display or retention rule, older months are not deleted and no entitlement is read or created.
create function public.get_current_user_monthly_nutrition_review() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_binding consumer_review.report_timezone_bindings%rowtype; v_profiles integer; v_zone text;
  v_local timestamp; v_current text; v_month text; v_months jsonb := '[]'::jsonb; v_row consumer_review.monthly_nutrition_reviews%rowtype;
begin
  if v_user is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  if not public.consumer_core_eligible() then raise exception 'CORE_ACCESS_DENIED' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(1830212301, pg_catalog.hashtext(v_user::text));
  select * into v_binding from consumer_review.report_timezone_bindings where user_id = v_user order by binding_version desc limit 1;
  if not found then
    select count(*)::integer, min(p.timezone) into v_profiles, v_zone from public.consumer_profiles p where p.user_id = v_user;
    if v_profiles <> 1 then raise exception 'REPORT_TIMEZONE_PROFILE_REQUIRED' using errcode = '55000'; end if;
    if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_zone) then raise exception 'REPORT_TIMEZONE_INVALID' using errcode = '22023'; end if;
    insert into consumer_review.report_timezone_bindings(user_id, binding_version, timezone, effective_from_month, source)
      values (v_user, 1, v_zone, null, 'consumer_profiles.timezone') returning * into v_binding;
  end if;
  v_local := pg_catalog.timezone(v_binding.timezone, pg_catalog.transaction_timestamp());
  v_current := pg_catalog.to_char(v_local, 'YYYY-MM');
  for i in reverse 5..0 loop
    v_month := pg_catalog.to_char(pg_catalog.date_trunc('month', v_local) - pg_catalog.make_interval(months => i), 'YYYY-MM');
    perform consumer_review.refresh_month(v_user, v_binding.binding_version, v_binding.timezone, v_month);
    select * into v_row from consumer_review.monthly_nutrition_reviews where user_id = v_user and month_key = v_month;
    v_months := v_months || case when found then consumer_review.month_json(v_row, v_month = v_current)
      else pg_catalog.jsonb_build_object('monthKey', v_month, 'hasRecords', false, 'inProgress', v_month = v_current) end;
  end loop;
  return pg_catalog.jsonb_build_object(
    'status', 'ok', 'calculationVersion', 'consumer-monthly-review-v1', 'currentMonth', v_current,
    'reportTimezone', pg_catalog.jsonb_build_object('timezone', v_binding.timezone, 'bindingVersion', v_binding.binding_version, 'source', v_binding.source),
    'window', pg_catalog.jsonb_build_object('scope', 'latest_six_months_interface', 'entitlementWiring', 'not_implemented'),
    'score', null, 'months', v_months);
end $$;

revoke all on function public.get_current_user_monthly_nutrition_review() from public, anon, authenticated, authenticator, service_role;
grant execute on function public.get_current_user_monthly_nutrition_review() to authenticated;
