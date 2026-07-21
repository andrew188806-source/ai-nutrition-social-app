-- Phase 2Z-B3-C1 forward-only correction.
-- PLANNED_MEAL_VERSION_CONFLICT is a deterministic business conflict, not a
-- PostgreSQL serialization failure. The only functional change from Migration
-- 39 is SQLSTATE 40001 -> P0001 on the three version checks below.

create or replace function public.update_authenticated_planned_meal_v2(p_planned_meal_id uuid, p_expected_updated_at timestamptz, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp
as $$
declare v_actor uuid := auth.uid(); v_row public.planned_meals%rowtype; v_time time; v_type public.meal_type; v_nutrition jsonb;
begin
  if v_actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  if p_planned_meal_id is null or p_expected_updated_at is null or p_patch is null or pg_catalog.jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    raise exception 'INVALID_UPDATE_REQUEST' using errcode = '22023';
  end if;
  if p_patch - array['plannedFor','plannedLocalTime','plannedTimezone','mealType','mealCategory','title','restaurantNameSnapshot','note','restaurantId','branchId','menuItemId','nutritionSnapshot']::text[] <> '{}'::jsonb then
    raise exception 'UNKNOWN_UPDATE_PATCH_KEY' using errcode = '22023';
  end if;
  select * into v_row from public.planned_meals where id = p_planned_meal_id and user_id = v_actor for update;
  if not found then raise exception 'PLANNED_MEAL_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_row.status <> 'planned' then raise exception 'PLANNED_MEAL_NOT_PLANNED' using errcode = 'P0001'; end if;
  if v_row.updated_at is distinct from p_expected_updated_at then raise exception 'PLANNED_MEAL_VERSION_CONFLICT' using errcode = 'P0001'; end if;
  begin
    if p_patch ? 'plannedLocalTime' then v_time := case when p_patch -> 'plannedLocalTime' = 'null'::jsonb then null else (p_patch ->> 'plannedLocalTime')::time end; else v_time := v_row.planned_local_time; end if;
    if p_patch ? 'mealType' then v_type := (p_patch ->> 'mealType')::public.meal_type; else v_type := v_row.meal_type; end if;
  exception when others then raise exception 'INVALID_UPDATE_PATCH_VALUE' using errcode = '22023'; end;
  v_nutrition := case when p_patch ? 'nutritionSnapshot' then public._consumer_planned_meal_v2_nutrition(p_patch -> 'nutritionSnapshot') else v_row.planned_nutrition_snapshot end;
  v_row.planned_for := case when p_patch ? 'plannedFor' then (p_patch ->> 'plannedFor')::date else v_row.planned_for end;
  v_row.planned_local_time := v_time;
  v_row.planned_timezone := case when p_patch ? 'plannedTimezone' then nullif(pg_catalog.btrim(p_patch ->> 'plannedTimezone'), '') else v_row.planned_timezone end;
  v_row.meal_type := v_type;
  v_row.meal_category := case when p_patch ? 'mealCategory' then nullif(pg_catalog.btrim(p_patch ->> 'mealCategory'), '') else v_row.meal_category end;
  v_row.display_name_snapshot := case when p_patch ? 'title' then pg_catalog.btrim(p_patch ->> 'title') else v_row.display_name_snapshot end;
  v_row.restaurant_name_snapshot := case when p_patch ? 'restaurantNameSnapshot' then nullif(pg_catalog.btrim(p_patch ->> 'restaurantNameSnapshot'), '') else v_row.restaurant_name_snapshot end;
  v_row.note := case when p_patch ? 'note' then nullif(pg_catalog.btrim(p_patch ->> 'note'), '') else v_row.note end;
  v_row.restaurant_id := case when p_patch ? 'restaurantId' then nullif(pg_catalog.btrim(p_patch ->> 'restaurantId'), '') else v_row.restaurant_id end;
  v_row.branch_id := case when p_patch ? 'branchId' then nullif(pg_catalog.btrim(p_patch ->> 'branchId'), '') else v_row.branch_id end;
  v_row.menu_item_id := case when p_patch ? 'menuItemId' then nullif(pg_catalog.btrim(p_patch ->> 'menuItemId'), '') else v_row.menu_item_id end;
  v_row.planned_nutrition_snapshot := v_nutrition;
  if v_row.planned_for is null or v_row.planned_timezone is null or v_row.meal_type is null or v_row.display_name_snapshot is null or
     not exists (select 1 from pg_catalog.pg_timezone_names where name = v_row.planned_timezone) or
     pg_catalog.length(v_row.display_name_snapshot) not between 1 and 500 or pg_catalog.length(coalesce(v_row.meal_category, '')) > 100 or
     pg_catalog.length(coalesce(v_row.restaurant_name_snapshot, '')) > 500 or pg_catalog.length(coalesce(v_row.note, '')) > 2000 or
     pg_catalog.length(coalesce(v_row.restaurant_id, '')) > 200 or pg_catalog.length(coalesce(v_row.branch_id, '')) > 200 or
     pg_catalog.length(coalesce(v_row.menu_item_id, '')) > 200 then
    raise exception 'INVALID_RESULTING_PLANNED_MEAL' using errcode = '22023';
  end if;
  update public.planned_meals set planned_for=v_row.planned_for, planned_local_time=v_row.planned_local_time, planned_timezone=v_row.planned_timezone,
    meal_type=v_row.meal_type, meal_category=v_row.meal_category, display_name_snapshot=v_row.display_name_snapshot,
    restaurant_name_snapshot=v_row.restaurant_name_snapshot, note=v_row.note, restaurant_id=v_row.restaurant_id,
    branch_id=v_row.branch_id, menu_item_id=v_row.menu_item_id, planned_nutrition_snapshot=v_row.planned_nutrition_snapshot,
    updated_at=pg_catalog.transaction_timestamp()
  where id=v_row.id and user_id=v_actor returning * into v_row;
  return public._consumer_planned_meal_v2_public_row(v_row, false);
end;
$$;

create or replace function public.cancel_authenticated_planned_meal_v2(p_planned_meal_id uuid, p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp
as $$
declare v_actor uuid := auth.uid(); v_row public.planned_meals%rowtype;
begin
  if v_actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  if p_planned_meal_id is null or p_expected_updated_at is null then raise exception 'INVALID_CANCEL_REQUEST' using errcode = '22023'; end if;
  select * into v_row from public.planned_meals where id=p_planned_meal_id and user_id=v_actor for update;
  if not found then raise exception 'PLANNED_MEAL_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_row.status = 'cancelled' then return public._consumer_planned_meal_v2_public_row(v_row, true); end if;
  if v_row.status = 'converted' then raise exception 'PLANNED_MEAL_ALREADY_CONVERTED' using errcode = 'P0001'; end if;
  if v_row.status = 'expired' then raise exception 'PLANNED_MEAL_EXPIRED' using errcode = 'P0001'; end if;
  if v_row.updated_at is distinct from p_expected_updated_at then raise exception 'PLANNED_MEAL_VERSION_CONFLICT' using errcode = 'P0001'; end if;
  update public.planned_meals set status='cancelled', updated_at=pg_catalog.transaction_timestamp() where id=v_row.id and user_id=v_actor returning * into v_row;
  return public._consumer_planned_meal_v2_public_row(v_row, false);
end;
$$;

create or replace function public.convert_authenticated_planned_meal_v2(
  p_planned_meal_id uuid, p_conversion_idempotency_key uuid, p_expected_updated_at timestamptz,
  p_confirmation_timestamp timestamptz, p_actor_timezone text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_actor uuid := auth.uid(); v_row public.planned_meals%rowtype; v_fingerprint jsonb; v_created jsonb;
  v_meal_id uuid; v_converted_at timestamptz; v_timezone text := nullif(pg_catalog.btrim(p_actor_timezone), '');
begin
  if v_actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  if p_planned_meal_id is null or p_conversion_idempotency_key is null or p_expected_updated_at is null or p_confirmation_timestamp is null or
     p_conversion_idempotency_key::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or
     v_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name=v_timezone) then
    raise exception 'INVALID_CONVERSION_REQUEST' using errcode = '22023';
  end if;
  select * into v_row from public.planned_meals where id=p_planned_meal_id and user_id=v_actor for update;
  if not found then raise exception 'PLANNED_MEAL_NOT_FOUND' using errcode = 'P0002'; end if;
  v_fingerprint := pg_catalog.jsonb_build_object(
    'plannedMealId', v_row.id, 'plannedFor', v_row.planned_for, 'plannedLocalTime', v_row.planned_local_time,
    'plannedTimezone', v_row.planned_timezone, 'mealType', v_row.meal_type::text, 'mealCategory', v_row.meal_category,
    'title', v_row.display_name_snapshot, 'restaurantNameSnapshot', v_row.restaurant_name_snapshot,
    'note', v_row.note, 'restaurantId', v_row.restaurant_id, 'branchId', v_row.branch_id, 'menuItemId', v_row.menu_item_id,
    'nutritionSnapshot', v_row.planned_nutrition_snapshot, 'expectedUpdatedAt', p_expected_updated_at,
    'confirmationTimestamp', p_confirmation_timestamp, 'actorTimezone', v_timezone
  );
  if v_row.conversion_idempotency_key = p_conversion_idempotency_key::text then
    if v_row.conversion_request_fingerprint is distinct from v_fingerprint then raise exception 'PLANNED_MEAL_CONVERSION_IDEMPOTENCY_CONFLICT' using errcode = '23505'; end if;
    return pg_catalog.jsonb_build_object('planned_meal_id',v_row.id,'status',v_row.status,'meal_record_id',v_row.converted_meal_record_id,'converted_at',v_row.converted_at,'replayed',true);
  end if;
  if v_row.status='converted' then raise exception 'PLANNED_MEAL_ALREADY_CONVERTED' using errcode='P0001'; end if;
  if v_row.status='cancelled' then raise exception 'PLANNED_MEAL_CANCELLED' using errcode='P0001'; end if;
  if v_row.status='expired' then raise exception 'PLANNED_MEAL_EXPIRED' using errcode='P0001'; end if;
  if v_row.updated_at is distinct from p_expected_updated_at then raise exception 'PLANNED_MEAL_VERSION_CONFLICT' using errcode='P0001'; end if;
  v_created := public.create_current_user_meal_record_v2(
    p_meal_type => v_row.meal_type, p_occurred_at => p_confirmation_timestamp,
    p_meal_date => (p_confirmation_timestamp at time zone v_timezone)::date,
    p_client_request_id => p_conversion_idempotency_key, p_timezone => v_timezone,
    p_title => v_row.display_name_snapshot, p_note => null, p_source => 'manual'::public.meal_source_type,
    p_items => pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'restaurantId',v_row.restaurant_id,'branchId',v_row.branch_id,'menuId',null,'menuItemId',v_row.menu_item_id,
      'displayName',v_row.display_name_snapshot,'userEnteredName',null,'aiDetectedName',null,'normalizedName',null,
      'portion',null,'nutrition',v_row.planned_nutrition_snapshot,'nutritionSource','ai_estimated',
      'sourceEntityVersion',null,'confidenceScore',null,'consumedRatio',1
    ))
  );
  v_meal_id := (v_created ->> 'id')::uuid; v_converted_at := pg_catalog.transaction_timestamp();
  update public.planned_meals set status='converted', converted_meal_record_id=v_meal_id,
    conversion_idempotency_key=p_conversion_idempotency_key::text, conversion_request_fingerprint=v_fingerprint,
    converted_at=v_converted_at, updated_at=v_converted_at where id=v_row.id and user_id=v_actor returning * into v_row;
  return pg_catalog.jsonb_build_object('planned_meal_id',v_row.id,'status',v_row.status,'meal_record_id',v_row.converted_meal_record_id,'converted_at',v_row.converted_at,'replayed',false);
end;
$$;

alter function public.update_authenticated_planned_meal_v2(uuid,timestamptz,jsonb) owner to postgres;
alter function public.cancel_authenticated_planned_meal_v2(uuid,timestamptz) owner to postgres;
alter function public.convert_authenticated_planned_meal_v2(uuid,uuid,timestamptz,timestamptz,text) owner to postgres;

revoke all on function public.update_authenticated_planned_meal_v2(uuid,timestamptz,jsonb) from public, anon;
revoke all on function public.cancel_authenticated_planned_meal_v2(uuid,timestamptz) from public, anon;
revoke all on function public.convert_authenticated_planned_meal_v2(uuid,uuid,timestamptz,timestamptz,text) from public, anon;

grant execute on function public.update_authenticated_planned_meal_v2(uuid,timestamptz,jsonb) to authenticated;
grant execute on function public.cancel_authenticated_planned_meal_v2(uuid,timestamptz) to authenticated;
grant execute on function public.convert_authenticated_planned_meal_v2(uuid,uuid,timestamptz,timestamptz,text) to authenticated;

revoke insert, update, delete on table public.planned_meals from public, anon, authenticated;
