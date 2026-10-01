-- PC-2 gates: exact predecessor functions retain their validation, ownership, idempotency and algorithms.
begin;
create function consumer_internal.core_write_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then
 -- Preserve the pre-existing Auth deletion FK cascade; absent owners cannot request core operations.
 if not exists(select 1 from auth.users where id=old.user_id) then return old; end if;
 perform consumer_internal.require_core(old.user_id); return old; end if;
 perform consumer_internal.require_core(new.user_id);
 if TG_OP='UPDATE' and new.user_id<>old.user_id then raise exception 'OWNER_IMMUTABLE' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function consumer_internal.core_write_guard() from public,anon,authenticated,authenticator,service_role;
create policy pc2_core_access on public.consumer_preferences as restrictive to authenticated using(public.consumer_core_eligible()) with check(public.consumer_core_eligible());
create trigger pc2_core_write before insert or update or delete on public.consumer_preferences for each row execute function consumer_internal.core_write_guard();
create policy pc2_core_access on public.taste_profiles as restrictive to authenticated using(public.consumer_core_eligible()) with check(public.consumer_core_eligible());
create trigger pc2_core_write before insert or update or delete on public.taste_profiles for each row execute function consumer_internal.core_write_guard();
create policy pc2_core_access on public.dietary_restrictions as restrictive to authenticated using(public.consumer_core_eligible()) with check(public.consumer_core_eligible());
create trigger pc2_core_write before insert or update or delete on public.dietary_restrictions for each row execute function consumer_internal.core_write_guard();
create policy pc2_core_access on public.nutrition_goals as restrictive to authenticated using(public.consumer_core_eligible()) with check(public.consumer_core_eligible());
create trigger pc2_core_write before insert or update or delete on public.nutrition_goals for each row execute function consumer_internal.core_write_guard();
create policy pc2_core_access on public.subscription_entitlements as restrictive to authenticated using(public.consumer_core_eligible()) with check(public.consumer_core_eligible());
create trigger pc2_core_write before insert or update or delete on public.subscription_entitlements for each row execute function consumer_internal.core_write_guard();
create policy pc2_core_access on public.meal_records as restrictive to authenticated using(public.consumer_core_eligible()) with check(public.consumer_core_eligible());
create trigger pc2_core_write before insert or update or delete on public.meal_records for each row execute function consumer_internal.core_write_guard();
create policy pc2_core_access on public.meal_record_items as restrictive to authenticated using(public.consumer_core_eligible()) with check(public.consumer_core_eligible());
create trigger pc2_core_write before insert or update or delete on public.meal_record_items for each row execute function consumer_internal.core_write_guard();
create policy pc2_core_access on public.meal_analyses as restrictive to authenticated using(public.consumer_core_eligible()) with check(public.consumer_core_eligible());
create trigger pc2_core_write before insert or update or delete on public.meal_analyses for each row execute function consumer_internal.core_write_guard();
create policy pc2_core_access on public.meal_corrections as restrictive to authenticated using(public.consumer_core_eligible()) with check(public.consumer_core_eligible());
create trigger pc2_core_write before insert or update or delete on public.meal_corrections for each row execute function consumer_internal.core_write_guard();
create policy pc2_core_access on public.meal_consumption_adjustments as restrictive to authenticated using(public.consumer_core_eligible()) with check(public.consumer_core_eligible());
create trigger pc2_core_write before insert or update or delete on public.meal_consumption_adjustments for each row execute function consumer_internal.core_write_guard();
create policy pc2_core_access on public.meal_sharing_allocations as restrictive to authenticated using(public.consumer_core_eligible()) with check(public.consumer_core_eligible());
create trigger pc2_core_write before insert or update or delete on public.meal_sharing_allocations for each row execute function consumer_internal.core_write_guard();
create policy pc2_core_access on public.planned_meals as restrictive to authenticated using(public.consumer_core_eligible()) with check(public.consumer_core_eligible());
create trigger pc2_core_write before insert or update or delete on public.planned_meals for each row execute function consumer_internal.core_write_guard();
create policy pc2_core_access on public.daily_nutrition_summaries as restrictive to authenticated using(public.consumer_core_eligible()) with check(public.consumer_core_eligible());
create trigger pc2_core_write before insert or update or delete on public.daily_nutrition_summaries for each row execute function consumer_internal.core_write_guard();
create policy pc2_core_access on public.user_restaurant_ratings as restrictive to authenticated using(public.consumer_core_eligible()) with check(public.consumer_core_eligible());
create trigger pc2_core_write before insert or update or delete on public.user_restaurant_ratings for each row execute function consumer_internal.core_write_guard();
create policy pc2_core_access on public.user_menu_item_ratings as restrictive to authenticated using(public.consumer_core_eligible()) with check(public.consumer_core_eligible());
create trigger pc2_core_write before insert or update or delete on public.user_menu_item_ratings for each row execute function consumer_internal.core_write_guard();
create policy pc2_core_access on public.favorite_restaurants as restrictive to authenticated using(public.consumer_core_eligible()) with check(public.consumer_core_eligible());
create trigger pc2_core_write before insert or update or delete on public.favorite_restaurants for each row execute function consumer_internal.core_write_guard();
create policy pc2_core_access on public.favorite_menu_items as restrictive to authenticated using(public.consumer_core_eligible()) with check(public.consumer_core_eligible());
create trigger pc2_core_write before insert or update or delete on public.favorite_menu_items for each row execute function consumer_internal.core_write_guard();
create policy pc2_core_access on public.recommendation_sessions as restrictive to authenticated using(public.consumer_core_eligible()) with check(public.consumer_core_eligible());
create trigger pc2_core_write before insert or update or delete on public.recommendation_sessions for each row execute function consumer_internal.core_write_guard();
create policy pc2_core_access on public.recommendation_feedback as restrictive to authenticated using(public.consumer_core_eligible()) with check(public.consumer_core_eligible());
create trigger pc2_core_write before insert or update or delete on public.recommendation_feedback for each row execute function consumer_internal.core_write_guard();
create policy pc2_owned_card_core_access on public.meal_buddy_cards as restrictive for select to authenticated using(public.consumer_core_eligible());
create policy pc2_photo_access on storage.objects as restrictive to authenticated
 using(bucket_id<>'meal-analysis-photos' or public.consumer_core_eligible())
 with check(bucket_id<>'meal-analysis-photos' or public.consumer_core_eligible());

-- Exact core RPC: add_authenticated_menu_item_favorite(p_restaurant_id text, p_menu_item_id text)
CREATE OR REPLACE FUNCTION public.add_authenticated_menu_item_favorite(p_restaurant_id text, p_menu_item_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_restaurant_id text := nullif(pg_catalog.btrim(p_restaurant_id), '');
  v_menu_item_id text := nullif(pg_catalog.btrim(p_menu_item_id), '');
  v_row public.favorite_menu_items%rowtype;
begin
  perform consumer_internal.require_core(auth.uid());
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;
  if v_restaurant_id is null then
    raise exception 'FAVORITE_RESTAURANT_ID_REQUIRED' using errcode = '22023';
  end if;
  if v_menu_item_id is null then
    raise exception 'FAVORITE_MENU_ITEM_ID_REQUIRED' using errcode = '22023';
  end if;

  perform 1
  from public.restaurants as r
  where r.id = v_restaurant_id
  for key share;
  if not found then
    raise exception 'FAVORITE_RESTAURANT_NOT_FOUND' using errcode = '22023';
  end if;

  perform 1
  from public.menu_items as mi
  where mi.id = v_menu_item_id
    and mi.restaurant_id = v_restaurant_id
  for key share;
  if not found then
    raise exception 'FAVORITE_MENU_ITEM_PARENT_MISMATCH' using errcode = '22023';
  end if;

  -- The active unique index is keyed by owner/menu item, so the lock uses that key.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':favorite_menu_item:' || v_menu_item_id, 0)
  );

  select fmi.*
  into v_row
  from public.favorite_menu_items as fmi
  where fmi.user_id = v_user_id
    and fmi.menu_item_id = v_menu_item_id
    and fmi.removed_at is null;

  if v_row.id is not null then
    if v_row.restaurant_id <> v_restaurant_id then
      raise exception 'FAVORITE_MENU_ITEM_ACTIVE_PARENT_CONFLICT' using errcode = '22023';
    end if;
    return pg_catalog.jsonb_build_object(
      'status', 'already_present',
      'target_kind', 'menu_item',
      'restaurant_id', v_row.restaurant_id,
      'menu_item_id', v_row.menu_item_id,
      'favorite_id', v_row.id,
      'collection_label', v_row.collection_label,
      'sort_order', v_row.sort_order,
      'created_at', v_row.created_at,
      'active', true
    );
  end if;

  insert into public.favorite_menu_items (user_id, restaurant_id, menu_item_id)
  values (v_user_id, v_restaurant_id, v_menu_item_id)
  on conflict (user_id, menu_item_id) where removed_at is null do nothing
  returning * into v_row;

  if v_row.id is null then
    select fmi.*
    into v_row
    from public.favorite_menu_items as fmi
    where fmi.user_id = v_user_id
      and fmi.menu_item_id = v_menu_item_id
      and fmi.removed_at is null;
    if v_row.id is null then
      raise exception 'FAVORITE_ACTIVE_ROW_CONFLICT' using errcode = '40001';
    end if;
    if v_row.restaurant_id <> v_restaurant_id then
      raise exception 'FAVORITE_MENU_ITEM_ACTIVE_PARENT_CONFLICT' using errcode = '22023';
    end if;
    return pg_catalog.jsonb_build_object(
      'status', 'already_present',
      'target_kind', 'menu_item',
      'restaurant_id', v_row.restaurant_id,
      'menu_item_id', v_row.menu_item_id,
      'favorite_id', v_row.id,
      'collection_label', v_row.collection_label,
      'sort_order', v_row.sort_order,
      'created_at', v_row.created_at,
      'active', true
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'added',
    'target_kind', 'menu_item',
    'restaurant_id', v_row.restaurant_id,
    'menu_item_id', v_row.menu_item_id,
    'favorite_id', v_row.id,
    'collection_label', v_row.collection_label,
    'sort_order', v_row.sort_order,
    'created_at', v_row.created_at,
    'active', true
  );
end;
$function$
;

-- Exact core RPC: add_authenticated_restaurant_favorite(p_restaurant_id text)
CREATE OR REPLACE FUNCTION public.add_authenticated_restaurant_favorite(p_restaurant_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_restaurant_id text := nullif(pg_catalog.btrim(p_restaurant_id), '');
  v_row public.favorite_restaurants%rowtype;
begin
  perform consumer_internal.require_core(auth.uid());
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;
  if v_restaurant_id is null then
    raise exception 'FAVORITE_RESTAURANT_ID_REQUIRED' using errcode = '22023';
  end if;

  perform 1
  from public.restaurants as r
  where r.id = v_restaurant_id
  for key share;
  if not found then
    raise exception 'FAVORITE_RESTAURANT_NOT_FOUND' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':favorite_restaurant:' || v_restaurant_id, 0)
  );

  select fr.*
  into v_row
  from public.favorite_restaurants as fr
  where fr.user_id = v_user_id
    and fr.restaurant_id = v_restaurant_id
    and fr.removed_at is null;

  if v_row.id is not null then
    return pg_catalog.jsonb_build_object(
      'status', 'already_present',
      'target_kind', 'restaurant',
      'restaurant_id', v_row.restaurant_id,
      'favorite_id', v_row.id,
      'collection_label', v_row.collection_label,
      'sort_order', v_row.sort_order,
      'created_at', v_row.created_at,
      'active', true
    );
  end if;

  insert into public.favorite_restaurants (user_id, restaurant_id)
  values (v_user_id, v_restaurant_id)
  on conflict (user_id, restaurant_id) where removed_at is null do nothing
  returning * into v_row;

  if v_row.id is null then
    select fr.*
    into v_row
    from public.favorite_restaurants as fr
    where fr.user_id = v_user_id
      and fr.restaurant_id = v_restaurant_id
      and fr.removed_at is null;
    if v_row.id is null then
      raise exception 'FAVORITE_ACTIVE_ROW_CONFLICT' using errcode = '40001';
    end if;
    return pg_catalog.jsonb_build_object(
      'status', 'already_present',
      'target_kind', 'restaurant',
      'restaurant_id', v_row.restaurant_id,
      'favorite_id', v_row.id,
      'collection_label', v_row.collection_label,
      'sort_order', v_row.sort_order,
      'created_at', v_row.created_at,
      'active', true
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'added',
    'target_kind', 'restaurant',
    'restaurant_id', v_row.restaurant_id,
    'favorite_id', v_row.id,
    'collection_label', v_row.collection_label,
    'sort_order', v_row.sort_order,
    'created_at', v_row.created_at,
    'active', true
  );
end;
$function$
;

-- Exact core RPC: cancel_authenticated_planned_meal_v2(p_planned_meal_id uuid, p_expected_updated_at timestamp with time zone)
CREATE OR REPLACE FUNCTION public.cancel_authenticated_planned_meal_v2(p_planned_meal_id uuid, p_expected_updated_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid := auth.uid(); v_row public.planned_meals%rowtype;
begin
  perform consumer_internal.require_core(auth.uid());
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
$function$
;

-- Exact core RPC: convert_authenticated_planned_meal_v2(p_planned_meal_id uuid, p_conversion_idempotency_key uuid, p_expected_updated_at timestamp with time zone, p_confirmation_timestamp timestamp with time zone, p_actor_timezone text)
CREATE OR REPLACE FUNCTION public.convert_authenticated_planned_meal_v2(p_planned_meal_id uuid, p_conversion_idempotency_key uuid, p_expected_updated_at timestamp with time zone, p_confirmation_timestamp timestamp with time zone, p_actor_timezone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid(); v_row public.planned_meals%rowtype; v_fingerprint jsonb; v_created jsonb;
  v_meal_id uuid; v_converted_at timestamptz; v_timezone text := nullif(pg_catalog.btrim(p_actor_timezone), '');
begin
  perform consumer_internal.require_core(auth.uid());
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
$function$
;

-- Exact core RPC: create_authenticated_planned_meal_v2(p_create_client_request_id uuid, p_planned_for date, p_planned_timezone text, p_meal_type meal_type, p_display_name_snapshot text, p_planned_nutrition_snapshot jsonb, p_planned_local_time time without time zone, p_meal_category text, p_restaurant_name_snapshot text, p_note text, p_restaurant_id text, p_branch_id text, p_menu_item_id text)
CREATE OR REPLACE FUNCTION public.create_authenticated_planned_meal_v2(p_create_client_request_id uuid, p_planned_for date, p_planned_timezone text, p_meal_type meal_type, p_display_name_snapshot text, p_planned_nutrition_snapshot jsonb, p_planned_local_time time without time zone DEFAULT NULL::time without time zone, p_meal_category text DEFAULT NULL::text, p_restaurant_name_snapshot text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_restaurant_id text DEFAULT NULL::text, p_branch_id text DEFAULT NULL::text, p_menu_item_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid(); v_fingerprint jsonb; v_existing public.planned_meals%rowtype;
  v_row public.planned_meals%rowtype; v_nutrition jsonb; v_timezone text := nullif(pg_catalog.btrim(p_planned_timezone), '');
begin
  perform consumer_internal.require_core(auth.uid());
  if v_actor is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000'; end if;
  if p_create_client_request_id is null or p_create_client_request_id::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'INVALID_CREATE_CLIENT_REQUEST_ID' using errcode = '22023';
  end if;
  if p_planned_for is null or v_timezone is null or not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    raise exception 'INVALID_PLANNED_TEMPORAL_CONTRACT' using errcode = '22023';
  end if;
  if p_meal_type is null or pg_catalog.length(pg_catalog.btrim(p_display_name_snapshot)) not between 1 and 500 then
    raise exception 'INVALID_PLANNED_MEAL_CANONICAL_FIELDS' using errcode = '22023';
  end if;
  if pg_catalog.length(pg_catalog.btrim(coalesce(p_meal_category, ''))) > 100 or
     pg_catalog.length(pg_catalog.btrim(coalesce(p_restaurant_name_snapshot, ''))) > 500 or
     pg_catalog.length(pg_catalog.btrim(coalesce(p_note, ''))) > 2000 or
     pg_catalog.length(pg_catalog.btrim(coalesce(p_restaurant_id, ''))) > 200 or
     pg_catalog.length(pg_catalog.btrim(coalesce(p_branch_id, ''))) > 200 or
     pg_catalog.length(pg_catalog.btrim(coalesce(p_menu_item_id, ''))) > 200 then
    raise exception 'INVALID_PLANNED_MEAL_TEXT' using errcode = '22023';
  end if;
  v_nutrition := public._consumer_planned_meal_v2_nutrition(p_planned_nutrition_snapshot);
  v_fingerprint := pg_catalog.jsonb_build_object(
    'plannedFor', p_planned_for, 'plannedLocalTime', p_planned_local_time, 'plannedTimezone', v_timezone,
    'mealType', p_meal_type::text, 'mealCategory', nullif(pg_catalog.btrim(p_meal_category), ''),
    'title', pg_catalog.btrim(p_display_name_snapshot), 'restaurantNameSnapshot', nullif(pg_catalog.btrim(p_restaurant_name_snapshot), ''),
    'note', nullif(pg_catalog.btrim(p_note), ''), 'restaurantId', nullif(pg_catalog.btrim(p_restaurant_id), ''),
    'branchId', nullif(pg_catalog.btrim(p_branch_id), ''), 'menuItemId', nullif(pg_catalog.btrim(p_menu_item_id), ''),
    'nutritionSnapshot', v_nutrition
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_actor::text || ':' || p_create_client_request_id::text, 0));
  select * into v_existing from public.planned_meals where user_id = v_actor and create_client_request_id = p_create_client_request_id;
  if found then
    if v_existing.create_request_fingerprint is distinct from v_fingerprint then
      raise exception 'PLANNED_MEAL_CREATE_IDEMPOTENCY_CONFLICT' using errcode = '23505';
    end if;
    return public._consumer_planned_meal_v2_public_row(v_existing, true);
  end if;
  insert into public.planned_meals (
    user_id, planned_for, planned_local_time, planned_timezone, meal_type, meal_category,
    restaurant_id, branch_id, menu_item_id, display_name_snapshot, restaurant_name_snapshot,
    planned_nutrition_snapshot, status, note, create_client_request_id, create_request_fingerprint
  ) values (
    v_actor, p_planned_for, p_planned_local_time, v_timezone, p_meal_type, nullif(pg_catalog.btrim(p_meal_category), ''),
    nullif(pg_catalog.btrim(p_restaurant_id), ''), nullif(pg_catalog.btrim(p_branch_id), ''), nullif(pg_catalog.btrim(p_menu_item_id), ''),
    pg_catalog.btrim(p_display_name_snapshot), nullif(pg_catalog.btrim(p_restaurant_name_snapshot), ''),
    v_nutrition, 'planned', nullif(pg_catalog.btrim(p_note), ''), p_create_client_request_id, v_fingerprint
  ) returning * into v_row;
  return public._consumer_planned_meal_v2_public_row(v_row, false);
end;
$function$
;

-- Exact core RPC: create_authenticated_recommendation_session(p_session_id uuid, p_source_surface text, p_model_version text)
CREATE OR REPLACE FUNCTION public.create_authenticated_recommendation_session(p_session_id uuid, p_source_surface text, p_model_version text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id        uuid    := auth.uid();
  v_source_surface text;
  v_model_version  text;
  v_existing       public.recommendation_sessions%rowtype;
  v_new            public.recommendation_sessions%rowtype;
begin
  perform consumer_internal.require_core(auth.uid());
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  -- Sanitize source_surface: trim, nonempty, bounded length, no control characters.
  v_source_surface := pg_catalog.btrim(p_source_surface);
  if v_source_surface is null or v_source_surface = '' then
    raise exception 'SESSION_SOURCE_SURFACE_REQUIRED' using errcode = '22023';
  end if;
  if pg_catalog.length(v_source_surface) > 200 then
    raise exception 'SESSION_SOURCE_SURFACE_TOO_LONG' using errcode = '22023';
  end if;
  if v_source_surface ~ E'[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]' then
    raise exception 'SESSION_SOURCE_SURFACE_INVALID_CHARACTERS' using errcode = '22023';
  end if;

  -- Sanitize model_version: optional; trim, bounded length, no control characters.
  if p_model_version is not null then
    v_model_version := pg_catalog.btrim(p_model_version);
    if v_model_version = '' then
      v_model_version := null;
    elsif pg_catalog.length(v_model_version) > 200 then
      raise exception 'SESSION_MODEL_VERSION_TOO_LONG' using errcode = '22023';
    elsif v_model_version ~ E'[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]' then
      raise exception 'SESSION_MODEL_VERSION_INVALID_CHARACTERS' using errcode = '22023';
    end if;
  end if;

  -- Attempt insert; PK convergence handles concurrent creates with the same session_id.
  insert into public.recommendation_sessions (
    id, user_id, source_surface, context_snapshot, model_version, schema_version, started_at
  ) values (
    p_session_id, v_user_id, v_source_surface, '{}'::jsonb, v_model_version,
    'consumer-recommendation-v1', pg_catalog.clock_timestamp()
  )
  on conflict (id) do nothing
  returning * into v_new;

  if v_new.id is not null then
    return pg_catalog.jsonb_build_object(
      'status',     'created',
      'session_id', v_new.id,
      'started_at', v_new.started_at
    );
  end if;

  -- Conflict: session_id already exists. Check ownership before classifying.
  select * into v_existing
  from public.recommendation_sessions
  where id = p_session_id;

  -- Fail closed: foreign-actor UUID collision and same-actor payload conflict both raise
  -- SESSION_CREATE_CONFLICT. The public result for both cases is create_failed; no response
  -- field distinguishes "exists but belongs to another actor" from a general create failure.
  if v_existing.user_id is null or v_existing.user_id <> v_user_id then
    raise exception 'SESSION_CREATE_CONFLICT' using errcode = '22023';
  end if;

  -- Same actor: check immutable payload (source_surface + model_version).
  if v_existing.source_surface = v_source_surface
     and v_existing.model_version is not distinct from v_model_version then
    return pg_catalog.jsonb_build_object(
      'status',     'already_created',
      'session_id', v_existing.id
    );
  end if;

  -- Same actor, same session_id, different payload: generic create conflict.
  raise exception 'SESSION_CREATE_CONFLICT' using errcode = '22023';
end;
$function$
;

-- Exact core RPC: create_current_user_meal_record(p_meal_type meal_type, p_occurred_at timestamp with time zone, p_meal_date date, p_timezone text, p_title text, p_note text, p_source meal_source_type, p_items jsonb)
CREATE OR REPLACE FUNCTION public.create_current_user_meal_record(p_meal_type meal_type, p_occurred_at timestamp with time zone, p_meal_date date, p_timezone text DEFAULT 'Asia/Taipei'::text, p_title text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_source meal_source_type DEFAULT 'manual'::meal_source_type, p_items jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_record public.meal_records%rowtype;
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
  v_item jsonb;
  v_item_index integer := 0;
  v_item_count integer;
  v_unknown_key text;
  v_nutrition jsonb;
  v_nutrition_key text;
  v_display_name text;
  v_nutrition_source text;
  v_confidence_score numeric;
  v_consumed_ratio numeric;
  v_inserted_items jsonb;
begin
  perform consumer_internal.require_core(auth.uid());
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  if p_meal_type is null then
    raise exception 'MEAL_TYPE_REQUIRED' using errcode = '22023';
  end if;

  if p_occurred_at is null then
    raise exception 'OCCURRED_AT_REQUIRED' using errcode = '22023';
  end if;

  if p_meal_date is null then
    raise exception 'MEAL_DATE_REQUIRED' using errcode = '22023';
  end if;

  if coalesce(length(btrim(p_timezone)), 0) = 0 or length(btrim(p_timezone)) > 64 then
    raise exception 'INVALID_TIMEZONE' using errcode = '22023';
  end if;

  if p_title is not null and length(btrim(p_title)) > 140 then
    raise exception 'TITLE_TOO_LONG' using errcode = '22023';
  end if;

  if p_note is not null and length(btrim(p_note)) > 1000 then
    raise exception 'NOTE_TOO_LONG' using errcode = '22023';
  end if;

  if p_source is null then
    raise exception 'SOURCE_REQUIRED' using errcode = '22023';
  end if;

  if jsonb_typeof(v_items) <> 'array' then
    raise exception 'ITEMS_MUST_BE_ARRAY' using errcode = '22023';
  end if;

  v_item_count := jsonb_array_length(v_items);
  if v_item_count < 1 then
    raise exception 'ITEMS_REQUIRED' using errcode = '22023';
  end if;

  if v_item_count > 20 then
    raise exception 'TOO_MANY_ITEMS' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(v_items)
  loop
    v_item_index := v_item_index + 1;

    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'ITEM_MUST_BE_OBJECT' using errcode = '22023';
    end if;

    if v_item ?| array[
      'userId',
      'ownerId',
      'profileId',
      'externalUserId',
      'createdBy',
      'user_id',
      'owner_id',
      'profile_id',
      'id',
      'mealRecordId',
      'mealRecordItemId',
      'meal_record_id',
      'meal_record_item_id',
      'createdAt',
      'updatedAt',
      'deletedAt',
      'created_at',
      'updated_at',
      'deleted_at'
    ] then
      raise exception 'ITEM_FORBIDDEN_FIELD' using errcode = '22023';
    end if;

    select key into v_unknown_key
    from jsonb_object_keys(v_item) as key
    where key <> all(array[
      'restaurantId',
      'branchId',
      'menuId',
      'menuItemId',
      'displayName',
      'userEnteredName',
      'aiDetectedName',
      'normalizedName',
      'portion',
      'nutrition',
      'nutritionSource',
      'sourceEntityVersion',
      'confidenceScore',
      'consumedRatio'
    ])
    limit 1;

    if v_unknown_key is not null then
      raise exception 'ITEM_UNKNOWN_FIELD' using errcode = '22023';
    end if;

    if jsonb_typeof(v_item -> 'displayName') <> 'string' then
      raise exception 'DISPLAY_NAME_REQUIRED' using errcode = '22023';
    end if;

    v_display_name := btrim(v_item ->> 'displayName');
    if length(v_display_name) = 0 or length(v_display_name) > 160 then
      raise exception 'INVALID_DISPLAY_NAME' using errcode = '22023';
    end if;

    v_nutrition := coalesce(v_item -> 'nutrition', '{}'::jsonb);
    if jsonb_typeof(v_nutrition) <> 'object' then
      raise exception 'INVALID_NUTRITION' using errcode = '22023';
    end if;

    for v_nutrition_key in select key from jsonb_object_keys(v_nutrition) as key
    loop
      if v_nutrition_key not in ('calories', 'protein', 'carbohydrates', 'fat', 'fiber') then
        raise exception 'UNKNOWN_NUTRITION_FIELD' using errcode = '22023';
      end if;

      if jsonb_typeof(v_nutrition -> v_nutrition_key) not in ('number', 'null') then
        raise exception 'INVALID_NUTRITION_VALUE' using errcode = '22023';
      end if;

      if jsonb_typeof(v_nutrition -> v_nutrition_key) = 'number' and (v_nutrition ->> v_nutrition_key)::numeric < 0 then
        raise exception 'NEGATIVE_NUTRITION_VALUE' using errcode = '22023';
      end if;
    end loop;

    v_nutrition_source := coalesce(nullif(v_item ->> 'nutritionSource', ''), 'manual');
    if v_nutrition_source not in ('restaurant_verified', 'admin_verified', 'ai_estimated', 'user_corrected', 'manual') then
      raise exception 'INVALID_NUTRITION_SOURCE' using errcode = '22023';
    end if;

    if v_item ? 'confidenceScore' and jsonb_typeof(v_item -> 'confidenceScore') not in ('number', 'null') then
      raise exception 'INVALID_CONFIDENCE_SCORE' using errcode = '22023';
    end if;

    v_confidence_score := case
      when v_item ? 'confidenceScore' and jsonb_typeof(v_item -> 'confidenceScore') = 'number'
        then (v_item ->> 'confidenceScore')::numeric
      else null
    end;

    if v_confidence_score is not null and (v_confidence_score < 0 or v_confidence_score > 1) then
      raise exception 'INVALID_CONFIDENCE_SCORE' using errcode = '22023';
    end if;

    if v_item ? 'consumedRatio' and jsonb_typeof(v_item -> 'consumedRatio') not in ('number', 'null') then
      raise exception 'INVALID_CONSUMED_RATIO' using errcode = '22023';
    end if;

    v_consumed_ratio := case
      when v_item ? 'consumedRatio' and jsonb_typeof(v_item -> 'consumedRatio') = 'number'
        then (v_item ->> 'consumedRatio')::numeric
      else 1
    end;

    if v_consumed_ratio < 0 or v_consumed_ratio > 1 then
      raise exception 'INVALID_CONSUMED_RATIO' using errcode = '22023';
    end if;
  end loop;

  insert into public.meal_records (
    user_id,
    meal_type,
    occurred_at,
    meal_date,
    timezone,
    title,
    note,
    source
  )
  values (
    v_user_id,
    p_meal_type,
    p_occurred_at,
    p_meal_date,
    btrim(p_timezone),
    nullif(btrim(p_title), ''),
    nullif(btrim(p_note), ''),
    p_source
  )
  returning * into v_record;

  for v_item in select value from jsonb_array_elements(v_items)
  loop
    v_display_name := btrim(v_item ->> 'displayName');
    v_nutrition := coalesce(v_item -> 'nutrition', '{}'::jsonb);
    v_nutrition_source := coalesce(nullif(v_item ->> 'nutritionSource', ''), 'manual');
    v_confidence_score := case
      when v_item ? 'confidenceScore' and jsonb_typeof(v_item -> 'confidenceScore') = 'number'
        then (v_item ->> 'confidenceScore')::numeric
      else null
    end;
    v_consumed_ratio := case
      when v_item ? 'consumedRatio' and jsonb_typeof(v_item -> 'consumedRatio') = 'number'
        then (v_item ->> 'consumedRatio')::numeric
      else 1
    end;

    insert into public.meal_record_items (
      meal_record_id,
      user_id,
      restaurant_id,
      branch_id,
      menu_id,
      menu_item_id,
      display_name_snapshot,
      user_entered_name,
      ai_detected_name,
      normalized_name,
      portion_snapshot,
      nutrition_snapshot,
      nutrition_source,
      source_entity_version,
      occurred_at,
      timezone,
      confidence_score,
      consumed_ratio,
      correction_status
    )
    values (
      v_record.id,
      v_user_id,
      nullif(btrim(v_item ->> 'restaurantId'), ''),
      nullif(btrim(v_item ->> 'branchId'), ''),
      nullif(btrim(v_item ->> 'menuId'), ''),
      nullif(btrim(v_item ->> 'menuItemId'), ''),
      v_display_name,
      nullif(btrim(v_item ->> 'userEnteredName'), ''),
      nullif(btrim(v_item ->> 'aiDetectedName'), ''),
      nullif(btrim(v_item ->> 'normalizedName'), ''),
      nullif(btrim(v_item ->> 'portion'), ''),
      v_nutrition,
      v_nutrition_source::public.nutrition_source_type,
      nullif(btrim(v_item ->> 'sourceEntityVersion'), ''),
      v_record.occurred_at,
      v_record.timezone,
      v_confidence_score,
      v_consumed_ratio,
      'none'::public.meal_correction_status
    );
  end loop;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', item.id,
        'meal_record_id', item.meal_record_id,
        'user_id', item.user_id,
        'restaurant_id', item.restaurant_id,
        'branch_id', item.branch_id,
        'menu_id', item.menu_id,
        'menu_item_id', item.menu_item_id,
        'display_name_snapshot', item.display_name_snapshot,
        'user_entered_name', item.user_entered_name,
        'ai_detected_name', item.ai_detected_name,
        'normalized_name', item.normalized_name,
        'portion_snapshot', item.portion_snapshot,
        'nutrition_snapshot', item.nutrition_snapshot,
        'nutrition_source', item.nutrition_source,
        'nutrition_schema_version', item.nutrition_schema_version,
        'source_entity_version', item.source_entity_version,
        'occurred_at', item.occurred_at,
        'timezone', item.timezone,
        'confidence_score', item.confidence_score,
        'consumed_ratio', item.consumed_ratio,
        'correction_status', item.correction_status,
        'created_at', item.created_at,
        'updated_at', item.updated_at
      )
      order by item.created_at, item.id
    ),
    '[]'::jsonb
  )
  into v_inserted_items
  from public.meal_record_items item
  where item.meal_record_id = v_record.id;

  return jsonb_build_object(
    'id', v_record.id,
    'user_id', v_record.user_id,
    'meal_type', v_record.meal_type,
    'occurred_at', v_record.occurred_at,
    'meal_date', v_record.meal_date,
    'timezone', v_record.timezone,
    'title', v_record.title,
    'note', v_record.note,
    'source', v_record.source,
    'created_at', v_record.created_at,
    'updated_at', v_record.updated_at,
    'meal_record_items', v_inserted_items
  );
end;
$function$
;

-- Exact core RPC: create_current_user_meal_record_v2(p_meal_type meal_type, p_occurred_at timestamp with time zone, p_meal_date date, p_client_request_id uuid, p_timezone text, p_title text, p_note text, p_source meal_source_type, p_items jsonb)
CREATE OR REPLACE FUNCTION public.create_current_user_meal_record_v2(p_meal_type meal_type, p_occurred_at timestamp with time zone, p_meal_date date, p_client_request_id uuid, p_timezone text DEFAULT 'Asia/Taipei'::text, p_title text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_source meal_source_type DEFAULT 'manual'::meal_source_type, p_items jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
  v_fingerprint jsonb;
  v_existing public.meal_records%rowtype;
  v_created jsonb;
  v_created_id uuid;
  v_existing_items jsonb;
begin
  perform consumer_internal.require_core(auth.uid());
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  if p_client_request_id is null then
    raise exception 'CLIENT_REQUEST_ID_REQUIRED' using errcode = '22023';
  end if;

  -- The lock serializes one actor/request pair before the unique-index lookup/insert.
  -- Hash collisions can only serialize unrelated requests; they cannot merge identity.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_client_request_id::text, 0)
  );

  select pg_catalog.jsonb_build_object(
    'mealType', p_meal_type::text,
    'occurredAt', p_occurred_at,
    'mealDate', p_meal_date,
    'timezone', pg_catalog.btrim(p_timezone),
    'title', nullif(pg_catalog.btrim(p_title), ''),
    'note', nullif(pg_catalog.btrim(p_note), ''),
    'source', p_source::text,
    'items', coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'ordinal', source_item.ordinality,
          'restaurantId', nullif(pg_catalog.btrim(source_item.item ->> 'restaurantId'), ''),
          'branchId', nullif(pg_catalog.btrim(source_item.item ->> 'branchId'), ''),
          'menuId', nullif(pg_catalog.btrim(source_item.item ->> 'menuId'), ''),
          'menuItemId', nullif(pg_catalog.btrim(source_item.item ->> 'menuItemId'), ''),
          'displayName', pg_catalog.btrim(source_item.item ->> 'displayName'),
          'userEnteredName', nullif(pg_catalog.btrim(source_item.item ->> 'userEnteredName'), ''),
          'aiDetectedName', nullif(pg_catalog.btrim(source_item.item ->> 'aiDetectedName'), ''),
          'normalizedName', nullif(pg_catalog.btrim(source_item.item ->> 'normalizedName'), ''),
          'portion', nullif(pg_catalog.btrim(source_item.item ->> 'portion'), ''),
          'nutrition', pg_catalog.jsonb_build_object(
            'calories', source_item.item -> 'nutrition' -> 'calories',
            'protein', source_item.item -> 'nutrition' -> 'protein',
            'carbohydrates', source_item.item -> 'nutrition' -> 'carbohydrates',
            'fat', source_item.item -> 'nutrition' -> 'fat',
            'fiber', source_item.item -> 'nutrition' -> 'fiber'
          ),
          'nutritionSource', coalesce(nullif(source_item.item ->> 'nutritionSource', ''), 'manual'),
          'nutritionSchemaVersion', 'consumer-meal-v1',
          'sourceEntityVersion', nullif(pg_catalog.btrim(source_item.item ->> 'sourceEntityVersion'), ''),
          'occurredAt', p_occurred_at,
          'timezone', pg_catalog.btrim(p_timezone),
          'confidenceScore', source_item.item -> 'confidenceScore',
          'consumedRatio', coalesce(source_item.item -> 'consumedRatio', '1'::jsonb),
          'correctionStatus', 'none'
        )
        order by source_item.ordinality
      ),
      '[]'::jsonb
    )
  )
  into v_fingerprint
  from pg_catalog.jsonb_array_elements(v_items) with ordinality as source_item(item, ordinality);

  select *
  into v_existing
  from public.meal_records
  where user_id = v_user_id
    and client_request_id = p_client_request_id;

  if found then
    if v_existing.request_fingerprint is distinct from v_fingerprint then
      raise exception 'IDEMPOTENCY_KEY_CONFLICT' using errcode = '23505';
    end if;

    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', item.id,
          'meal_record_id', item.meal_record_id,
          'user_id', item.user_id,
          'restaurant_id', item.restaurant_id,
          'branch_id', item.branch_id,
          'menu_id', item.menu_id,
          'menu_item_id', item.menu_item_id,
          'display_name_snapshot', item.display_name_snapshot,
          'user_entered_name', item.user_entered_name,
          'ai_detected_name', item.ai_detected_name,
          'normalized_name', item.normalized_name,
          'portion_snapshot', item.portion_snapshot,
          'nutrition_snapshot', item.nutrition_snapshot,
          'nutrition_source', item.nutrition_source,
          'nutrition_schema_version', item.nutrition_schema_version,
          'source_entity_version', item.source_entity_version,
          'occurred_at', item.occurred_at,
          'timezone', item.timezone,
          'confidence_score', item.confidence_score,
          'consumed_ratio', item.consumed_ratio,
          'correction_status', item.correction_status,
          'created_at', item.created_at,
          'updated_at', item.updated_at
        ) order by item.created_at, item.id
      ),
      '[]'::jsonb
    )
    into v_existing_items
    from public.meal_record_items item
    where item.meal_record_id = v_existing.id;

    return pg_catalog.jsonb_build_object(
      'id', v_existing.id,
      'user_id', v_existing.user_id,
      'meal_type', v_existing.meal_type,
      'occurred_at', v_existing.occurred_at,
      'meal_date', v_existing.meal_date,
      'timezone', v_existing.timezone,
      'title', v_existing.title,
      'note', v_existing.note,
      'source', v_existing.source,
      'created_at', v_existing.created_at,
      'updated_at', v_existing.updated_at,
      'meal_record_items', v_existing_items
    );
  end if;

  -- V1 remains the single validation/insertion implementation. Any exception,
  -- including an item insert failure, rolls back both its inserts and this update.
  v_created := public.create_current_user_meal_record(
    p_meal_type,
    p_occurred_at,
    p_meal_date,
    p_timezone,
    p_title,
    p_note,
    p_source,
    v_items
  );
  v_created_id := (v_created ->> 'id')::uuid;

  update public.meal_records
  set client_request_id = p_client_request_id,
      request_fingerprint = v_fingerprint
  where id = v_created_id
    and user_id = v_user_id;

  if not found then
    raise exception 'CANONICAL_MEAL_RECORD_NOT_FOUND' using errcode = 'P0001';
  end if;

  return v_created;
end;
$function$
;

-- Exact core RPC: end_authenticated_recommendation_session(p_session_id uuid)
CREATE OR REPLACE FUNCTION public.end_authenticated_recommendation_session(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_session public.recommendation_sessions%rowtype;
begin
  perform consumer_internal.require_core(auth.uid());
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  -- CAS: set ended_at only when currently NULL (first-end wins, concurrent retry → already_ended).
  update public.recommendation_sessions
  set    ended_at = pg_catalog.clock_timestamp()
  where  id       = p_session_id
    and  user_id  = v_user_id
    and  ended_at is null
  returning * into v_session;

  if v_session.id is not null then
    return pg_catalog.jsonb_build_object(
      'status',     'ended',
      'session_id', v_session.id,
      'ended_at',   v_session.ended_at
    );
  end if;

  -- No rows updated: check ownership without leaking foreign session existence.
  select * into v_session
  from   public.recommendation_sessions
  where  id      = p_session_id
    and  user_id = v_user_id;

  if not found then
    return pg_catalog.jsonb_build_object('status', 'session_not_found');
  end if;

  -- Owned and already ended.
  return pg_catalog.jsonb_build_object(
    'status',     'already_ended',
    'session_id', v_session.id,
    'ended_at',   v_session.ended_at
  );
end;
$function$
;

-- Exact core RPC: finalize_current_user_meal_identification_v1(p_client_request_id uuid, p_meal_type meal_type, p_occurred_at timestamp with time zone, p_meal_date date, p_timezone text, p_finalization jsonb)
CREATE OR REPLACE FUNCTION public.finalize_current_user_meal_identification_v1(p_client_request_id uuid, p_meal_type meal_type, p_occurred_at timestamp with time zone, p_meal_date date, p_timezone text, p_finalization jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_version text;
  v_source_context text;
  v_record_timing text;
  v_command_occurred_at timestamptz;
  v_legacy_finalization jsonb;
  v_result jsonb;
  v_record public.meal_records%ROWTYPE;
  v_finalization_id uuid;
  v_item_id uuid;
  v_analysis_id uuid;
  v_stored_contract_version text;
  v_stored_command jsonb;
  v_stored_source text;
  v_stored_timing text;
  v_stored_occurred_at timestamptz;
  v_correction_ids jsonb;
  v_correction_count integer;
  v_error_state text;
  v_error_message text;
  -- MI-E-C5-B1 v3-only declarations (prefixed v3_ to keep every existing v1/v2
  -- variable name and usage completely untouched).
  v3_analysis_request_id uuid;
  v3_selected_candidate_id uuid;
  v3_meal_write jsonb;
  v3_analysis public.meal_analyses%ROWTYPE;
  v3_candidate jsonb;
  v3_confirmation_mode text;
  v3_meal_name text;
  v3_components jsonb;
  v3_portion text;
  v3_nutrition jsonb;
  v3_legacy_nutrition jsonb;
  v3_manual_reason text;
  v3_key text;
  v3_value jsonb;
  v3_component jsonb;
  v3_component_count integer;
  v3_candidate_name text;
  v3_candidate_components jsonb;
  v3_candidate_nutrition jsonb;
  v3_names_match boolean;
  v3_components_match boolean;
  v3_nutrition_match boolean;
  v3_nutrition_source text;
  v3_source public.meal_source_type;
  v3_is_self_cooked boolean;
  v3_items jsonb;
  v3_created jsonb;
  v3_record_id uuid;
  v3_item_id uuid;
  v3_finalization_id uuid;
  v3_correction_ordinal integer;
  v3_existing_finalization_id uuid;
  v3_existing_item_id uuid;
  v3_existing_correction_ids jsonb;
  v3_fingerprint jsonb;
  -- MI-E-C5-R7-B1 canonical restaurant context (text ids, never uuid-shaped by contract).
  v3_has_restaurant_context boolean;
  v3_restaurant_id text;
  v3_branch_id text;
  v3_catalog_valid boolean;
begin
  perform consumer_internal.require_core(auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000';
  END IF;

  IF pg_catalog.jsonb_typeof(p_finalization) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
  END IF;

  IF p_client_request_id IS NULL
     OR pg_catalog.substr(p_client_request_id::text, 15, 1) <> '4'
     OR p_meal_type IS NULL
     OR p_occurred_at IS NULL
     OR p_meal_date IS NULL
     OR p_timezone IS NULL
     OR pg_catalog.btrim(p_timezone) = ''
     OR pg_catalog.length(pg_catalog.btrim(p_timezone)) > 64 THEN
    RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
  END IF;

  v_version := p_finalization ->> 'version';
  IF v_version = 'meal-identification-finalization-v1' THEN
    v_source_context := p_finalization -> 'selection' ->> 'sourceContext';
    v_result := public.finalize_current_user_meal_identification_v1_legacy_internal(
      p_client_request_id,
      p_meal_type,
      p_occurred_at,
      p_meal_date,
      p_timezone,
      p_finalization
    );

    UPDATE public.meal_identification_finalizations
    SET
      meal_source_context = CASE
        WHEN v_source_context = 'post_hoc' THEN 'unknown'
        ELSE v_source_context
      END,
      record_timing = CASE
        WHEN v_source_context = 'post_hoc' THEN 'post_hoc'
        ELSE 'current'
      END,
      occurred_at = p_occurred_at
    WHERE id = (v_result ->> 'meal_identification_finalization_id')::uuid
      AND user_id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'DURABLE_STATE_INCONSISTENCY' USING ERRCODE = '23514';
    END IF;
    RETURN v_result;
  END IF;

  -- ==========================================================================
  -- MI-E-C5-B1: v3 branch. Links a new meal record to an EXISTING meal_analyses
  -- row instead of ever inserting a new one. The client's confirmed values are
  -- diffed here, server-side, against the selected candidate's own stored
  -- canonical values from detected_items — the client can never assert
  -- confirmation_mode/verification_status/nutritionSource directly, and any
  -- attempt to send those or an originalAnalysis/mealRecordId/mealAnalysisId
  -- field is rejected as FORBIDDEN_FIELD before anything else is evaluated.
  -- ==========================================================================
  IF v_version = 'meal-identification-finalization-v3' THEN
    -- MI-E-C5-R7-B1: exactly TWO accepted top-level key sets. The 8-key set is the original
    -- C5-B1 command and stays valid forever, so a client that has not been upgraded keeps
    -- working. The 10-key set adds the canonical restaurant context, and the keys are only ever
    -- accepted AS A PAIR: an orphan restaurantId or branchId is a malformed command, not a
    -- partially-filled one, and is rejected here before anything else is evaluated.
    v3_has_restaurant_context := (
      SELECT pg_catalog.array_agg(key ORDER BY key)
      FROM pg_catalog.jsonb_object_keys(p_finalization) AS keys(key)
    ) = ARRAY[
      'analysisRequestId', 'branchId', 'captureMethod', 'mealWrite', 'occurredAt',
      'recordTiming', 'restaurantId', 'selectedCandidateId', 'sourceContext', 'version'
    ]::text[];

    IF NOT v3_has_restaurant_context AND (
      SELECT pg_catalog.array_agg(key ORDER BY key)
      FROM pg_catalog.jsonb_object_keys(p_finalization) AS keys(key)
    ) IS DISTINCT FROM ARRAY[
      'analysisRequestId', 'captureMethod', 'mealWrite', 'occurredAt',
      'recordTiming', 'selectedCandidateId', 'sourceContext', 'version'
    ]::text[] THEN
      RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
    END IF;

    IF p_finalization ?| ARRAY[
      'userId', 'ownerId', 'profileId', 'mealRecordId', 'mealRecordItemId', 'mealAnalysisId',
      'originalAnalysis', 'verificationStatus', 'confirmationMode', 'nutritionSource'
    ] THEN
      RAISE EXCEPTION 'FORBIDDEN_FIELD' USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.jsonb_typeof(p_finalization -> 'analysisRequestId') <> 'string' THEN
      RAISE EXCEPTION 'ANALYSIS_NOT_FOUND' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v3_analysis_request_id := (p_finalization ->> 'analysisRequestId')::uuid;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'ANALYSIS_NOT_FOUND' USING ERRCODE = '22023';
    END;

    IF p_finalization -> 'selectedCandidateId' = 'null'::jsonb THEN
      v3_selected_candidate_id := NULL;
    ELSIF pg_catalog.jsonb_typeof(p_finalization -> 'selectedCandidateId') = 'string' THEN
      BEGIN
        v3_selected_candidate_id := (p_finalization ->> 'selectedCandidateId')::uuid;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'INVALID_CANDIDATE' USING ERRCODE = '22023';
      END;
    ELSE
      RAISE EXCEPTION 'INVALID_CANDIDATE' USING ERRCODE = '22023';
    END IF;

    v_source_context := p_finalization ->> 'sourceContext';
    IF v_source_context NOT IN ('dine_in', 'takeout', 'delivery', 'self_cooked', 'unknown') THEN
      RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
    END IF;

    -- ---- MI-E-C5-R7-B1-R1 canonical restaurant context (SHAPE + CANONICAL TEXT ONLY) ----
    -- The ids are opaque TEXT: public.restaurants.id and public.restaurant_branches.id are text
    -- primary keys, so no uuid shape is required or implied.
    --
    -- MODEL A. The server does NOT silently trim and carry on. An id whose raw JSON text differs
    -- from its own btrim is rejected outright, exactly as this function already treats occurredAt.
    -- Silent trimming would split the durable record: command_snapshot and request_fingerprint
    -- store p_finalization verbatim, while the meal item would store the trimmed value — the same
    -- venue would then be two different fingerprints (so two idempotency tokens could both write
    -- the same durable state) while the ledger and the item disagreed on the id text. Rejecting
    -- makes p_finalization itself canonical, so every downstream sink stores identical text and
    -- v3_restaurant_id / v3_branch_id are simply the validated raw values.
    --
    -- The mobile builder also trims, but that is not a substitute: this RPC is directly callable.
    --
    -- Existence, active status and the branch->restaurant relationship are deliberately NOT
    -- checked here. They are validated further down, only for a genuinely NEW request, so an
    -- already-successful idempotency token stays replayable even if the venue is later archived.
    IF v3_has_restaurant_context THEN
      IF pg_catalog.jsonb_typeof(p_finalization -> 'restaurantId') <> 'string' THEN
        RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
      END IF;
      v3_restaurant_id := p_finalization ->> 'restaurantId';
      IF v3_restaurant_id IS NULL
         OR pg_catalog.length(v3_restaurant_id) = 0
         OR pg_catalog.btrim(v3_restaurant_id) <> v3_restaurant_id
         OR pg_catalog.length(pg_catalog.btrim(v3_restaurant_id)) = 0 THEN
        RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
      END IF;

      IF p_finalization -> 'branchId' = 'null'::jsonb THEN
        v3_branch_id := NULL;
      ELSIF pg_catalog.jsonb_typeof(p_finalization -> 'branchId') = 'string' THEN
        v3_branch_id := p_finalization ->> 'branchId';
        IF v3_branch_id IS NULL
           OR pg_catalog.length(v3_branch_id) = 0
           OR pg_catalog.btrim(v3_branch_id) <> v3_branch_id
           OR pg_catalog.length(pg_catalog.btrim(v3_branch_id)) = 0 THEN
          RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
        END IF;
      ELSE
        RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
      END IF;

      -- A self-cooked meal has no venue. Reaching here means the client's own reconciliation
      -- failed, so refuse rather than attach a restaurant to a home-cooked meal.
      IF v_source_context = 'self_cooked' THEN
        RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
      END IF;
    ELSE
      v3_restaurant_id := NULL;
      v3_branch_id := NULL;
    END IF;

    v_record_timing := p_finalization ->> 'recordTiming';
    IF v_record_timing NOT IN ('current', 'post_hoc') THEN
      RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.jsonb_typeof(p_finalization -> 'occurredAt') <> 'string'
       OR pg_catalog.btrim(p_finalization ->> 'occurredAt') <> p_finalization ->> 'occurredAt' THEN
      RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
    END IF;
    BEGIN
      v_command_occurred_at := (p_finalization ->> 'occurredAt')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
    END;
    IF v_command_occurred_at IS DISTINCT FROM p_occurred_at THEN
      RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
    END IF;

    IF p_finalization -> 'captureMethod' <> 'null'::jsonb
       AND (p_finalization ->> 'captureMethod') NOT IN ('camera', 'photo_library') THEN
      RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
    END IF;

    v3_meal_write := p_finalization -> 'mealWrite';
    IF pg_catalog.jsonb_typeof(v3_meal_write) <> 'object'
       OR (
         SELECT pg_catalog.array_agg(key ORDER BY key)
         FROM pg_catalog.jsonb_object_keys(v3_meal_write) AS keys(key)
       ) IS DISTINCT FROM ARRAY['components', 'mealName', 'nutrition', 'portion']::text[] THEN
      RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
    END IF;

    IF pg_catalog.jsonb_typeof(v3_meal_write -> 'mealName') <> 'string' THEN
      RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
    END IF;
    v3_meal_name := pg_catalog.btrim(v3_meal_write ->> 'mealName');
    IF pg_catalog.length(v3_meal_name) = 0 OR pg_catalog.length(v3_meal_name) > 160 THEN
      RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
    END IF;

    IF v3_meal_write -> 'portion' <> 'null'::jsonb THEN
      IF pg_catalog.jsonb_typeof(v3_meal_write -> 'portion') <> 'string' THEN
        RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
      END IF;
      v3_portion := NULLIF(pg_catalog.btrim(v3_meal_write ->> 'portion'), '');
      IF v3_portion IS NOT NULL AND pg_catalog.length(v3_portion) > 200 THEN
        RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
      END IF;
    ELSE
      v3_portion := NULL;
    END IF;

    IF pg_catalog.jsonb_typeof(v3_meal_write -> 'components') <> 'array' THEN
      RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
    END IF;
    v3_component_count := pg_catalog.jsonb_array_length(v3_meal_write -> 'components');
    IF v3_component_count > 12 THEN
      RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
    END IF;
    v3_components := '[]'::jsonb;
    FOR v3_component IN SELECT value FROM pg_catalog.jsonb_array_elements(v3_meal_write -> 'components')
    LOOP
      IF pg_catalog.jsonb_typeof(v3_component) <> 'string' THEN
        RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
      END IF;
      IF pg_catalog.length(pg_catalog.btrim(v3_component #>> '{}')) = 0 THEN
        CONTINUE; -- empty component entries are silently dropped, never rejected
      END IF;
      IF pg_catalog.length(pg_catalog.btrim(v3_component #>> '{}')) > 200 THEN
        RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
      END IF;
      v3_components := v3_components || pg_catalog.jsonb_build_array(pg_catalog.to_jsonb(pg_catalog.btrim(v3_component #>> '{}')));
    END LOOP;

    v3_nutrition := v3_meal_write -> 'nutrition';
    IF pg_catalog.jsonb_typeof(v3_nutrition) <> 'object' THEN
      RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
    END IF;
    FOR v3_key, v3_value IN SELECT key, value FROM pg_catalog.jsonb_each(v3_nutrition)
    LOOP
      IF v3_key NOT IN ('calories', 'proteinGrams', 'carbsGrams', 'fatGrams') THEN
        RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
      END IF;
      IF pg_catalog.jsonb_typeof(v3_value) <> 'number' THEN
        RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
      END IF;
      IF (v3_value #>> '{}')::numeric < 0 THEN
        RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
      END IF;
      IF v3_key = 'calories' AND (v3_value #>> '{}')::numeric > 20000 THEN
        RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
      END IF;
      IF v3_key <> 'calories' AND (v3_value #>> '{}')::numeric > 2000 THEN
        RAISE EXCEPTION 'CORRECTION_VALIDATION_FAILED' USING ERRCODE = '22023';
      END IF;
    END LOOP;

    -- ---- idempotency (same advisory-lock + fingerprint pattern as v1/v2) ----
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_user_id::text || ':' || p_client_request_id::text, 0)
    );

    v3_fingerprint := pg_catalog.jsonb_build_object(
      'operation', 'finalize_current_user_meal_identification_v1',
      'rpcContractVersion', 3,
      'mealType', p_meal_type::text,
      'occurredAt', p_occurred_at,
      'mealDate', p_meal_date,
      'timezone', pg_catalog.btrim(p_timezone),
      'finalization', p_finalization
    );

    SELECT * INTO v_record
    FROM public.meal_records
    WHERE user_id = v_user_id
      AND client_request_id = p_client_request_id;

    IF FOUND THEN
      IF v_record.request_fingerprint IS DISTINCT FROM v3_fingerprint THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
      END IF;

      SELECT finalization.id, finalization.meal_record_item_id, finalization.meal_analysis_id
      INTO v3_existing_finalization_id, v3_existing_item_id, v_analysis_id
      FROM public.meal_identification_finalizations AS finalization
      WHERE finalization.meal_record_id = v_record.id
        AND finalization.user_id = v_user_id
        AND finalization.contract_version = 'meal-identification-finalization-v3';

      IF NOT FOUND THEN
        RAISE EXCEPTION 'DURABLE_STATE_INCONSISTENCY' USING ERRCODE = '23514';
      END IF;

      SELECT COALESCE(pg_catalog.jsonb_agg(correction.id ORDER BY correction.correction_ordinal), '[]'::jsonb)
      INTO v3_existing_correction_ids
      FROM public.meal_corrections AS correction
      WHERE correction.meal_analysis_id = v_analysis_id;

      RETURN pg_catalog.jsonb_build_object(
        'replayed', true,
        'meal_record_id', v_record.id,
        'meal_record_item_id', v3_existing_item_id,
        'meal_analysis_id', v_analysis_id,
        'meal_identification_finalization_id', v3_existing_finalization_id,
        'meal_correction_ids', v3_existing_correction_ids
      );
    END IF;

    -- ---- MI-E-C5-R7-B1-R1: canonical restaurant EXISTENCE validation, NEW requests only ----
    -- Placed deliberately after the replay branch above has already returned. A finalization that
    -- once succeeded must stay replayable for its client_request_id forever, even if the venue is
    -- archived afterwards; only a genuinely new request is held to the venue's CURRENT state.
    --
    -- Validated against the BASE TABLES with the same formal authority the v1/v2 catalog_item
    -- branch already applies to restaurants/branches: restaurant.status='active', and for a branch
    -- also branch.status='active' AND branch.is_active. Deliberately NOT the consumer catalog
    -- view, which additionally requires a published menu and a saleable branch menu item — claims
    -- a photo-analysed meal never makes. SECURITY DEFINER makes these reads possible even though
    -- the consumer role has no SELECT on the base tables, and FOR SHARE holds the rows for the
    -- rest of the transaction so the venue cannot be archived between validation and write.
    IF v3_restaurant_id IS NOT NULL THEN
      v3_catalog_valid := NULL;
      IF v3_branch_id IS NULL THEN
        SELECT true
        INTO v3_catalog_valid
        FROM public.restaurants AS restaurant
        WHERE restaurant.id = v3_restaurant_id
          AND restaurant.status = 'active'
        FOR SHARE OF restaurant;
      ELSE
        SELECT true
        INTO v3_catalog_valid
        FROM public.restaurants AS restaurant
        JOIN public.restaurant_branches AS branch
          ON branch.id = v3_branch_id
          AND branch.restaurant_id = restaurant.id
        WHERE restaurant.id = v3_restaurant_id
          AND restaurant.status = 'active'
          AND branch.status = 'active'
          AND branch.is_active = true
        FOR SHARE OF restaurant, branch;
      END IF;

      IF v3_catalog_valid IS NOT TRUE THEN
        RAISE EXCEPTION 'CATALOG_IDENTITY_REJECTED' USING ERRCODE = '23503';
      END IF;
    END IF;

    -- ---- lock and validate the EXISTING analysis row; never insert a new one ----
    SELECT * INTO v3_analysis
    FROM public.meal_analyses
    WHERE analysis_request_id = v3_analysis_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ANALYSIS_NOT_FOUND' USING ERRCODE = '22023';
    END IF;
    IF v3_analysis.user_id <> v_user_id THEN
      RAISE EXCEPTION 'ANALYSIS_ACCESS_DENIED' USING ERRCODE = '42501';
    END IF;
    IF v3_analysis.analysis_status NOT IN ('completed', 'low_confidence') THEN
      RAISE EXCEPTION 'ANALYSIS_NOT_READY' USING ERRCODE = '22023';
    END IF;
    IF v3_analysis.meal_record_id IS NOT NULL THEN
      RAISE EXCEPTION 'ANALYSIS_ALREADY_FINALIZED' USING ERRCODE = '23505';
    END IF;

    -- ---- resolve selected candidate (or manual) and server-derive confirmation_mode ----
    IF v3_selected_candidate_id IS NOT NULL THEN
      SELECT elem INTO v3_candidate
      FROM pg_catalog.jsonb_array_elements(v3_analysis.detected_items) AS elem
      WHERE elem ->> 'candidateId' = v3_selected_candidate_id::text;

      IF v3_candidate IS NULL THEN
        RAISE EXCEPTION 'INVALID_CANDIDATE' USING ERRCODE = '22023';
      END IF;

      v3_candidate_name := v3_candidate ->> 'observedName';
      v3_candidate_components := COALESCE(
        (SELECT pg_catalog.jsonb_agg(item -> 'name') FROM pg_catalog.jsonb_array_elements(v3_candidate -> 'components') AS item),
        '[]'::jsonb
      );
      v3_candidate_nutrition := v3_candidate -> 'estimatedNutrition';

      v3_names_match := (v3_meal_name = v3_candidate_name);
      v3_components_match := (v3_components = v3_candidate_components);
      v3_nutrition_match := (
        COALESCE((v3_nutrition -> 'calories')::text, 'null') = COALESCE((v3_candidate_nutrition -> 'calories')::text, 'null')
        AND COALESCE((v3_nutrition -> 'proteinGrams')::text, 'null') = COALESCE((v3_candidate_nutrition -> 'proteinGrams')::text, 'null')
        AND COALESCE((v3_nutrition -> 'carbsGrams')::text, 'null') = COALESCE((v3_candidate_nutrition -> 'carbsGrams')::text, 'null')
        AND COALESCE((v3_nutrition -> 'fatGrams')::text, 'null') = COALESCE((v3_candidate_nutrition -> 'fatGrams')::text, 'null')
      );

      IF v3_names_match AND v3_components_match AND v3_nutrition_match THEN
        v3_confirmation_mode := 'accepted';
      ELSE
        v3_confirmation_mode := 'corrected';
      END IF;
      v3_manual_reason := NULL;
    ELSE
      v3_confirmation_mode := 'manual';
      v3_manual_reason := 'none_of_the_above';
      v3_candidate := NULL;
      v3_candidate_name := NULL;
      v3_candidate_components := NULL;
      v3_candidate_nutrition := NULL;
      v3_names_match := false;
      v3_components_match := false;
      v3_nutrition_match := false;
    END IF;

    v3_is_self_cooked := (v_source_context = 'self_cooked');
    v3_source := CASE WHEN v3_is_self_cooked THEN 'self_made' ELSE 'ai_estimated' END;
    v3_nutrition_source := CASE WHEN v3_confirmation_mode = 'accepted' THEN 'ai_estimated' ELSE 'user_corrected' END;

    -- create_current_user_meal_record's own item validation only accepts the established legacy
    -- nutrition key vocabulary (calories/protein/carbohydrates/fat/fiber) — see
    -- 20260713050100_consumer_schema_phase_1_3_atomic_meal_record_write_function.sql. v3_nutrition
    -- is in the MI-E-C4/C5-A candidate vocabulary (calories/proteinGrams/carbsGrams/fatGrams).
    -- Translated here, once, at the single write boundary that needs the legacy shape —
    -- meal_corrections keeps the untranslated MI-E-C4 vocabulary (see below), since that table has
    -- no established convention of its own to conform to. Only present keys are translated, so a
    -- partial nutrition object stays partial (never fabricates a 0 for an omitted field).
    v3_legacy_nutrition := '{}'::jsonb;
    IF v3_nutrition ? 'calories' THEN
      v3_legacy_nutrition := v3_legacy_nutrition || pg_catalog.jsonb_build_object('calories', v3_nutrition -> 'calories');
    END IF;
    IF v3_nutrition ? 'proteinGrams' THEN
      v3_legacy_nutrition := v3_legacy_nutrition || pg_catalog.jsonb_build_object('protein', v3_nutrition -> 'proteinGrams');
    END IF;
    IF v3_nutrition ? 'carbsGrams' THEN
      v3_legacy_nutrition := v3_legacy_nutrition || pg_catalog.jsonb_build_object('carbohydrates', v3_nutrition -> 'carbsGrams');
    END IF;
    IF v3_nutrition ? 'fatGrams' THEN
      v3_legacy_nutrition := v3_legacy_nutrition || pg_catalog.jsonb_build_object('fat', v3_nutrition -> 'fatGrams');
    END IF;

    -- MI-E-C5-R7-B1: the durable item takes the ids from the SAME local variables that were
    -- validated above — the command json is never re-read here, so the ledger's command_snapshot
    -- (which stores p_finalization verbatim) and meal_record_items cannot diverge or apply
    -- different normalization. menuId/menuItemId stay NULL: a photo-analysed meal asserts a
    -- venue, never a menu item.
    v3_items := pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'restaurantId', v3_restaurant_id,
        'branchId', v3_branch_id,
        'menuId', NULL,
        'menuItemId', NULL,
        'displayName', v3_meal_name,
        'userEnteredName', CASE WHEN v3_candidate_name IS NOT NULL AND v3_candidate_name <> v3_meal_name THEN v3_meal_name ELSE NULL END,
        'aiDetectedName', v3_candidate_name,
        'normalizedName', NULL,
        'portion', v3_portion,
        'nutrition', v3_legacy_nutrition,
        'nutritionSource', v3_nutrition_source,
        'sourceEntityVersion', NULL,
        'confidenceScore', v3_analysis.confidence_score,
        'consumedRatio', 1
      )
    );

    v3_created := public.create_current_user_meal_record(
      p_meal_type,
      p_occurred_at,
      p_meal_date,
      pg_catalog.btrim(p_timezone),
      v3_meal_name,
      NULL,
      v3_source,
      v3_items
    );

    v3_record_id := (v3_created ->> 'id')::uuid;
    IF pg_catalog.jsonb_array_length(v3_created -> 'meal_record_items') <> 1 THEN
      RAISE EXCEPTION 'DURABLE_STATE_INCONSISTENCY' USING ERRCODE = '23514';
    END IF;
    v3_item_id := (v3_created -> 'meal_record_items' -> 0 ->> 'id')::uuid;

    UPDATE public.meal_records
    SET client_request_id = p_client_request_id,
        request_fingerprint = v3_fingerprint
    WHERE id = v3_record_id
      AND user_id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'OWNERSHIP_OR_AUTHORIZATION_REJECTED' USING ERRCODE = '42501';
    END IF;

    -- ---- link the EXISTING analysis row; the WHERE clause re-checks
    -- meal_record_id IS NULL under the lock already held, so a race can only
    -- ever be lost here, never silently overwrite another finalization ----
    UPDATE public.meal_analyses
    SET meal_record_id = v3_record_id
    WHERE id = v3_analysis.id
      AND user_id = v_user_id
      AND meal_record_id IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ANALYSIS_ALREADY_FINALIZED' USING ERRCODE = '23505';
    END IF;
    v_analysis_id := v3_analysis.id;

    -- ---- confirmation/correction ledger; original detected_items is never
    -- overwritten here — only meal_record_id changed above ----
    --
    -- Accepted-unchanged gets an explicit confirmation event. It is not a fake
    -- correction: correction_type is 'confirmation', before_value is NULL, and
    -- after_value describes the accepted event state rather than an edited meal
    -- value. The event persists the existing canonical verification authority
    -- user_confirmed and is uniquely constrained to one row per analysis.
    v3_correction_ordinal := 0;
    IF v3_confirmation_mode = 'accepted' THEN
      INSERT INTO public.meal_corrections (
        user_id, meal_analysis_id, meal_record_item_id, correction_type,
        before_value, after_value, correction_reason, corrected_at,
        correction_ordinal, verification_status
      ) VALUES (
        v_user_id, v_analysis_id, v3_item_id, 'confirmation',
        NULL, pg_catalog.jsonb_build_object('confirmationMode', 'accepted'), NULL, pg_catalog.now(),
        v3_correction_ordinal, 'user_confirmed'
      );
    ELSIF v3_confirmation_mode = 'corrected' THEN
      IF NOT v3_names_match THEN
        -- MI-E-C5-B1-R1 fix: before_value/after_value are jsonb columns; the
        -- source variables here are text, and Postgres has no implicit
        -- text->jsonb cast (SQLSTATE 42804 without this wrap — the confirmed
        -- Scenario B root cause). to_jsonb(...) matches the wrap the manual
        -- branch below already applied correctly.
        INSERT INTO public.meal_corrections (
          user_id, meal_analysis_id, meal_record_item_id, correction_type,
          before_value, after_value, correction_reason, corrected_at,
          correction_ordinal, verification_status
        ) VALUES (
          v_user_id, v_analysis_id, v3_item_id, 'name_change',
          pg_catalog.to_jsonb(v3_candidate_name), pg_catalog.to_jsonb(v3_meal_name), NULL, pg_catalog.now(),
          v3_correction_ordinal, 'user_corrected'
        );
        v3_correction_ordinal := v3_correction_ordinal + 1;
      END IF;
      IF NOT v3_nutrition_match THEN
        INSERT INTO public.meal_corrections (
          user_id, meal_analysis_id, meal_record_item_id, correction_type,
          before_value, after_value, correction_reason, corrected_at,
          correction_ordinal, verification_status
        ) VALUES (
          v_user_id, v_analysis_id, v3_item_id, 'nutrition_override',
          v3_candidate_nutrition, v3_nutrition, NULL, pg_catalog.now(),
          v3_correction_ordinal, 'user_corrected'
        );
        v3_correction_ordinal := v3_correction_ordinal + 1;
      END IF;
      IF NOT v3_components_match THEN
        INSERT INTO public.meal_corrections (
          user_id, meal_analysis_id, meal_record_item_id, correction_type,
          before_value, after_value, correction_reason, corrected_at,
          correction_ordinal, verification_status
        ) VALUES (
          v_user_id, v_analysis_id, v3_item_id, 'ingredient_adjustment',
          v3_candidate_components,
          v3_components,
          NULL, pg_catalog.now(),
          v3_correction_ordinal, 'user_corrected'
        );
        v3_correction_ordinal := v3_correction_ordinal + 1;
      END IF;
    ELSIF v3_confirmation_mode = 'manual' THEN
      INSERT INTO public.meal_corrections (
        user_id, meal_analysis_id, meal_record_item_id, correction_type,
        before_value, after_value, correction_reason, corrected_at,
        correction_ordinal, verification_status
      ) VALUES (
        v_user_id, v_analysis_id, v3_item_id, 'name_change',
        NULL, pg_catalog.to_jsonb(v3_meal_name), v3_manual_reason, pg_catalog.now(),
        v3_correction_ordinal, 'user_corrected'
      );
    END IF;

    UPDATE public.meal_record_items
    SET correction_status = 'confirmed'::public.meal_correction_status,
        updated_at = pg_catalog.now()
    WHERE id = v3_item_id
      AND meal_record_id = v3_record_id
      AND user_id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'OWNERSHIP_OR_AUTHORIZATION_REJECTED' USING ERRCODE = '42501';
    END IF;

    -- MI-E-C5-R7-B1-R2: the ledger's OWN restaurant_id/branch_id columns are populated here.
    --
    -- These columns have existed on meal_identification_finalizations since the table was created
    -- (20260724020000) and the v1/v2 branch has always written them. The v3 branch previously left
    -- them NULL while writing the ids to meal_record_items and storing them inside command_snapshot,
    -- which made the same durable fact disagree across two stores that both have a column for it,
    -- and made the column's meaning depend on the contract version. It is now written for v3 too.
    --
    -- The values come from the SAME local variables the meal item was built from — already checked
    -- for JSON type, canonical (untrimmed) text, the self_cooked invariant and base-table identity.
    -- p_finalization is deliberately not re-read here, nothing is re-trimmed or re-normalized, and
    -- neither the item nor the snapshot is read back: a second derivation is exactly how the two
    -- sides could drift apart again. menu identity stays NULL — a photo-analysed meal asserts a
    -- venue, never a menu item.
    INSERT INTO public.meal_identification_finalizations (
      user_id, meal_record_id, meal_record_item_id, meal_analysis_id,
      contract_version, source_context, selection_kind, unresolved_reason,
      identity_validation_status, restaurant_id, branch_id, command_snapshot,
      meal_source_context, record_timing, occurred_at, confirmation_mode
    ) VALUES (
      v_user_id, v3_record_id, v3_item_id, v_analysis_id,
      'meal-identification-finalization-v3', v_source_context, 'ai_candidate', NULL,
      'not_applicable', v3_restaurant_id, v3_branch_id, p_finalization,
      v_source_context, v_record_timing, p_occurred_at, v3_confirmation_mode
    )
    RETURNING id INTO v3_finalization_id;

    SELECT COALESCE(pg_catalog.jsonb_agg(correction.id ORDER BY correction.correction_ordinal), '[]'::jsonb)
    INTO v_correction_ids
    FROM public.meal_corrections AS correction
    WHERE correction.meal_analysis_id = v_analysis_id
      AND correction.meal_record_item_id = v3_item_id
      AND correction.user_id = v_user_id;

    RETURN pg_catalog.jsonb_build_object(
      'replayed', false,
      'meal_record_id', v3_record_id,
      'meal_record_item_id', v3_item_id,
      'meal_analysis_id', v_analysis_id,
      'meal_identification_finalization_id', v3_finalization_id,
      'meal_correction_ids', v_correction_ids
    );
  END IF;

  IF v_version <> 'meal-identification-finalization-v2' THEN
    RAISE EXCEPTION 'UNSUPPORTED_CONTRACT_VERSION' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT pg_catalog.array_agg(key ORDER BY key)
    FROM pg_catalog.jsonb_object_keys(p_finalization) AS keys(key)
  ) IS DISTINCT FROM ARRAY[
    'corrections',
    'mealWrite',
    'occurredAt',
    'originalAnalysis',
    'recordTiming',
    'selection',
    'version'
  ]::text[] THEN
    RAISE EXCEPTION 'FORBIDDEN_FIELD' USING ERRCODE = '22023';
  END IF;

  v_source_context := p_finalization -> 'selection' ->> 'sourceContext';
  IF v_source_context NOT IN ('dine_in', 'takeout', 'delivery', 'self_cooked', 'unknown') THEN
    RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;

  v_record_timing := p_finalization ->> 'recordTiming';
  IF v_record_timing NOT IN ('current', 'post_hoc') THEN
    RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.jsonb_typeof(p_finalization -> 'occurredAt') <> 'string'
     OR pg_catalog.btrim(p_finalization ->> 'occurredAt') <> p_finalization ->> 'occurredAt' THEN
    RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_command_occurred_at := (p_finalization ->> 'occurredAt')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
  END;
  IF v_command_occurred_at IS DISTINCT FROM p_occurred_at THEN
    RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_client_request_id::text, 0)
  );

  SELECT *
  INTO v_record
  FROM public.meal_records
  WHERE user_id = v_user_id
    AND client_request_id = p_client_request_id;

  IF FOUND THEN
    SELECT
      finalization.id,
      finalization.meal_record_item_id,
      finalization.meal_analysis_id,
      finalization.contract_version,
      finalization.command_snapshot,
      finalization.meal_source_context,
      finalization.record_timing,
      finalization.occurred_at
    INTO
      v_finalization_id,
      v_item_id,
      v_analysis_id,
      v_stored_contract_version,
      v_stored_command,
      v_stored_source,
      v_stored_timing,
      v_stored_occurred_at
    FROM public.meal_identification_finalizations AS finalization
    WHERE finalization.meal_record_id = v_record.id
      AND finalization.user_id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'DURABLE_STATE_INCONSISTENCY' USING ERRCODE = '23514';
    END IF;

    IF v_record.meal_type IS DISTINCT FROM p_meal_type
       OR v_record.occurred_at IS DISTINCT FROM p_occurred_at
       OR v_record.meal_date IS DISTINCT FROM p_meal_date
       OR v_record.timezone IS DISTINCT FROM pg_catalog.btrim(p_timezone)
       OR v_stored_contract_version <> 'meal-identification-finalization-v2'
       OR v_stored_command IS DISTINCT FROM p_finalization
       OR v_stored_source IS DISTINCT FROM v_source_context
       OR v_stored_timing IS DISTINCT FROM v_record_timing
       OR v_stored_occurred_at IS DISTINCT FROM p_occurred_at THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
    END IF;

    SELECT
      COALESCE(
        pg_catalog.jsonb_agg(correction.id ORDER BY correction.correction_ordinal),
        '[]'::jsonb
      ),
      pg_catalog.count(*)::integer
    INTO v_correction_ids, v_correction_count
    FROM public.meal_corrections AS correction
    WHERE correction.meal_analysis_id = v_analysis_id
      AND correction.meal_record_item_id = v_item_id
      AND correction.user_id = v_user_id;

    IF v_correction_count <> pg_catalog.jsonb_array_length(p_finalization -> 'corrections') THEN
      RAISE EXCEPTION 'DURABLE_STATE_INCONSISTENCY' USING ERRCODE = '23514';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'replayed', true,
      'meal_record_id', v_record.id,
      'meal_record_item_id', v_item_id,
      'meal_analysis_id', v_analysis_id,
      'meal_identification_finalization_id', v_finalization_id,
      'meal_correction_ids', v_correction_ids
    );
  END IF;

  v_legacy_finalization :=
    (p_finalization - 'recordTiming' - 'occurredAt')
    || pg_catalog.jsonb_build_object('version', 'meal-identification-finalization-v1');

  v_result := public.finalize_current_user_meal_identification_v1_legacy_internal(
    p_client_request_id,
    p_meal_type,
    p_occurred_at,
    p_meal_date,
    p_timezone,
    v_legacy_finalization
  );

  UPDATE public.meal_identification_finalizations
  SET
    contract_version = 'meal-identification-finalization-v2',
    meal_source_context = v_source_context,
    record_timing = v_record_timing,
    occurred_at = p_occurred_at,
    command_snapshot = p_finalization
  WHERE id = (v_result ->> 'meal_identification_finalization_id')::uuid
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DURABLE_STATE_INCONSISTENCY' USING ERRCODE = '23514';
  END IF;

  UPDATE public.meal_records
  SET request_fingerprint = pg_catalog.jsonb_build_object(
    'operation', 'finalize_current_user_meal_identification_v1',
    'rpcContractVersion', 2,
    'mealType', p_meal_type::text,
    'occurredAt', p_occurred_at,
    'mealDate', p_meal_date,
    'timezone', pg_catalog.btrim(p_timezone),
    'finalization', p_finalization
  )
  WHERE id = (v_result ->> 'meal_record_id')::uuid
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OWNERSHIP_OR_AUTHORIZATION_REJECTED' USING ERRCODE = '42501';
  END IF;

  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS
    v_error_state = RETURNED_SQLSTATE,
    v_error_message = MESSAGE_TEXT;
  IF v_error_state IN ('28000', '22023', '23503', '23514', '23505', '42501')
     AND v_error_message ~ '^[A-Z0-9_]+$' THEN
    RAISE EXCEPTION '%', v_error_message USING ERRCODE = v_error_state;
  ELSIF v_error_state = '23505' THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
  ELSIF v_error_state IN ('23503', '23514') THEN
    RAISE EXCEPTION 'DURABLE_FINALIZATION_FAILED' USING ERRCODE = '23514';
  ELSIF v_error_state = '42501' THEN
    RAISE EXCEPTION 'OWNERSHIP_OR_AUTHORIZATION_REJECTED' USING ERRCODE = '42501';
  ELSE
    RAISE EXCEPTION 'DURABLE_FINALIZATION_FAILED' USING ERRCODE = '23514';
  END IF;
END;
$function$
;

-- Exact core RPC: finalize_current_user_meal_identification_v1_legacy_internal(p_client_request_id uuid, p_meal_type meal_type, p_occurred_at timestamp with time zone, p_meal_date date, p_timezone text, p_finalization jsonb)
CREATE OR REPLACE FUNCTION public.finalize_current_user_meal_identification_v1_legacy_internal(p_client_request_id uuid, p_meal_type meal_type, p_occurred_at timestamp with time zone, p_meal_date date, p_timezone text, p_finalization jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_original jsonb;
  v_selection jsonb;
  v_identity jsonb;
  v_candidate jsonb;
  v_corrections jsonb;
  v_meal_write jsonb;
  v_model jsonb;
  v_nutrition jsonb;
  v_event jsonb;
  v_detail jsonb;
  v_event_index integer;
  v_correction_count integer;
  v_key text;
  v_snapshot_key text;
  v_nutrient_key text;
  v_value jsonb;
  v_analyzed_at timestamptz;
  v_corrected_at timestamptz;
  v_selection_kind text;
  v_source_context text;
  v_unresolved_reason text;
  v_restaurant_id text;
  v_branch_id text;
  v_menu_id text;
  v_menu_category_id text;
  v_menu_item_id text;
  v_branch_menu_item_id text;
  v_original_detected_name text;
  v_meal_name text;
  v_portion text;
  v_is_self_cooked boolean;
  v_was_user_corrected boolean;
  v_fingerprint jsonb;
  v_existing public.meal_records%ROWTYPE;
  v_existing_finalization_id uuid;
  v_existing_item_id uuid;
  v_existing_analysis_id uuid;
  v_existing_correction_ids jsonb;
  v_existing_correction_count integer;
  v_catalog_valid boolean := false;
  v_created jsonb;
  v_record_id uuid;
  v_item_id uuid;
  v_analysis_id uuid;
  v_finalization_id uuid;
  v_correction_ids jsonb := '[]'::jsonb;
  v_source public.meal_source_type;
  v_nutrition_source public.nutrition_source_type;
  v_items jsonb;
  v_error_state text;
  v_error_message text;
begin
  perform consumer_internal.require_core(auth.uid());
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '28000';
  END IF;

  IF p_client_request_id IS NULL
     OR pg_catalog.substr(p_client_request_id::text, 15, 1) <> '4' THEN
    RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
  END IF;

  IF p_meal_type IS NULL
     OR p_occurred_at IS NULL
     OR p_meal_date IS NULL
     OR p_timezone IS NULL
     OR pg_catalog.btrim(p_timezone) = ''
     OR pg_catalog.length(pg_catalog.btrim(p_timezone)) > 64
     OR pg_catalog.jsonb_typeof(p_finalization) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
  END IF;

  IF p_finalization ->> 'version' <> 'meal-identification-finalization-v1' THEN
    RAISE EXCEPTION 'UNSUPPORTED_CONTRACT_VERSION' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT pg_catalog.array_agg(key ORDER BY key)
    FROM pg_catalog.jsonb_object_keys(p_finalization) AS keys(key)
  ) IS DISTINCT FROM ARRAY['corrections', 'mealWrite', 'originalAnalysis', 'selection', 'version']::text[] THEN
    RAISE EXCEPTION 'FORBIDDEN_FIELD' USING ERRCODE = '22023';
  END IF;

  v_original := p_finalization -> 'originalAnalysis';
  v_selection := p_finalization -> 'selection';
  v_corrections := p_finalization -> 'corrections';
  v_meal_write := p_finalization -> 'mealWrite';

  IF v_original ?| ARRAY[
       'userId', 'ownerId', 'profileId', 'mealRecordId', 'mealRecordItemId', 'mealAnalysisId',
       'user_id', 'owner_id', 'profile_id', 'meal_record_id', 'meal_record_item_id', 'meal_analysis_id'
     ]
     OR v_selection ?| ARRAY[
       'userId', 'ownerId', 'profileId', 'mealRecordId', 'mealRecordItemId', 'mealAnalysisId',
       'user_id', 'owner_id', 'profile_id', 'meal_record_id', 'meal_record_item_id', 'meal_analysis_id'
     ]
     OR v_meal_write ?| ARRAY[
       'userId', 'ownerId', 'profileId', 'mealRecordId', 'mealRecordItemId', 'mealAnalysisId',
       'user_id', 'owner_id', 'profile_id', 'meal_record_id', 'meal_record_item_id', 'meal_analysis_id'
     ] THEN
    RAISE EXCEPTION 'FORBIDDEN_FIELD' USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.jsonb_typeof(v_original) <> 'object'
     OR (
       SELECT pg_catalog.array_agg(key ORDER BY key)
       FROM pg_catalog.jsonb_object_keys(v_original) AS keys(key)
     ) IS DISTINCT FROM ARRAY[
       'analyzedAt', 'confidence', 'detectedItemNames', 'estimatedNutrition',
       'model', 'photoReferences', 'status'
     ]::text[] THEN
    RAISE EXCEPTION 'ANALYSIS_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;

  IF v_original ->> 'status' NOT IN ('available', 'unavailable')
     OR pg_catalog.jsonb_typeof(v_original -> 'detectedItemNames') <> 'array'
     OR pg_catalog.jsonb_typeof(v_original -> 'photoReferences') <> 'array' THEN
    RAISE EXCEPTION 'ANALYSIS_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;

  FOR v_value IN SELECT value FROM pg_catalog.jsonb_array_elements(v_original -> 'detectedItemNames')
  LOOP
    IF pg_catalog.jsonb_typeof(v_value) <> 'string'
       OR pg_catalog.btrim(v_value #>> '{}') = '' THEN
      RAISE EXCEPTION 'ANALYSIS_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;
  END LOOP;

  FOR v_value IN SELECT value FROM pg_catalog.jsonb_array_elements(v_original -> 'photoReferences')
  LOOP
    IF pg_catalog.jsonb_typeof(v_value) <> 'string'
       OR pg_catalog.btrim(v_value #>> '{}') = '' THEN
      RAISE EXCEPTION 'ANALYSIS_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;
  END LOOP;

  v_model := v_original -> 'model';
  IF v_model <> 'null'::jsonb THEN
    IF pg_catalog.jsonb_typeof(v_model) <> 'object'
       OR (
         SELECT pg_catalog.array_agg(key ORDER BY key)
         FROM pg_catalog.jsonb_object_keys(v_model) AS keys(key)
       ) IS DISTINCT FROM ARRAY['name', 'version']::text[]
       OR pg_catalog.btrim(v_model ->> 'name') = ''
       OR pg_catalog.btrim(v_model ->> 'version') = '' THEN
      RAISE EXCEPTION 'ANALYSIS_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_original -> 'estimatedNutrition' <> 'null'::jsonb THEN
    IF pg_catalog.jsonb_typeof(v_original -> 'estimatedNutrition') <> 'object' THEN
      RAISE EXCEPTION 'ANALYSIS_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;
    FOR v_key, v_value IN
      SELECT key, value FROM pg_catalog.jsonb_each(v_original -> 'estimatedNutrition')
    LOOP
      IF v_key NOT IN ('calories', 'protein', 'carbohydrates', 'fat', 'fiber')
         OR pg_catalog.jsonb_typeof(v_value) <> 'number'
         OR (v_value #>> '{}')::numeric < 0 THEN
        RAISE EXCEPTION 'ANALYSIS_INVARIANT_VIOLATION' USING ERRCODE = '23514';
      END IF;
    END LOOP;
  END IF;

  IF v_original -> 'confidence' <> 'null'::jsonb
     AND (
       pg_catalog.jsonb_typeof(v_original -> 'confidence') <> 'number'
       OR (v_original ->> 'confidence')::numeric < 0
       OR (v_original ->> 'confidence')::numeric > 1
     ) THEN
    RAISE EXCEPTION 'ANALYSIS_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;

  IF v_original ->> 'status' = 'available' THEN
    IF pg_catalog.jsonb_array_length(v_original -> 'detectedItemNames') = 0
       OR v_original -> 'analyzedAt' = 'null'::jsonb
       OR pg_catalog.jsonb_typeof(v_original -> 'analyzedAt') <> 'string'
       OR pg_catalog.btrim(v_original ->> 'analyzedAt') <> v_original ->> 'analyzedAt' THEN
      RAISE EXCEPTION 'ANALYSIS_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;
    BEGIN
      v_analyzed_at := (v_original ->> 'analyzedAt')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'ANALYSIS_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END;
  ELSE
    IF pg_catalog.jsonb_array_length(v_original -> 'detectedItemNames') <> 0
       OR pg_catalog.jsonb_array_length(v_original -> 'photoReferences') <> 0
       OR v_model <> 'null'::jsonb
       OR v_original -> 'estimatedNutrition' <> 'null'::jsonb
       OR v_original -> 'confidence' <> 'null'::jsonb
       OR v_original -> 'analyzedAt' <> 'null'::jsonb THEN
      RAISE EXCEPTION 'ANALYSIS_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;
    v_analyzed_at := NULL;
  END IF;

  IF pg_catalog.jsonb_typeof(v_selection) <> 'object' THEN
    RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;

  v_source_context := v_selection ->> 'sourceContext';
  IF v_source_context NOT IN ('dine_in', 'takeout', 'delivery', 'self_cooked', 'post_hoc', 'unknown') THEN
    RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;

  v_identity := v_selection -> 'identity';
  IF pg_catalog.jsonb_typeof(v_identity) <> 'object' THEN
    RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;
  IF v_identity ?| ARRAY[
       'userId', 'ownerId', 'profileId', 'mealRecordId', 'mealRecordItemId', 'mealAnalysisId',
       'user_id', 'owner_id', 'profile_id', 'meal_record_id', 'meal_record_item_id', 'meal_analysis_id'
  ] THEN
    RAISE EXCEPTION 'FORBIDDEN_FIELD' USING ERRCODE = '22023';
  END IF;
  IF (
    SELECT pg_catalog.array_agg(key ORDER BY key)
    FROM pg_catalog.jsonb_object_keys(v_identity) AS keys(key)
  ) IS DISTINCT FROM ARRAY[
    'branchId', 'branchMenuItemId', 'menuCategoryId', 'menuId', 'menuItemId', 'restaurantId'
  ]::text[] THEN
    RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;

  IF v_selection ->> 'kind' = 'confirmed_catalog' THEN
    IF (
      SELECT pg_catalog.array_agg(key ORDER BY key)
      FROM pg_catalog.jsonb_object_keys(v_selection) AS keys(key)
    ) IS DISTINCT FROM ARRAY[
      'candidateSnapshot', 'catalogSource', 'identity', 'identityClaimStatus', 'kind', 'sourceContext'
    ]::text[]
       OR v_selection ->> 'identityClaimStatus' <> 'pending_server_validation'
       OR v_selection ->> 'catalogSource' NOT IN ('mock', 'supabase') THEN
      RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;

    FOREACH v_key IN ARRAY ARRAY[
      'restaurantId', 'branchId', 'menuId', 'menuCategoryId', 'menuItemId', 'branchMenuItemId'
    ]
    LOOP
      IF pg_catalog.jsonb_typeof(v_identity -> v_key) <> 'string' THEN
        RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
      END IF;
    END LOOP;

    v_restaurant_id := v_identity ->> 'restaurantId';
    v_branch_id := v_identity ->> 'branchId';
    v_menu_id := v_identity ->> 'menuId';
    v_menu_category_id := v_identity ->> 'menuCategoryId';
    v_menu_item_id := v_identity ->> 'menuItemId';
    v_branch_menu_item_id := v_identity ->> 'branchMenuItemId';

    IF v_restaurant_id IS NULL OR v_restaurant_id = '' OR pg_catalog.btrim(v_restaurant_id) <> v_restaurant_id
       OR v_branch_id IS NULL OR v_branch_id = '' OR pg_catalog.btrim(v_branch_id) <> v_branch_id
       OR v_menu_id IS NULL OR v_menu_id = '' OR pg_catalog.btrim(v_menu_id) <> v_menu_id
       OR v_menu_category_id IS NULL OR v_menu_category_id = '' OR pg_catalog.btrim(v_menu_category_id) <> v_menu_category_id
       OR v_menu_item_id IS NULL OR v_menu_item_id = '' OR pg_catalog.btrim(v_menu_item_id) <> v_menu_item_id
       OR v_branch_menu_item_id IS NULL OR v_branch_menu_item_id = '' OR pg_catalog.btrim(v_branch_menu_item_id) <> v_branch_menu_item_id THEN
      RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;

    v_candidate := v_selection -> 'candidateSnapshot';
    IF pg_catalog.jsonb_typeof(v_candidate) <> 'object' THEN
      RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;
    IF (
      SELECT pg_catalog.array_agg(key ORDER BY key)
      FROM pg_catalog.jsonb_object_keys(v_candidate) AS keys(key)
    ) IS DISTINCT FROM ARRAY[
         'availability', 'branchContext', 'branchName', 'confidence', 'identity',
         'kind', 'matchReason', 'mealItemName', 'menuCategoryName', 'menuName',
         'nutritionProvenance', 'price', 'restaurantName', 'source', 'tags'
       ]::text[] THEN
      RAISE EXCEPTION 'FORBIDDEN_FIELD' USING ERRCODE = '22023';
    END IF;
    IF v_candidate ->> 'kind' <> 'catalog_item'
       OR v_candidate ->> 'source' <> v_selection ->> 'catalogSource'
       OR v_candidate -> 'identity' IS DISTINCT FROM v_identity
       OR v_candidate ->> 'availability' NOT IN ('available', 'limited')
       OR v_candidate ->> 'nutritionProvenance' NOT IN ('ai_estimated', 'restaurant_confirmed', 'platform_reviewed', 'missing')
       OR pg_catalog.jsonb_typeof(v_candidate -> 'tags') <> 'array'
       OR pg_catalog.jsonb_typeof(v_candidate -> 'price') <> 'number'
       OR (v_candidate ->> 'price')::numeric < 0 THEN
      RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;

    FOR v_value IN SELECT value FROM pg_catalog.jsonb_array_elements(v_candidate -> 'tags')
    LOOP
      IF pg_catalog.jsonb_typeof(v_value) <> 'string'
         OR pg_catalog.btrim(v_value #>> '{}') = '' THEN
        RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
      END IF;
    END LOOP;

    FOREACH v_key IN ARRAY ARRAY[
      'restaurantName', 'branchName', 'menuName', 'menuCategoryName', 'mealItemName', 'matchReason'
    ]
    LOOP
      IF pg_catalog.jsonb_typeof(v_candidate -> v_key) <> 'string'
         OR pg_catalog.btrim(v_candidate ->> v_key) = '' THEN
        RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
      END IF;
    END LOOP;

    IF pg_catalog.jsonb_typeof(v_candidate -> 'branchContext') <> 'string'
       OR (
         v_candidate -> 'confidence' <> 'null'::jsonb
         AND (
           pg_catalog.jsonb_typeof(v_candidate -> 'confidence') <> 'number'
           OR (v_candidate ->> 'confidence')::numeric < 0
           OR (v_candidate ->> 'confidence')::numeric > 1
         )
       ) THEN
      RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;

    v_selection_kind := 'catalog_item';
    v_unresolved_reason := NULL;
  ELSIF v_selection ->> 'kind' = 'personal_unresolved' THEN
    IF (
      SELECT pg_catalog.array_agg(key ORDER BY key)
      FROM pg_catalog.jsonb_object_keys(v_selection) AS keys(key)
    ) IS DISTINCT FROM ARRAY[
      'identity', 'kind', 'mealItemName', 'reason', 'restaurantName', 'sourceContext'
    ]::text[]
       OR v_selection ->> 'reason' NOT IN ('manual', 'self_cooked', 'none_of_the_above', 'catalog_unavailable')
       OR pg_catalog.jsonb_typeof(v_selection -> 'restaurantName') <> 'string'
       OR pg_catalog.jsonb_typeof(v_selection -> 'mealItemName') <> 'string'
       OR EXISTS (
         SELECT 1
         FROM pg_catalog.jsonb_each(v_identity) AS identity_entry(key, value)
         WHERE value <> 'null'::jsonb
       ) THEN
      RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;

    v_selection_kind := 'personal_unresolved';
    v_unresolved_reason := v_selection ->> 'reason';
    v_restaurant_id := NULL;
    v_branch_id := NULL;
    v_menu_id := NULL;
    v_menu_category_id := NULL;
    v_menu_item_id := NULL;
    v_branch_menu_item_id := NULL;
  ELSE
    RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
  END IF;

  IF pg_catalog.jsonb_typeof(v_corrections) <> 'array' THEN
    RAISE EXCEPTION 'CORRECTION_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;
  v_correction_count := pg_catalog.jsonb_array_length(v_corrections);

  FOR v_event, v_event_index IN
    SELECT value, ordinality::integer - 1
    FROM pg_catalog.jsonb_array_elements(v_corrections) WITH ORDINALITY
  LOOP
    IF pg_catalog.jsonb_typeof(v_event) <> 'object' THEN
      RAISE EXCEPTION 'CORRECTION_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;
    IF v_event ?| ARRAY[
         'userId', 'ownerId', 'profileId', 'mealRecordId', 'mealRecordItemId', 'mealAnalysisId',
         'user_id', 'owner_id', 'profile_id', 'meal_record_id', 'meal_record_item_id', 'meal_analysis_id'
       ] THEN
      RAISE EXCEPTION 'FORBIDDEN_FIELD' USING ERRCODE = '22023';
    END IF;
    IF (
         SELECT pg_catalog.array_agg(key ORDER BY key)
         FROM pg_catalog.jsonb_object_keys(v_event) AS keys(key)
       ) IS DISTINCT FROM ARRAY['correctedAt', 'correctionReason', 'detail', 'ordinal']::text[]
       OR pg_catalog.jsonb_typeof(v_event -> 'ordinal') <> 'number'
       OR (v_event ->> 'ordinal')::numeric <> v_event_index
       OR pg_catalog.jsonb_typeof(v_event -> 'correctedAt') <> 'string'
       OR pg_catalog.btrim(v_event ->> 'correctedAt') <> v_event ->> 'correctedAt'
       OR (
         v_event -> 'correctionReason' <> 'null'::jsonb
         AND pg_catalog.jsonb_typeof(v_event -> 'correctionReason') <> 'string'
       ) THEN
      RAISE EXCEPTION 'CORRECTION_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;
    BEGIN
      v_corrected_at := (v_event ->> 'correctedAt')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'CORRECTION_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END;

    v_detail := v_event -> 'detail';
    IF pg_catalog.jsonb_typeof(v_detail) <> 'object' THEN
      RAISE EXCEPTION 'CORRECTION_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;
    IF v_detail ?| ARRAY[
         'userId', 'ownerId', 'profileId', 'mealRecordId', 'mealRecordItemId', 'mealAnalysisId',
         'user_id', 'owner_id', 'profile_id', 'meal_record_id', 'meal_record_item_id', 'meal_analysis_id'
       ] THEN
      RAISE EXCEPTION 'FORBIDDEN_FIELD' USING ERRCODE = '22023';
    END IF;
    IF v_detail ->> 'correctionType' NOT IN (
         'nutrition_override', 'ingredient_adjustment', 'portion_adjustment',
         'cooking_adjustment', 'name_change', 'unknown'
       ) THEN
      RAISE EXCEPTION 'CORRECTION_INVARIANT_VIOLATION' USING ERRCODE = '23514';
    END IF;

    IF v_detail ->> 'correctionType' = 'nutrition_override' THEN
      IF (
        SELECT pg_catalog.array_agg(key ORDER BY key)
        FROM pg_catalog.jsonb_object_keys(v_detail) AS keys(key)
      ) IS DISTINCT FROM ARRAY['after', 'before', 'correctionType']::text[]
         OR pg_catalog.jsonb_typeof(v_detail -> 'after') <> 'object'
         OR (
           v_detail -> 'before' <> 'null'::jsonb
           AND pg_catalog.jsonb_typeof(v_detail -> 'before') <> 'object'
      ) THEN
        RAISE EXCEPTION 'CORRECTION_INVARIANT_VIOLATION' USING ERRCODE = '23514';
      END IF;
      FOREACH v_snapshot_key IN ARRAY ARRAY['before', 'after']
      LOOP
        IF v_detail -> v_snapshot_key = 'null'::jsonb THEN
          CONTINUE;
        END IF;
        FOR v_nutrient_key, v_value IN
          SELECT key, value FROM pg_catalog.jsonb_each(v_detail -> v_snapshot_key)
        LOOP
          IF v_nutrient_key NOT IN ('calories', 'protein', 'carbohydrates', 'fat', 'fiber')
             OR pg_catalog.jsonb_typeof(v_value) <> 'number'
             OR (v_value #>> '{}')::numeric < 0 THEN
            RAISE EXCEPTION 'CORRECTION_INVARIANT_VIOLATION' USING ERRCODE = '23514';
          END IF;
        END LOOP;
      END LOOP;
    ELSIF v_detail ->> 'correctionType' = 'unknown' THEN
      IF (
        SELECT pg_catalog.array_agg(key ORDER BY key)
        FROM pg_catalog.jsonb_object_keys(v_detail) AS keys(key)
      ) IS DISTINCT FROM ARRAY['after', 'correctionType', 'rawCorrectionType']::text[]
         OR pg_catalog.jsonb_typeof(v_detail -> 'rawCorrectionType') <> 'string'
         OR pg_catalog.btrim(v_detail ->> 'rawCorrectionType') = '' THEN
        RAISE EXCEPTION 'CORRECTION_INVARIANT_VIOLATION' USING ERRCODE = '23514';
      END IF;
    ELSE
      IF (
        SELECT pg_catalog.array_agg(key ORDER BY key)
        FROM pg_catalog.jsonb_object_keys(v_detail) AS keys(key)
      ) IS DISTINCT FROM ARRAY['after', 'before', 'correctionType']::text[]
         OR pg_catalog.jsonb_typeof(v_detail -> 'after') <> 'string'
         OR pg_catalog.btrim(v_detail ->> 'after') = ''
         OR (
           v_detail -> 'before' <> 'null'::jsonb
           AND pg_catalog.jsonb_typeof(v_detail -> 'before') <> 'string'
         ) THEN
        RAISE EXCEPTION 'CORRECTION_INVARIANT_VIOLATION' USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;

  IF pg_catalog.jsonb_typeof(v_meal_write) <> 'object'
     OR (
       SELECT pg_catalog.array_agg(key ORDER BY key)
       FROM pg_catalog.jsonb_object_keys(v_meal_write) AS keys(key)
     ) IS DISTINCT FROM ARRAY[
       'isSelfCooked', 'mealName', 'nutrition', 'portion', 'selectedMealPeriod', 'wasUserCorrected'
     ]::text[]
     OR pg_catalog.jsonb_typeof(v_meal_write -> 'selectedMealPeriod') <> 'string'
     OR pg_catalog.btrim(v_meal_write ->> 'selectedMealPeriod') = ''
     OR pg_catalog.jsonb_typeof(v_meal_write -> 'mealName') <> 'string'
     OR pg_catalog.btrim(v_meal_write ->> 'mealName') = ''
     OR pg_catalog.jsonb_typeof(v_meal_write -> 'isSelfCooked') <> 'boolean'
     OR pg_catalog.jsonb_typeof(v_meal_write -> 'wasUserCorrected') <> 'boolean'
     OR (
       v_meal_write -> 'portion' <> 'null'::jsonb
       AND pg_catalog.jsonb_typeof(v_meal_write -> 'portion') <> 'string'
     )
     OR pg_catalog.jsonb_typeof(v_meal_write -> 'nutrition') <> 'object' THEN
    RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
  END IF;

  FOR v_key, v_value IN
    SELECT key, value FROM pg_catalog.jsonb_each(v_meal_write -> 'nutrition')
  LOOP
    IF v_key NOT IN ('calories', 'protein', 'carbohydrates', 'fat', 'fiber')
       OR pg_catalog.jsonb_typeof(v_value) <> 'number'
       OR (v_value #>> '{}')::numeric < 0 THEN
      RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v_meal_name := pg_catalog.btrim(v_meal_write ->> 'mealName');
  v_portion := NULLIF(pg_catalog.btrim(v_meal_write ->> 'portion'), '');
  v_is_self_cooked := (v_meal_write ->> 'isSelfCooked')::boolean;
  v_was_user_corrected := (v_meal_write ->> 'wasUserCorrected')::boolean;
  v_original_detected_name := v_original -> 'detectedItemNames' ->> 0;

  IF v_selection_kind = 'catalog_item'
     AND (v_source_context = 'self_cooked' OR v_is_self_cooked) THEN
    RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;
  IF v_selection_kind = 'personal_unresolved'
     AND (
       (v_unresolved_reason = 'self_cooked' AND (v_source_context <> 'self_cooked' OR NOT v_is_self_cooked))
       OR (v_unresolved_reason <> 'self_cooked' AND (v_source_context = 'self_cooked' OR v_is_self_cooked))
     ) THEN
    RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;

  v_fingerprint := pg_catalog.jsonb_build_object(
    'operation', 'finalize_current_user_meal_identification_v1',
    'rpcContractVersion', 1,
    'mealType', p_meal_type::text,
    'occurredAt', p_occurred_at,
    'mealDate', p_meal_date,
    'timezone', pg_catalog.btrim(p_timezone),
    'finalization', p_finalization
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_client_request_id::text, 0)
  );

  SELECT *
  INTO v_existing
  FROM public.meal_records
  WHERE user_id = v_user_id
    AND client_request_id = p_client_request_id;

  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
    END IF;

    SELECT finalization.id, finalization.meal_record_item_id, finalization.meal_analysis_id
    INTO v_existing_finalization_id, v_existing_item_id, v_existing_analysis_id
    FROM public.meal_identification_finalizations AS finalization
    JOIN public.meal_record_items AS item
      ON item.id = finalization.meal_record_item_id
      AND item.meal_record_id = finalization.meal_record_id
      AND item.user_id = finalization.user_id
    JOIN public.meal_analyses AS analysis
      ON analysis.id = finalization.meal_analysis_id
      AND analysis.meal_record_id = finalization.meal_record_id
      AND analysis.user_id = finalization.user_id
    WHERE finalization.meal_record_id = v_existing.id
      AND finalization.user_id = v_user_id
      AND finalization.contract_version = 'meal-identification-finalization-v1'
      AND finalization.command_snapshot = p_finalization;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'DURABLE_STATE_INCONSISTENCY' USING ERRCODE = '23514';
    END IF;

    SELECT
      COALESCE(pg_catalog.jsonb_agg(correction.id ORDER BY correction.correction_ordinal), '[]'::jsonb),
      pg_catalog.count(*)::integer
    INTO v_existing_correction_ids, v_existing_correction_count
    FROM public.meal_corrections AS correction
    WHERE correction.meal_analysis_id = v_existing_analysis_id;

    IF v_existing_correction_count <> v_correction_count
       OR EXISTS (
         SELECT 1
         FROM public.meal_corrections AS correction
         WHERE correction.meal_analysis_id = v_existing_analysis_id
           AND (
             correction.meal_record_item_id IS DISTINCT FROM v_existing_item_id
             OR correction.user_id IS DISTINCT FROM v_user_id
             OR correction.correction_ordinal IS DISTINCT FROM (
             SELECT pg_catalog.count(*)::integer
             FROM public.meal_corrections AS earlier
             WHERE earlier.meal_analysis_id = correction.meal_analysis_id
               AND earlier.correction_ordinal < correction.correction_ordinal
             )
           )
       ) THEN
      RAISE EXCEPTION 'DURABLE_STATE_INCONSISTENCY' USING ERRCODE = '23514';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'replayed', true,
      'meal_record_id', v_existing.id,
      'meal_record_item_id', v_existing_item_id,
      'meal_analysis_id', v_existing_analysis_id,
      'meal_identification_finalization_id', v_existing_finalization_id,
      'meal_correction_ids', v_existing_correction_ids
    );
  END IF;

  IF v_selection_kind = 'catalog_item' THEN
    SELECT true
    INTO v_catalog_valid
    FROM public.restaurants AS restaurant
    JOIN public.restaurant_branches AS branch
      ON branch.id = v_branch_id
      AND branch.restaurant_id = restaurant.id
    JOIN public.menus AS menu
      ON menu.id = v_menu_id
      AND menu.restaurant_id = restaurant.id
    JOIN public.menu_categories AS category
      ON category.id = v_menu_category_id
      AND category.menu_id = menu.id
    JOIN public.menu_items AS item
      ON item.id = v_menu_item_id
      AND item.restaurant_id = restaurant.id
      AND item.menu_category_id = category.id
    JOIN public.branch_menu_items AS branch_item
      ON branch_item.id = v_branch_menu_item_id
      AND branch_item.restaurant_id = restaurant.id
      AND branch_item.branch_id = branch.id
      AND branch_item.menu_item_id = item.id
    WHERE restaurant.id = v_restaurant_id
      AND restaurant.status = 'active'
      AND branch.status = 'active'
      AND branch.is_active = true
      AND menu.status = 'published'
      AND item.status = 'active'
      AND branch_item.availability IN ('available', 'limited')
      AND branch_item.sold_out = false
      AND branch_item.branch_specific_status = 'available'
    FOR SHARE OF restaurant, branch, menu, category, item, branch_item;

    IF NOT FOUND OR NOT v_catalog_valid THEN
      RAISE EXCEPTION 'CATALOG_IDENTITY_REJECTED' USING ERRCODE = '23503';
    END IF;
  ELSIF v_restaurant_id IS NOT NULL
     OR v_branch_id IS NOT NULL
     OR v_menu_id IS NOT NULL
     OR v_menu_category_id IS NOT NULL
     OR v_menu_item_id IS NOT NULL
     OR v_branch_menu_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'IDENTITY_INVARIANT_VIOLATION' USING ERRCODE = '23514';
  END IF;

  v_source := CASE WHEN v_is_self_cooked THEN 'self_made' ELSE 'ai_estimated' END;
  v_nutrition_source := CASE WHEN v_was_user_corrected THEN 'user_corrected' ELSE 'ai_estimated' END;
  v_nutrition := v_meal_write -> 'nutrition';

  v_items := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'restaurantId', v_restaurant_id,
      'branchId', v_branch_id,
      'menuId', v_menu_id,
      'menuItemId', v_menu_item_id,
      'displayName', v_meal_name,
      'userEnteredName', CASE
        WHEN v_original_detected_name IS NOT NULL AND v_original_detected_name <> v_meal_name
          THEN v_meal_name
        ELSE NULL
      END,
      'aiDetectedName', v_original_detected_name,
      'normalizedName', NULL,
      'portion', v_portion,
      'nutrition', v_nutrition,
      'nutritionSource', v_nutrition_source::text,
      'sourceEntityVersion', NULL,
      'confidenceScore', NULL,
      'consumedRatio', 1
    )
  );

  v_created := public.create_current_user_meal_record(
    p_meal_type,
    p_occurred_at,
    p_meal_date,
    pg_catalog.btrim(p_timezone),
    v_meal_name,
    NULL,
    v_source,
    v_items
  );

  v_record_id := (v_created ->> 'id')::uuid;
  IF pg_catalog.jsonb_array_length(v_created -> 'meal_record_items') <> 1 THEN
    RAISE EXCEPTION 'DURABLE_STATE_INCONSISTENCY' USING ERRCODE = '23514';
  END IF;
  v_item_id := (v_created -> 'meal_record_items' -> 0 ->> 'id')::uuid;

  UPDATE public.meal_records
  SET client_request_id = p_client_request_id,
      request_fingerprint = v_fingerprint
  WHERE id = v_record_id
    AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OWNERSHIP_OR_AUTHORIZATION_REJECTED' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.meal_analyses (
    user_id,
    meal_record_id,
    source_photo_ids,
    model_name,
    model_version,
    estimated_nutrition,
    detected_items,
    confidence_score,
    analysis_status,
    analyzed_at
  )
  VALUES (
    v_user_id,
    v_record_id,
    ARRAY(
      SELECT value
      FROM pg_catalog.jsonb_array_elements_text(v_original -> 'photoReferences') AS photos(value)
    ),
    CASE WHEN v_model = 'null'::jsonb THEN NULL ELSE v_model ->> 'name' END,
    CASE WHEN v_model = 'null'::jsonb THEN NULL ELSE v_model ->> 'version' END,
    CASE
      WHEN v_original -> 'estimatedNutrition' = 'null'::jsonb THEN NULL
      ELSE v_original -> 'estimatedNutrition'
    END,
    v_original -> 'detectedItemNames',
    CASE
      WHEN v_original -> 'confidence' = 'null'::jsonb THEN NULL
      ELSE (v_original ->> 'confidence')::numeric
    END,
    v_original ->> 'status',
    v_analyzed_at
  )
  RETURNING id INTO v_analysis_id;

  FOR v_event, v_event_index IN
    SELECT value, ordinality::integer - 1
    FROM pg_catalog.jsonb_array_elements(v_corrections) WITH ORDINALITY
  LOOP
    v_detail := v_event -> 'detail';
    INSERT INTO public.meal_corrections (
      user_id,
      meal_analysis_id,
      meal_record_item_id,
      correction_type,
      before_value,
      after_value,
      correction_reason,
      corrected_at,
      correction_ordinal
    )
    VALUES (
      v_user_id,
      v_analysis_id,
      v_item_id,
      CASE
        WHEN v_detail ->> 'correctionType' = 'unknown' THEN v_detail ->> 'rawCorrectionType'
        ELSE v_detail ->> 'correctionType'
      END,
      CASE
        WHEN v_detail ->> 'correctionType' = 'unknown' THEN NULL
        WHEN v_detail -> 'before' = 'null'::jsonb THEN NULL
        ELSE v_detail -> 'before'
      END,
      v_detail -> 'after',
      CASE
        WHEN v_event -> 'correctionReason' = 'null'::jsonb THEN NULL
        ELSE v_event ->> 'correctionReason'
      END,
      (v_event ->> 'correctedAt')::timestamptz,
      v_event_index
    );
  END LOOP;

  IF v_correction_count > 0 THEN
    UPDATE public.meal_record_items
    SET correction_status = 'confirmed'::public.meal_correction_status,
        updated_at = pg_catalog.now()
    WHERE id = v_item_id
      AND meal_record_id = v_record_id
      AND user_id = v_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'OWNERSHIP_OR_AUTHORIZATION_REJECTED' USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.meal_identification_finalizations (
    user_id,
    meal_record_id,
    meal_record_item_id,
    meal_analysis_id,
    contract_version,
    source_context,
    selection_kind,
    unresolved_reason,
    identity_validation_status,
    restaurant_id,
    branch_id,
    menu_id,
    menu_category_id,
    menu_item_id,
    branch_menu_item_id,
    command_snapshot
  )
  VALUES (
    v_user_id,
    v_record_id,
    v_item_id,
    v_analysis_id,
    'meal-identification-finalization-v1',
    v_source_context,
    v_selection_kind,
    v_unresolved_reason,
    CASE WHEN v_selection_kind = 'catalog_item' THEN 'server_validated' ELSE 'not_applicable' END,
    v_restaurant_id,
    v_branch_id,
    v_menu_id,
    v_menu_category_id,
    v_menu_item_id,
    v_branch_menu_item_id,
    p_finalization
  )
  RETURNING id INTO v_finalization_id;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(correction.id ORDER BY correction.correction_ordinal),
    '[]'::jsonb
  )
  INTO v_correction_ids
  FROM public.meal_corrections AS correction
  WHERE correction.meal_analysis_id = v_analysis_id
    AND correction.meal_record_item_id = v_item_id
    AND correction.user_id = v_user_id;

  RETURN pg_catalog.jsonb_build_object(
    'replayed', false,
    'meal_record_id', v_record_id,
    'meal_record_item_id', v_item_id,
    'meal_analysis_id', v_analysis_id,
    'meal_identification_finalization_id', v_finalization_id,
    'meal_correction_ids', v_correction_ids
  );
EXCEPTION WHEN OTHERS THEN
  v_error_state := SQLSTATE;
  v_error_message := SQLERRM;

  -- Preserve only deliberately typed, token-only errors and strip all detail/hint
  -- fields. Native constraint or parser messages are mapped to stable categories.
  IF v_error_state IN ('28000', '22023', '23503', '23514', '23505', '42501')
     AND v_error_message ~ '^[A-Z0-9_]+$' THEN
    RAISE EXCEPTION '%', v_error_message USING ERRCODE = v_error_state;
  ELSIF v_error_state = '23505' THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_CONFLICT' USING ERRCODE = '23505';
  ELSIF v_error_state IN ('23503', '23514') THEN
    RAISE EXCEPTION 'DURABLE_STATE_INCONSISTENCY' USING ERRCODE = '23514';
  ELSIF v_error_state = '42501' THEN
    RAISE EXCEPTION 'OWNERSHIP_OR_AUTHORIZATION_REJECTED' USING ERRCODE = '42501';
  ELSIF v_error_state LIKE '22%' THEN
    RAISE EXCEPTION 'INVALID_FINALIZATION' USING ERRCODE = '22023';
  ELSE
    RAISE EXCEPTION 'DURABLE_FINALIZATION_FAILED' USING ERRCODE = 'P0001';
  END IF;
END;
$function$
;

-- Exact core RPC: persist_authenticated_daily_nutrition_summary(p_summary_date date, p_timezone text, p_calculation_version text, p_total_calories numeric, p_total_protein_g numeric, p_total_carbohydrates_g numeric, p_total_fat_g numeric, p_total_fiber_g numeric, p_meal_count integer, p_item_count integer, p_source_cutoff_at timestamp with time zone, p_recalculated_at timestamp with time zone)
CREATE OR REPLACE FUNCTION public.persist_authenticated_daily_nutrition_summary(p_summary_date date, p_timezone text DEFAULT 'Asia/Taipei'::text, p_calculation_version text DEFAULT 'consumer-daily-summary-v1'::text, p_total_calories numeric DEFAULT 0, p_total_protein_g numeric DEFAULT 0, p_total_carbohydrates_g numeric DEFAULT 0, p_total_fat_g numeric DEFAULT 0, p_total_fiber_g numeric DEFAULT NULL::numeric, p_meal_count integer DEFAULT 0, p_item_count integer DEFAULT NULL::integer, p_source_cutoff_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_recalculated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_summary public.daily_nutrition_summaries%rowtype;
begin
  perform consumer_internal.require_core(auth.uid());
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
$function$
;

-- Exact core RPC: read_authenticated_allergy_settings_v1()
CREATE OR REPLACE FUNCTION public.read_authenticated_allergy_settings_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_allergen_keys jsonb;
  v_unresolved_count integer;
begin
  perform consumer_internal.require_core(auth.uid());
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  with governed as (
    select
      restriction.source_vocabulary_id,
      restriction.source_vocabulary_version,
      restriction.source_value_key,
      mapping.target_allergen_key
    from public.dietary_restrictions as restriction
    left join public.private_restriction_allergen_source_vocabularies as vocabulary
      on vocabulary.source_vocabulary_id = restriction.source_vocabulary_id
     and vocabulary.source_vocabulary_version = restriction.source_vocabulary_version
     and vocabulary.source_domain = 'allergy'
     and vocabulary.active
     and vocabulary.retired_at is null
    left join public.private_restriction_allergen_source_values as source
      on source.source_vocabulary_id = restriction.source_vocabulary_id
     and source.source_vocabulary_version = restriction.source_vocabulary_version
     and source.source_value_key = restriction.source_value_key
     and source.active
     and source.retired_at is null
    left join public.private_restriction_allergen_normalization_mappings as mapping
      on mapping.normalization_policy_id = 'private-restriction-allergen-normalization-v1'
     and mapping.normalization_policy_version = 1
     and mapping.source_vocabulary_id = restriction.source_vocabulary_id
     and mapping.source_vocabulary_version = restriction.source_vocabulary_version
     and mapping.source_value_key = restriction.source_value_key
     and mapping.normalized_source_value = restriction.source_value_key
     and mapping.target_taxonomy_id = 'tastkind-allergen-tw-v1'
     and mapping.target_taxonomy_version = 1
     and mapping.active
     and mapping.retired_at is null
    left join public.private_restriction_allergen_normalization_policies as policy
      on policy.normalization_policy_id = mapping.normalization_policy_id
     and policy.normalization_policy_version = mapping.normalization_policy_version
     and policy.active
     and policy.retired_at is null
    left join public.candidate_allergen_taxonomies as taxonomy
      on taxonomy.taxonomy_id = mapping.target_taxonomy_id
     and taxonomy.taxonomy_version = mapping.target_taxonomy_version
     and taxonomy.active
     and taxonomy.retired_at is null
    left join public.candidate_allergen_values as target
      on target.taxonomy_id = mapping.target_taxonomy_id
     and target.taxonomy_version = mapping.target_taxonomy_version
     and target.allergen_key = mapping.target_allergen_key
     and target.active
     and target.retired_at is null
    where restriction.user_id = v_user_id
      and restriction.source_vocabulary_id is not null
      and vocabulary.source_vocabulary_id is not null
      and source.source_value_key is not null
      and policy.normalization_policy_id is not null
      and taxonomy.taxonomy_id is not null
      and target.allergen_key is not null
  )
  select coalesce(pg_catalog.jsonb_agg(distinct target_allergen_key order by target_allergen_key), '[]'::jsonb)
  into v_allergen_keys
  from governed;

  select pg_catalog.count(*)::integer
  into v_unresolved_count
  from public.dietary_restrictions as restriction
  where restriction.user_id = v_user_id
    and restriction.source_vocabulary_id is not null
    and not exists (
      select 1
      from public.private_restriction_allergen_source_vocabularies as vocabulary
      join public.private_restriction_allergen_source_values as source
        on source.source_vocabulary_id = vocabulary.source_vocabulary_id
       and source.source_vocabulary_version = vocabulary.source_vocabulary_version
      join public.private_restriction_allergen_normalization_mappings as mapping
        on mapping.source_vocabulary_id = source.source_vocabulary_id
       and mapping.source_vocabulary_version = source.source_vocabulary_version
       and mapping.source_value_key = source.source_value_key
      join public.private_restriction_allergen_normalization_policies as policy
        on policy.normalization_policy_id = mapping.normalization_policy_id
       and policy.normalization_policy_version = mapping.normalization_policy_version
      join public.candidate_allergen_taxonomies as taxonomy
        on taxonomy.taxonomy_id = mapping.target_taxonomy_id
       and taxonomy.taxonomy_version = mapping.target_taxonomy_version
      join public.candidate_allergen_values as target
        on target.taxonomy_id = mapping.target_taxonomy_id
       and target.taxonomy_version = mapping.target_taxonomy_version
       and target.allergen_key = mapping.target_allergen_key
      where vocabulary.source_vocabulary_id = restriction.source_vocabulary_id
        and vocabulary.source_vocabulary_version = restriction.source_vocabulary_version
        and vocabulary.source_domain = 'allergy'
        and vocabulary.active and vocabulary.retired_at is null
        and source.source_value_key = restriction.source_value_key
        and source.active and source.retired_at is null
        and mapping.normalization_policy_id = 'private-restriction-allergen-normalization-v1'
        and mapping.normalization_policy_version = 1
        and mapping.normalized_source_value = restriction.source_value_key
        and mapping.target_taxonomy_id = 'tastkind-allergen-tw-v1'
        and mapping.target_taxonomy_version = 1
        and mapping.active and mapping.retired_at is null
        and policy.active and policy.retired_at is null
        and taxonomy.active and taxonomy.retired_at is null
        and target.active and target.retired_at is null
    );

  return pg_catalog.jsonb_build_object(
    'source_vocabulary_id', 'private-restriction-allergen-v1',
    'source_vocabulary_version', 1,
    'taxonomy_id', 'tastkind-allergen-tw-v1',
    'taxonomy_version', 1,
    'allergen_keys', v_allergen_keys,
    'unresolved_selection_count', v_unresolved_count
  );
end;
$function$
;

-- Exact core RPC: read_authenticated_ingredient_avoidance_settings_v1()
CREATE OR REPLACE FUNCTION public.read_authenticated_ingredient_avoidance_settings_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_keys jsonb;
  v_unresolved_count integer;
begin
  perform consumer_internal.require_core(auth.uid());
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  with governed as (
    select
      setting.source_value_key,
      mapping.target_ingredient_avoidance_key
    from public.private_user_ingredient_avoidance_settings as setting
    left join public.private_ingredient_avoidance_source_vocabularies as vocabulary
      on vocabulary.source_vocabulary_id = setting.source_vocabulary_id
     and vocabulary.source_vocabulary_version = setting.source_vocabulary_version
     and vocabulary.source_domain = 'ingredient_avoidance'
     and vocabulary.active
     and vocabulary.retired_at is null
    left join public.private_ingredient_avoidance_source_values as source
      on source.source_vocabulary_id = setting.source_vocabulary_id
     and source.source_vocabulary_version = setting.source_vocabulary_version
     and source.source_value_key = setting.source_value_key
     and source.active
     and source.retired_at is null
    left join public.private_ingredient_avoidance_normalization_mappings as mapping
      on mapping.normalization_policy_id = 'private-ingredient-avoidance-normalization-v1'
     and mapping.normalization_policy_version = 1
     and mapping.source_vocabulary_id = setting.source_vocabulary_id
     and mapping.source_vocabulary_version = setting.source_vocabulary_version
     and mapping.source_value_key = setting.source_value_key
     and mapping.normalized_source_value = setting.source_value_key
     and mapping.target_taxonomy_id = 'tastkind-ingredient-avoidance-v1'
     and mapping.target_taxonomy_version = 1
     and mapping.active
     and mapping.retired_at is null
    left join public.private_ingredient_avoidance_normalization_policies as policy
      on policy.normalization_policy_id = mapping.normalization_policy_id
     and policy.normalization_policy_version = mapping.normalization_policy_version
     and policy.active
     and policy.retired_at is null
    left join public.candidate_ingredient_avoidance_taxonomies as taxonomy
      on taxonomy.taxonomy_id = mapping.target_taxonomy_id
     and taxonomy.taxonomy_version = mapping.target_taxonomy_version
     and taxonomy.fact_domain = 'ingredient_avoidance_content'
     and taxonomy.active
     and taxonomy.retired_at is null
    left join public.candidate_ingredient_avoidance_values as target
      on target.taxonomy_id = mapping.target_taxonomy_id
     and target.taxonomy_version = mapping.target_taxonomy_version
     and target.ingredient_avoidance_key = mapping.target_ingredient_avoidance_key
     and target.active
     and target.retired_at is null
    where setting.user_id = v_user_id
      and setting.source_vocabulary_id = 'private-ingredient-avoidance-v1'
      and setting.source_vocabulary_version = 1
      and vocabulary.source_vocabulary_id is not null
      and source.source_value_key is not null
      and policy.normalization_policy_id is not null
      and taxonomy.taxonomy_id is not null
      and target.ingredient_avoidance_key is not null
  )
  select coalesce(
    pg_catalog.jsonb_agg(distinct target_ingredient_avoidance_key
      order by target_ingredient_avoidance_key),
    '[]'::jsonb
  )
  into v_keys
  from governed;

  select pg_catalog.count(*)::integer
  into v_unresolved_count
  from public.private_user_ingredient_avoidance_settings as setting
  where setting.user_id = v_user_id
    and setting.source_vocabulary_id = 'private-ingredient-avoidance-v1'
    and setting.source_vocabulary_version = 1
    and not exists (
      select 1
      from public.private_ingredient_avoidance_source_vocabularies as vocabulary
      join public.private_ingredient_avoidance_source_values as source
        on source.source_vocabulary_id = vocabulary.source_vocabulary_id
       and source.source_vocabulary_version = vocabulary.source_vocabulary_version
      join public.private_ingredient_avoidance_normalization_mappings as mapping
        on mapping.source_vocabulary_id = source.source_vocabulary_id
       and mapping.source_vocabulary_version = source.source_vocabulary_version
       and mapping.source_value_key = source.source_value_key
      join public.private_ingredient_avoidance_normalization_policies as policy
        on policy.normalization_policy_id = mapping.normalization_policy_id
       and policy.normalization_policy_version = mapping.normalization_policy_version
      join public.candidate_ingredient_avoidance_taxonomies as taxonomy
        on taxonomy.taxonomy_id = mapping.target_taxonomy_id
       and taxonomy.taxonomy_version = mapping.target_taxonomy_version
      join public.candidate_ingredient_avoidance_values as target
        on target.taxonomy_id = mapping.target_taxonomy_id
       and target.taxonomy_version = mapping.target_taxonomy_version
       and target.ingredient_avoidance_key = mapping.target_ingredient_avoidance_key
      where vocabulary.source_vocabulary_id = setting.source_vocabulary_id
        and vocabulary.source_vocabulary_version = setting.source_vocabulary_version
        and vocabulary.source_domain = 'ingredient_avoidance'
        and vocabulary.active and vocabulary.retired_at is null
        and source.source_value_key = setting.source_value_key
        and source.active and source.retired_at is null
        and mapping.normalization_policy_id = 'private-ingredient-avoidance-normalization-v1'
        and mapping.normalization_policy_version = 1
        and mapping.normalized_source_value = setting.source_value_key
        and mapping.target_taxonomy_id = 'tastkind-ingredient-avoidance-v1'
        and mapping.target_taxonomy_version = 1
        and mapping.active and mapping.retired_at is null
        and policy.active and policy.retired_at is null
        and taxonomy.fact_domain = 'ingredient_avoidance_content'
        and taxonomy.active and taxonomy.retired_at is null
        and target.active and target.retired_at is null
    );

  return pg_catalog.jsonb_build_object(
    'source_vocabulary_id', 'private-ingredient-avoidance-v1',
    'source_vocabulary_version', 1,
    'taxonomy_id', 'tastkind-ingredient-avoidance-v1',
    'taxonomy_version', 1,
    'ingredient_avoidance_keys', v_keys,
    'unresolved_selection_count', v_unresolved_count
  );
end;
$function$
;

-- Exact core RPC: record_authenticated_recommendation_feedback_event(p_session_id uuid, p_action text, p_target_kind text, p_event_idempotency_key text, p_recommendation_id text, p_restaurant_id text, p_branch_id text, p_menu_item_id text)
CREATE OR REPLACE FUNCTION public.record_authenticated_recommendation_feedback_event(p_session_id uuid, p_action text, p_target_kind text, p_event_idempotency_key text, p_recommendation_id text DEFAULT NULL::text, p_restaurant_id text DEFAULT NULL::text, p_branch_id text DEFAULT NULL::text, p_menu_item_id text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id            uuid                          := auth.uid();
  v_session            public.recommendation_sessions%rowtype;
  v_action             public.recommendation_feedback_action;
  v_target_kind        text;
  v_recommendation_id  text;
  v_restaurant_id      text;
  v_branch_id          text;
  v_menu_item_id       text;
  v_event_key          text;
  v_existing           public.recommendation_feedback%rowtype;
  v_new_id             uuid;
  v_row_count          int;
  v_ts                 timestamptz;
  v_shown_at           timestamptz := null;
  v_clicked_at         timestamptz := null;
  v_accepted_at        timestamptz := null;
  v_dismissed_at       timestamptz := null;
  v_saved_at           timestamptz := null;
  v_consumed_at        timestamptz := null;
begin
  perform consumer_internal.require_core(auth.uid());
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  -- Validate idempotency key: trim, nonempty, bounded length, no control characters.
  -- Invalid key → write_failed with sanitized error_code; no internal identifier leaks.
  v_event_key := pg_catalog.btrim(p_event_idempotency_key);
  if v_event_key is null or v_event_key = '' then
    return pg_catalog.jsonb_build_object('status', 'write_failed', 'error_code', 'event_key_invalid');
  end if;
  if pg_catalog.length(v_event_key) > 500 then
    return pg_catalog.jsonb_build_object('status', 'write_failed', 'error_code', 'event_key_invalid');
  end if;
  if v_event_key ~ E'[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]' then
    return pg_catalog.jsonb_build_object('status', 'write_failed', 'error_code', 'event_key_invalid');
  end if;

  -- Validate and cast action to enum; NULL or invalid string → invalid_action.
  -- Authenticated callers may invoke the RPC directly without service pre-validation.
  if p_action is null then
    return pg_catalog.jsonb_build_object('status', 'invalid_action');
  end if;
  begin
    v_action := p_action::public.recommendation_feedback_action;
  exception when invalid_text_representation then
    return pg_catalog.jsonb_build_object('status', 'invalid_action');
  end;

  -- Validate target kind.
  v_target_kind := pg_catalog.btrim(p_target_kind);
  if v_target_kind is null or v_target_kind not in ('recommendation', 'restaurant', 'menu_item') then
    return pg_catalog.jsonb_build_object('status', 'invalid_target');
  end if;

  -- Exact target shape: reject identity fields that don't belong to the declared target kind.
  -- recommendation: only recommendation_id is allowed; restaurant_id, menu_item_id, branch_id must be null.
  -- restaurant: only restaurant_id (and optional branch_id) are allowed; recommendation_id and menu_item_id must be null.
  -- menu_item: only restaurant_id, menu_item_id (and optional branch_id) are allowed; recommendation_id must be null.
  if v_target_kind = 'recommendation' then
    if p_restaurant_id is not null or p_menu_item_id is not null or p_branch_id is not null then
      return pg_catalog.jsonb_build_object('status', 'invalid_target');
    end if;
  elsif v_target_kind = 'restaurant' then
    if p_recommendation_id is not null or p_menu_item_id is not null then
      return pg_catalog.jsonb_build_object('status', 'invalid_target');
    end if;
  elsif v_target_kind = 'menu_item' then
    if p_recommendation_id is not null then
      return pg_catalog.jsonb_build_object('status', 'invalid_target');
    end if;
  end if;

  -- Per-kind target field validation and catalog existence verification.
  if v_target_kind = 'recommendation' then
    v_recommendation_id := nullif(pg_catalog.btrim(p_recommendation_id), '');
    if v_recommendation_id is null then
      return pg_catalog.jsonb_build_object('status', 'invalid_target');
    end if;
    if pg_catalog.length(v_recommendation_id) > 500 then
      return pg_catalog.jsonb_build_object('status', 'invalid_target');
    end if;
    if v_recommendation_id ~ E'[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f\\x7f]' then
      return pg_catalog.jsonb_build_object('status', 'invalid_target');
    end if;
    if pg_catalog.left(v_recommendation_id, 4) = 'fav-' then
      return pg_catalog.jsonb_build_object('status', 'invalid_target');
    end if;
    -- NOTE: recommendation_id has no catalog table. Existence check is a Development hard gate.
    -- See Phase 2Y-D-B runbook: deploy with a controlled test recommendation_id.

  elsif v_target_kind = 'restaurant' then
    v_restaurant_id := nullif(pg_catalog.btrim(p_restaurant_id), '');
    if v_restaurant_id is null then
      return pg_catalog.jsonb_build_object('status', 'invalid_target');
    end if;
    if pg_catalog.length(v_restaurant_id) > 500 then
      return pg_catalog.jsonb_build_object('status', 'invalid_target');
    end if;
    if pg_catalog.left(v_restaurant_id, 4) = 'fav-' then
      return pg_catalog.jsonb_build_object('status', 'invalid_target');
    end if;
    perform 1 from public.restaurants as r where r.id = v_restaurant_id for key share;
    if not found then
      return pg_catalog.jsonb_build_object('status', 'invalid_target');
    end if;
    -- branch_id: verify existence and parent relationship via restaurant_branches catalog.
    if p_branch_id is not null then
      v_branch_id := nullif(pg_catalog.btrim(p_branch_id), '');
      if v_branch_id is not null then
        if pg_catalog.length(v_branch_id) > 500 then
          return pg_catalog.jsonb_build_object('status', 'invalid_target');
        end if;
        if pg_catalog.left(v_branch_id, 4) = 'fav-' then
          return pg_catalog.jsonb_build_object('status', 'invalid_target');
        end if;
        perform 1 from public.restaurant_branches as rb
        where rb.id = v_branch_id and rb.restaurant_id = v_restaurant_id
        for key share;
        if not found then
          return pg_catalog.jsonb_build_object('status', 'invalid_target');
        end if;
      end if;
    end if;

  elsif v_target_kind = 'menu_item' then
    v_restaurant_id := nullif(pg_catalog.btrim(p_restaurant_id), '');
    v_menu_item_id  := nullif(pg_catalog.btrim(p_menu_item_id), '');
    if v_restaurant_id is null then
      return pg_catalog.jsonb_build_object('status', 'invalid_target');
    end if;
    if v_menu_item_id is null then
      return pg_catalog.jsonb_build_object('status', 'invalid_target');
    end if;
    if pg_catalog.length(v_restaurant_id) > 500 then
      return pg_catalog.jsonb_build_object('status', 'invalid_target');
    end if;
    if pg_catalog.length(v_menu_item_id) > 500 then
      return pg_catalog.jsonb_build_object('status', 'invalid_target');
    end if;
    if pg_catalog.left(v_restaurant_id, 4) = 'fav-' then
      return pg_catalog.jsonb_build_object('status', 'invalid_target');
    end if;
    if pg_catalog.left(v_menu_item_id, 4) = 'fav-' then
      return pg_catalog.jsonb_build_object('status', 'invalid_target');
    end if;
    perform 1 from public.restaurants as r where r.id = v_restaurant_id for key share;
    if not found then
      return pg_catalog.jsonb_build_object('status', 'invalid_target');
    end if;
    perform 1
    from public.menu_items as mi
    where mi.id = v_menu_item_id and mi.restaurant_id = v_restaurant_id
    for key share;
    if not found then
      return pg_catalog.jsonb_build_object('status', 'invalid_target');
    end if;
    -- branch_id: verify existence and parent relationship via restaurant_branches catalog.
    if p_branch_id is not null then
      v_branch_id := nullif(pg_catalog.btrim(p_branch_id), '');
      if v_branch_id is not null then
        if pg_catalog.length(v_branch_id) > 500 then
          return pg_catalog.jsonb_build_object('status', 'invalid_target');
        end if;
        if pg_catalog.left(v_branch_id, 4) = 'fav-' then
          return pg_catalog.jsonb_build_object('status', 'invalid_target');
        end if;
        perform 1 from public.restaurant_branches as rb
        where rb.id = v_branch_id and rb.restaurant_id = v_restaurant_id
        for key share;
        if not found then
          return pg_catalog.jsonb_build_object('status', 'invalid_target');
        end if;
      end if;
    end if;
  end if;

  -- Verify owned active session (fail closed: no cross-actor session existence leak).
  select * into v_session
  from   public.recommendation_sessions
  where  id      = p_session_id
    and  user_id = v_user_id;

  if not found then
    return pg_catalog.jsonb_build_object('status', 'session_not_found');
  end if;

  -- No writes to ended sessions.
  if v_session.ended_at is not null then
    return pg_catalog.jsonb_build_object('status', 'invalid_session');
  end if;

  -- Map exactly one action timestamp column; all others remain NULL.
  v_ts := pg_catalog.clock_timestamp();
  case v_action
    when 'shown'     then v_shown_at     := v_ts;
    when 'clicked'   then v_clicked_at   := v_ts;
    when 'accepted'  then v_accepted_at  := v_ts;
    when 'dismissed' then v_dismissed_at := v_ts;
    when 'saved'     then v_saved_at     := v_ts;
    when 'consumed'  then v_consumed_at  := v_ts;
  end case;

  -- Idempotent insert: unique on (user_id, event_idempotency_key).
  insert into public.recommendation_feedback (
    user_id, recommendation_session_id,
    recommendation_id, restaurant_id, branch_id, menu_item_id,
    action,
    shown_at, clicked_at, accepted_at, dismissed_at, saved_at, consumed_at,
    source_surface, event_idempotency_key, schema_version
  ) values (
    v_user_id, p_session_id,
    v_recommendation_id, v_restaurant_id, v_branch_id, v_menu_item_id,
    v_action,
    v_shown_at, v_clicked_at, v_accepted_at, v_dismissed_at, v_saved_at, v_consumed_at,
    v_session.source_surface, v_event_key, 'consumer-recommendation-feedback-v1'
  )
  on conflict (user_id, event_idempotency_key) do nothing
  returning id into v_new_id;

  get diagnostics v_row_count = row_count;

  if v_row_count > 0 then
    return pg_catalog.jsonb_build_object(
      'status',      'recorded',
      'feedback_id', v_new_id
    );
  end if;

  -- Conflict: idempotency key already used. Read existing row to classify.
  select * into v_existing
  from   public.recommendation_feedback
  where  user_id               = v_user_id
    and  event_idempotency_key = v_event_key;

  -- Immutable payload comparison: session, action, target identity (including branch_id), derived source_surface.
  -- branch_id is included because it is a persisted immutable event field, even though it is not catalog identity.
  -- Null-safe equality (IS NOT DISTINCT FROM) handles absent optional fields correctly.
  if v_existing.recommendation_session_id = p_session_id
     and v_existing.action = v_action
     and v_existing.recommendation_id   is not distinct from v_recommendation_id
     and v_existing.restaurant_id       is not distinct from v_restaurant_id
     and v_existing.branch_id           is not distinct from v_branch_id
     and v_existing.menu_item_id        is not distinct from v_menu_item_id
     and v_existing.source_surface      = v_session.source_surface
  then
    return pg_catalog.jsonb_build_object('status', 'already_recorded');
  end if;

  return pg_catalog.jsonb_build_object('status', 'idempotency_conflict');
end;
$function$
;

-- Exact core RPC: remove_authenticated_menu_item_favorite(p_restaurant_id text, p_menu_item_id text)
CREATE OR REPLACE FUNCTION public.remove_authenticated_menu_item_favorite(p_restaurant_id text, p_menu_item_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_restaurant_id text := nullif(pg_catalog.btrim(p_restaurant_id), '');
  v_menu_item_id text := nullif(pg_catalog.btrim(p_menu_item_id), '');
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_row public.favorite_menu_items%rowtype;
begin
  perform consumer_internal.require_core(auth.uid());
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;
  if v_restaurant_id is null then
    raise exception 'FAVORITE_RESTAURANT_ID_REQUIRED' using errcode = '22023';
  end if;
  if v_menu_item_id is null then
    raise exception 'FAVORITE_MENU_ITEM_ID_REQUIRED' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':favorite_menu_item:' || v_menu_item_id, 0)
  );

  select fmi.*
  into v_row
  from public.favorite_menu_items as fmi
  where fmi.user_id = v_user_id
    and fmi.menu_item_id = v_menu_item_id
    and fmi.removed_at is null;

  if v_row.id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'already_absent',
      'target_kind', 'menu_item',
      'restaurant_id', v_restaurant_id,
      'menu_item_id', v_menu_item_id
    );
  end if;
  if v_row.restaurant_id <> v_restaurant_id then
    raise exception 'FAVORITE_MENU_ITEM_ACTIVE_PARENT_CONFLICT' using errcode = '22023';
  end if;

  update public.favorite_menu_items
  set removed_at = v_now
  where id = v_row.id
    and user_id = v_user_id
    and removed_at is null
  returning * into v_row;

  if v_row.id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'already_absent',
      'target_kind', 'menu_item',
      'restaurant_id', v_restaurant_id,
      'menu_item_id', v_menu_item_id
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'removed',
    'target_kind', 'menu_item',
    'restaurant_id', v_row.restaurant_id,
    'menu_item_id', v_row.menu_item_id,
    'favorite_id', v_row.id,
    'collection_label', v_row.collection_label,
    'sort_order', v_row.sort_order,
    'created_at', v_row.created_at,
    'active', false
  );
end;
$function$
;

-- Exact core RPC: remove_authenticated_restaurant_favorite(p_restaurant_id text)
CREATE OR REPLACE FUNCTION public.remove_authenticated_restaurant_favorite(p_restaurant_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_restaurant_id text := nullif(pg_catalog.btrim(p_restaurant_id), '');
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_row public.favorite_restaurants%rowtype;
begin
  perform consumer_internal.require_core(auth.uid());
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;
  if v_restaurant_id is null then
    raise exception 'FAVORITE_RESTAURANT_ID_REQUIRED' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':favorite_restaurant:' || v_restaurant_id, 0)
  );

  update public.favorite_restaurants
  set removed_at = v_now
  where user_id = v_user_id
    and restaurant_id = v_restaurant_id
    and removed_at is null
  returning * into v_row;

  if v_row.id is null then
    return pg_catalog.jsonb_build_object(
      'status', 'already_absent',
      'target_kind', 'restaurant',
      'restaurant_id', v_restaurant_id
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'removed',
    'target_kind', 'restaurant',
    'restaurant_id', v_row.restaurant_id,
    'favorite_id', v_row.id,
    'collection_label', v_row.collection_label,
    'sort_order', v_row.sort_order,
    'created_at', v_row.created_at,
    'active', false
  );
end;
$function$
;

-- Exact core RPC: remove_authenticated_planned_meal(p_planned_meal_id uuid)
CREATE OR REPLACE FUNCTION public.remove_authenticated_planned_meal(p_planned_meal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_existing public.planned_meals%rowtype;
begin
  perform consumer_internal.require_core(auth.uid());
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  if p_planned_meal_id is null then
    raise exception 'PLANNED_MEAL_ID_REQUIRED' using errcode = '22023';
  end if;

  select * into v_existing from public.planned_meals where id = p_planned_meal_id and user_id = v_user_id;
  if not found then
    return jsonb_build_object('found', false, 'already_cancelled', false);
  end if;

  if v_existing.status = 'cancelled' then
    return jsonb_build_object('found', true, 'already_cancelled', true, 'planned_meal_id', v_existing.id);
  end if;

  update public.planned_meals
    set status = 'cancelled', updated_at = now()
  where id = p_planned_meal_id and user_id = v_user_id;

  return jsonb_build_object(
    'found', true,
    'already_cancelled', false,
    'planned_meal_id', v_existing.id,
    'status', 'cancelled'
  );
end;
$function$
;

-- Exact core RPC: replace_authenticated_allergy_settings_v1(p_source_value_keys text[])
CREATE OR REPLACE FUNCTION public.replace_authenticated_allergy_settings_v1(p_source_value_keys text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_keys text[] := coalesce(p_source_value_keys, '{}'::text[]);
  v_key_count integer;
  v_distinct_count integer;
  v_invalid_key text;
begin
  perform consumer_internal.require_core(auth.uid());
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;
  if pg_catalog.array_position(v_keys, null::text) is not null then
    raise exception 'ALLERGY_SOURCE_KEY_INVALID' using errcode = '22023';
  end if;
  if exists (select 1 from pg_catalog.unnest(v_keys) as key where key <> pg_catalog.btrim(key) or key = '') then
    raise exception 'ALLERGY_SOURCE_KEY_INVALID' using errcode = '22023';
  end if;

  v_key_count := coalesce(pg_catalog.array_length(v_keys, 1), 0);
  select pg_catalog.count(distinct key)::integer into v_distinct_count
  from pg_catalog.unnest(v_keys) as key;
  if v_key_count <> v_distinct_count then
    raise exception 'ALLERGY_SOURCE_KEY_DUPLICATE' using errcode = '23505';
  end if;
  if v_key_count > 11 then
    raise exception 'ALLERGY_SOURCE_KEY_LIMIT_EXCEEDED' using errcode = '22023';
  end if;

  select candidate.key
  into v_invalid_key
  from pg_catalog.unnest(v_keys) as candidate(key)
  where not exists (
    select 1
    from public.private_restriction_allergen_source_vocabularies as vocabulary
    join public.private_restriction_allergen_source_values as source
      on source.source_vocabulary_id = vocabulary.source_vocabulary_id
     and source.source_vocabulary_version = vocabulary.source_vocabulary_version
    join public.private_restriction_allergen_normalization_mappings as mapping
      on mapping.source_vocabulary_id = source.source_vocabulary_id
     and mapping.source_vocabulary_version = source.source_vocabulary_version
     and mapping.source_value_key = source.source_value_key
    join public.private_restriction_allergen_normalization_policies as policy
      on policy.normalization_policy_id = mapping.normalization_policy_id
     and policy.normalization_policy_version = mapping.normalization_policy_version
    join public.candidate_allergen_taxonomies as taxonomy
      on taxonomy.taxonomy_id = mapping.target_taxonomy_id
     and taxonomy.taxonomy_version = mapping.target_taxonomy_version
    join public.candidate_allergen_values as target
      on target.taxonomy_id = mapping.target_taxonomy_id
     and target.taxonomy_version = mapping.target_taxonomy_version
     and target.allergen_key = mapping.target_allergen_key
    where vocabulary.source_vocabulary_id = 'private-restriction-allergen-v1'
      and vocabulary.source_vocabulary_version = 1
      and vocabulary.source_domain = 'allergy'
      and vocabulary.active and vocabulary.retired_at is null
      and source.source_value_key = candidate.key
      and source.active and source.retired_at is null
      and mapping.normalization_policy_id = 'private-restriction-allergen-normalization-v1'
      and mapping.normalization_policy_version = 1
      and mapping.normalized_source_value = candidate.key
      and mapping.target_taxonomy_id = 'tastkind-allergen-tw-v1'
      and mapping.target_taxonomy_version = 1
      and mapping.active and mapping.retired_at is null
      and policy.active and policy.retired_at is null
      and taxonomy.active and taxonomy.retired_at is null
      and target.active and target.retired_at is null
  )
  limit 1;
  if v_invalid_key is not null then
    raise exception 'ALLERGY_SOURCE_KEY_NOT_ACTIVE' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':allergy_settings:v1', 0)
  );

  delete from public.dietary_restrictions as restriction
  where restriction.user_id = v_user_id
    and restriction.source_vocabulary_id = 'private-restriction-allergen-v1'
    and restriction.source_vocabulary_version = 1;

  insert into public.dietary_restrictions (
    user_id, restriction_type, label, severity, visibility,
    source_vocabulary_id, source_vocabulary_version, source_value_key
  )
  select
    v_user_id, 'governed_allergy', candidate.key, 'unclassified', 'private',
    'private-restriction-allergen-v1', 1, candidate.key
  from pg_catalog.unnest(v_keys) as candidate(key);

  return public.read_authenticated_allergy_settings_v1();
end;
$function$
;

-- Exact core RPC: replace_authenticated_ingredient_avoidance_settings_v1(p_source_value_keys text[])
CREATE OR REPLACE FUNCTION public.replace_authenticated_ingredient_avoidance_settings_v1(p_source_value_keys text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_keys text[] := coalesce(p_source_value_keys, '{}'::text[]);
  v_key_count integer;
  v_distinct_count integer;
  v_invalid_key text;
begin
  perform consumer_internal.require_core(auth.uid());
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;
  if pg_catalog.array_position(v_keys, null::text) is not null then
    raise exception 'INGREDIENT_AVOIDANCE_SOURCE_KEY_INVALID' using errcode = '22023';
  end if;
  if exists (
    select 1 from pg_catalog.unnest(v_keys) as key
    where key <> pg_catalog.btrim(key) or key = ''
  ) then
    raise exception 'INGREDIENT_AVOIDANCE_SOURCE_KEY_INVALID' using errcode = '22023';
  end if;

  v_key_count := coalesce(pg_catalog.array_length(v_keys, 1), 0);
  select pg_catalog.count(distinct key)::integer
  into v_distinct_count
  from pg_catalog.unnest(v_keys) as key;
  if v_key_count <> v_distinct_count then
    raise exception 'INGREDIENT_AVOIDANCE_SOURCE_KEY_DUPLICATE' using errcode = '23505';
  end if;
  if v_key_count > 3 then
    raise exception 'INGREDIENT_AVOIDANCE_SOURCE_KEY_LIMIT_EXCEEDED' using errcode = '22023';
  end if;

  select candidate.key
  into v_invalid_key
  from pg_catalog.unnest(v_keys) as candidate(key)
  where not exists (
    select 1
    from public.private_ingredient_avoidance_source_vocabularies as vocabulary
    join public.private_ingredient_avoidance_source_values as source
      on source.source_vocabulary_id = vocabulary.source_vocabulary_id
     and source.source_vocabulary_version = vocabulary.source_vocabulary_version
    join public.private_ingredient_avoidance_normalization_mappings as mapping
      on mapping.source_vocabulary_id = source.source_vocabulary_id
     and mapping.source_vocabulary_version = source.source_vocabulary_version
     and mapping.source_value_key = source.source_value_key
    join public.private_ingredient_avoidance_normalization_policies as policy
      on policy.normalization_policy_id = mapping.normalization_policy_id
     and policy.normalization_policy_version = mapping.normalization_policy_version
    join public.candidate_ingredient_avoidance_taxonomies as taxonomy
      on taxonomy.taxonomy_id = mapping.target_taxonomy_id
     and taxonomy.taxonomy_version = mapping.target_taxonomy_version
    join public.candidate_ingredient_avoidance_values as target
      on target.taxonomy_id = mapping.target_taxonomy_id
     and target.taxonomy_version = mapping.target_taxonomy_version
     and target.ingredient_avoidance_key = mapping.target_ingredient_avoidance_key
    where vocabulary.source_vocabulary_id = 'private-ingredient-avoidance-v1'
      and vocabulary.source_vocabulary_version = 1
      and vocabulary.source_domain = 'ingredient_avoidance'
      and vocabulary.active and vocabulary.retired_at is null
      and source.source_value_key = candidate.key
      and source.active and source.retired_at is null
      and mapping.normalization_policy_id = 'private-ingredient-avoidance-normalization-v1'
      and mapping.normalization_policy_version = 1
      and mapping.normalized_source_value = candidate.key
      and mapping.target_taxonomy_id = 'tastkind-ingredient-avoidance-v1'
      and mapping.target_taxonomy_version = 1
      and mapping.active and mapping.retired_at is null
      and policy.active and policy.retired_at is null
      and taxonomy.fact_domain = 'ingredient_avoidance_content'
      and taxonomy.active and taxonomy.retired_at is null
      and target.active and target.retired_at is null
  )
  limit 1;
  if v_invalid_key is not null then
    raise exception 'INGREDIENT_AVOIDANCE_SOURCE_KEY_NOT_ACTIVE' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':ingredient_avoidance_settings:v1', 0)
  );

  delete from public.private_user_ingredient_avoidance_settings as setting
  where setting.user_id = v_user_id
    and setting.source_vocabulary_id = 'private-ingredient-avoidance-v1'
    and setting.source_vocabulary_version = 1;

  insert into public.private_user_ingredient_avoidance_settings (
    user_id, source_vocabulary_id, source_vocabulary_version, source_value_key
  )
  select
    v_user_id, 'private-ingredient-avoidance-v1', 1, candidate.key
  from pg_catalog.unnest(v_keys) as candidate(key);

  return public.read_authenticated_ingredient_avoidance_settings_v1();
end;
$function$
;

-- Exact core RPC: replace_authenticated_social_interest_settings(p_general_tag_keys text[], p_food_tag_keys text[])
CREATE OR REPLACE FUNCTION public.replace_authenticated_social_interest_settings(p_general_tag_keys text[], p_food_tag_keys text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_general_keys text[] := coalesce(p_general_tag_keys, '{}'::text[]);
  v_food_keys text[] := coalesce(p_food_tag_keys, '{}'::text[]);
  v_invalid_key text;
begin
  perform consumer_internal.require_core(auth.uid());
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  if pg_catalog.array_position(v_general_keys, null::text) is not null
    or pg_catalog.array_position(v_food_keys, null::text) is not null then
    raise exception 'SOCIAL_INTEREST_TAG_NULL' using errcode = '22023';
  end if;

  -- Preserve the frozen SR-2C-R1 normalization exactly: trim, discard empty values and deduplicate
  -- before enforcing the per-namespace limits.
  select pg_catalog.array_agg(distinct pg_catalog.btrim(k))
  into v_general_keys
  from pg_catalog.unnest(v_general_keys) as k
  where pg_catalog.btrim(k) <> '';
  v_general_keys := coalesce(v_general_keys, '{}'::text[]);

  select pg_catalog.array_agg(distinct pg_catalog.btrim(k))
  into v_food_keys
  from pg_catalog.unnest(v_food_keys) as k
  where pg_catalog.btrim(k) <> '';
  v_food_keys := coalesce(v_food_keys, '{}'::text[]);

  if coalesce(pg_catalog.array_length(v_general_keys, 1), 0) > 8
    or coalesce(pg_catalog.array_length(v_food_keys, 1), 0) > 5 then
    raise exception 'SOCIAL_INTEREST_LIMIT_EXCEEDED' using errcode = '22023';
  end if;

  -- Validate BOTH complete desired sets before either namespace can be changed. The namespace
  -- literal is server-owned, so a general key cannot be smuggled into food (or vice versa).
  select candidate.tag_key
  into v_invalid_key
  from (
    select k as tag_key, 'general'::text as namespace
    from pg_catalog.unnest(v_general_keys) as k
    union all
    select k as tag_key, 'food'::text as namespace
    from pg_catalog.unnest(v_food_keys) as k
  ) as candidate
  where not exists (
    select 1
    from public.social_interest_catalog as c
    where c.tag_key = candidate.tag_key
      and c.namespace = candidate.namespace
      and c.active
      and c.selectable
  )
  limit 1;
  if v_invalid_key is not null then
    raise exception 'SOCIAL_INTEREST_TAG_NOT_SELECTABLE' using errcode = '22023';
  end if;

  -- These are the exact predecessor lock keys. Fixed general -> food ordering prevents a deadlock
  -- between concurrent combined Saves while retaining serialization with each old namespace call.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':social_interest:general', 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':social_interest:food', 0)
  );

  delete from public.social_profile_interest_selection as s
  where s.user_id = v_user_id
    and s.namespace in ('general', 'food');

  insert into public.social_profile_interest_selection (user_id, tag_key, namespace)
  select v_user_id, k, 'general'
  from pg_catalog.unnest(v_general_keys) as k
  union all
  select v_user_id, k, 'food'
  from pg_catalog.unnest(v_food_keys) as k;

  return pg_catalog.jsonb_build_object(
    'general_tag_keys', coalesce(
      (
        select pg_catalog.jsonb_agg(ordered.tag_key order by ordered.display_order, ordered.tag_key)
        from (
          select s.tag_key, c.display_order
          from public.social_profile_interest_selection as s
          join public.social_interest_catalog as c on c.tag_key = s.tag_key
          where s.user_id = v_user_id and s.namespace = 'general'
        ) as ordered
      ),
      '[]'::jsonb
    ),
    'food_tag_keys', coalesce(
      (
        select pg_catalog.jsonb_agg(ordered.tag_key order by ordered.display_order, ordered.tag_key)
        from (
          select s.tag_key, c.display_order
          from public.social_profile_interest_selection as s
          join public.social_interest_catalog as c on c.tag_key = s.tag_key
          where s.user_id = v_user_id and s.namespace = 'food'
        ) as ordered
      ),
      '[]'::jsonb
    )
  );
end;
$function$
;

-- Exact core RPC: replace_authenticated_social_interests(p_namespace text, p_tag_keys text[])
CREATE OR REPLACE FUNCTION public.replace_authenticated_social_interests(p_namespace text, p_tag_keys text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_namespace text := nullif(pg_catalog.btrim(p_namespace), '');
  v_keys text[];
  v_max integer;
  v_unknown text;
begin
  perform consumer_internal.require_core(auth.uid());
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;
  if v_namespace is null or v_namespace not in ('general', 'food') then
    raise exception 'SOCIAL_INTEREST_NAMESPACE_INVALID' using errcode = '22023';
  end if;

  -- A null array clears the namespace, exactly like an empty array. Never a fabricated default.
  v_keys := coalesce(p_tag_keys, '{}'::text[]);

  if pg_catalog.array_position(v_keys, null::text) is not null then
    raise exception 'SOCIAL_INTEREST_TAG_NULL' using errcode = '22023';
  end if;

  -- Deduplicate before counting, so a caller repeating one key cannot consume the allowance twice
  -- and cannot create duplicate canonical rows.
  select pg_catalog.array_agg(distinct pg_catalog.btrim(k))
  into v_keys
  from pg_catalog.unnest(v_keys) as k
  where pg_catalog.btrim(k) <> '';
  v_keys := coalesce(v_keys, '{}'::text[]);

  -- Frozen SR-2C-R1 profile-settings limits. These are per-profile, never per-card.
  v_max := case v_namespace when 'general' then 8 else 5 end;
  if coalesce(pg_catalog.array_length(v_keys, 1), 0) > v_max then
    raise exception 'SOCIAL_INTEREST_LIMIT_EXCEEDED' using errcode = '22023';
  end if;

  -- Arbitrary text, retired options, non-selectable category rows and cross-namespace keys are all
  -- rejected by the same lookup: only an active, selectable tag of this exact namespace survives.
  select k
  into v_unknown
  from pg_catalog.unnest(v_keys) as k
  where not exists (
    select 1
    from public.social_interest_catalog as c
    where c.tag_key = k
      and c.namespace = v_namespace
      and c.active
      and c.selectable
  )
  limit 1;
  if v_unknown is not null then
    raise exception 'SOCIAL_INTEREST_TAG_NOT_SELECTABLE' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':social_interest:' || v_namespace, 0)
  );

  -- Deterministic whole-namespace replacement. The other namespace is never touched.
  delete from public.social_profile_interest_selection as s
  where s.user_id = v_user_id
    and s.namespace = v_namespace;

  insert into public.social_profile_interest_selection (user_id, tag_key, namespace)
  select v_user_id, k, v_namespace
  from pg_catalog.unnest(v_keys) as k;

  return pg_catalog.jsonb_build_object(
    'namespace', v_namespace,
    'tag_keys', coalesce(
      (
        select pg_catalog.jsonb_agg(ordered.tag_key order by ordered.display_order, ordered.tag_key)
        from (
          select s.tag_key, c.display_order
          from public.social_profile_interest_selection as s
          join public.social_interest_catalog as c on c.tag_key = s.tag_key
          where s.user_id = v_user_id
            and s.namespace = v_namespace
        ) as ordered
      ),
      '[]'::jsonb
    )
  );
end;
$function$
;

-- Exact core RPC: save_authenticated_menu_item_rating(p_restaurant_id text, p_menu_item_id text, p_private_rating numeric, p_branch_id text, p_meal_record_item_id uuid, p_finished boolean, p_dislike_reasons text[], p_taste_feeling text, p_portion_feeling text, p_price_feeling text, p_repurchase_intent text)
CREATE OR REPLACE FUNCTION public.save_authenticated_menu_item_rating(p_restaurant_id text, p_menu_item_id text, p_private_rating numeric, p_branch_id text DEFAULT NULL::text, p_meal_record_item_id uuid DEFAULT NULL::uuid, p_finished boolean DEFAULT NULL::boolean, p_dislike_reasons text[] DEFAULT '{}'::text[], p_taste_feeling text DEFAULT NULL::text, p_portion_feeling text DEFAULT NULL::text, p_price_feeling text DEFAULT NULL::text, p_repurchase_intent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_restaurant_id text := nullif(btrim(p_restaurant_id), '');
  v_menu_item_id text := nullif(btrim(p_menu_item_id), '');
  v_branch_id text := nullif(btrim(coalesce(p_branch_id, '')), '');
  v_now timestamptz := clock_timestamp();
  v_row public.user_menu_item_ratings%rowtype;
  v_replaced_count integer := 0;
begin
  perform consumer_internal.require_core(auth.uid());
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  if v_restaurant_id is null then
    raise exception 'RATING_RESTAURANT_ID_REQUIRED' using errcode = '22023';
  end if;

  if v_menu_item_id is null then
    raise exception 'RATING_MENU_ITEM_ID_REQUIRED' using errcode = '22023';
  end if;

  if p_private_rating is null
     or p_private_rating::text in ('NaN', 'Infinity', '-Infinity')
     or p_private_rating < 0
     or p_private_rating > 5 then
    raise exception 'RATING_VALUE_INVALID' using errcode = '22023';
  end if;

  if p_meal_record_item_id is not null then
    if not exists (
      select 1
      from public.meal_record_items as mri
      join public.meal_records as mr on mr.id = mri.meal_record_id
      where mri.id = p_meal_record_item_id
        and mri.user_id = v_user_id
        and mr.user_id = v_user_id
        and mr.deleted_at is null
    ) then
      raise exception 'RATING_MEAL_RECORD_ITEM_NOT_OWNED' using errcode = '42501';
    end if;

    if not exists (
      select 1
      from public.meal_record_items as mri
      join public.meal_records as mr on mr.id = mri.meal_record_id
      where mri.id = p_meal_record_item_id
        and mri.user_id = v_user_id
        and mr.user_id = v_user_id
        and mr.deleted_at is null
        and mri.restaurant_id = v_restaurant_id
        and mri.menu_item_id = v_menu_item_id
        and mri.branch_id is not distinct from v_branch_id
    ) then
      raise exception 'RATING_MEAL_ITEM_TARGET_MISMATCH' using errcode = '22023';
    end if;
  end if;

  -- The current-row index is keyed by owner/menu item, so the lock uses that key.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':menu_item:' || v_menu_item_id, 0)
  );

  update public.user_menu_item_ratings
  set is_current = false,
      updated_at = v_now
  where user_id = v_user_id
    and menu_item_id = v_menu_item_id
    and is_current = true;

  get diagnostics v_replaced_count = row_count;

  insert into public.user_menu_item_ratings (
    user_id,
    restaurant_id,
    branch_id,
    menu_item_id,
    meal_record_item_id,
    private_rating,
    finished,
    dislike_reasons,
    taste_feeling,
    portion_feeling,
    price_feeling,
    repurchase_intent,
    visibility,
    is_current,
    rated_at,
    updated_at
  )
  values (
    v_user_id,
    v_restaurant_id,
    v_branch_id,
    v_menu_item_id,
    p_meal_record_item_id,
    p_private_rating,
    p_finished,
    coalesce(p_dislike_reasons, '{}'::text[]),
    nullif(btrim(coalesce(p_taste_feeling, '')), ''),
    nullif(btrim(coalesce(p_portion_feeling, '')), ''),
    nullif(btrim(coalesce(p_price_feeling, '')), ''),
    nullif(btrim(coalesce(p_repurchase_intent, '')), ''),
    'private',
    true,
    v_now,
    v_now
  )
  returning * into v_row;

  return jsonb_build_object(
    'rating_id', v_row.id,
    'target_kind', 'menu_item',
    'restaurant_id', v_row.restaurant_id,
    'branch_id', v_row.branch_id,
    'menu_item_id', v_row.menu_item_id,
    'meal_record_item_id', v_row.meal_record_item_id,
    'rating_value', v_row.private_rating,
    'finished', v_row.finished,
    'dislike_reasons', v_row.dislike_reasons,
    'taste_feeling', v_row.taste_feeling,
    'portion_feeling', v_row.portion_feeling,
    'price_feeling', v_row.price_feeling,
    'repurchase_intent', v_row.repurchase_intent,
    'visibility', v_row.visibility,
    'is_current', v_row.is_current,
    'rated_at', v_row.rated_at,
    'updated_at', v_row.updated_at,
    'replaced_previous', v_replaced_count > 0
  );
end;
$function$
;

-- Exact core RPC: save_authenticated_restaurant_rating(p_restaurant_id text, p_private_rating numeric, p_meal_record_id uuid, p_taste_feeling text, p_portion_feeling text, p_price_feeling text, p_repurchase_intent text)
CREATE OR REPLACE FUNCTION public.save_authenticated_restaurant_rating(p_restaurant_id text, p_private_rating numeric, p_meal_record_id uuid DEFAULT NULL::uuid, p_taste_feeling text DEFAULT NULL::text, p_portion_feeling text DEFAULT NULL::text, p_price_feeling text DEFAULT NULL::text, p_repurchase_intent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_restaurant_id text := nullif(btrim(p_restaurant_id), '');
  v_now timestamptz := clock_timestamp();
  v_row public.user_restaurant_ratings%rowtype;
  v_replaced_count integer := 0;
begin
  perform consumer_internal.require_core(auth.uid());
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  if v_restaurant_id is null then
    raise exception 'RATING_RESTAURANT_ID_REQUIRED' using errcode = '22023';
  end if;

  if p_private_rating is null
     or p_private_rating::text in ('NaN', 'Infinity', '-Infinity')
     or p_private_rating < 0
     or p_private_rating > 5 then
    raise exception 'RATING_VALUE_INVALID' using errcode = '22023';
  end if;

  if p_meal_record_id is not null then
    if not exists (
      select 1
      from public.meal_records as mr
      where mr.id = p_meal_record_id
        and mr.user_id = v_user_id
        and mr.deleted_at is null
    ) then
      raise exception 'RATING_MEAL_RECORD_NOT_OWNED' using errcode = '42501';
    end if;

    if not exists (
      select 1
      from public.meal_record_items as mri
      join public.meal_records as mr on mr.id = mri.meal_record_id
      where mri.meal_record_id = p_meal_record_id
        and mri.user_id = v_user_id
        and mr.user_id = v_user_id
        and mr.deleted_at is null
        and mri.restaurant_id = v_restaurant_id
    ) then
      raise exception 'RATING_MEAL_RESTAURANT_MISMATCH' using errcode = '22023';
    end if;
  end if;

  -- Serialize both replace-existing and first-insert paths for this owner/target.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':restaurant:' || v_restaurant_id, 0)
  );

  update public.user_restaurant_ratings
  set is_current = false,
      updated_at = v_now
  where user_id = v_user_id
    and restaurant_id = v_restaurant_id
    and is_current = true;

  get diagnostics v_replaced_count = row_count;

  insert into public.user_restaurant_ratings (
    user_id,
    restaurant_id,
    meal_record_id,
    private_rating,
    taste_feeling,
    portion_feeling,
    price_feeling,
    repurchase_intent,
    visibility,
    is_current,
    rated_at,
    updated_at
  )
  values (
    v_user_id,
    v_restaurant_id,
    p_meal_record_id,
    p_private_rating,
    nullif(btrim(coalesce(p_taste_feeling, '')), ''),
    nullif(btrim(coalesce(p_portion_feeling, '')), ''),
    nullif(btrim(coalesce(p_price_feeling, '')), ''),
    nullif(btrim(coalesce(p_repurchase_intent, '')), ''),
    'private',
    true,
    v_now,
    v_now
  )
  returning * into v_row;

  return jsonb_build_object(
    'rating_id', v_row.id,
    'target_kind', 'restaurant',
    'restaurant_id', v_row.restaurant_id,
    'meal_record_id', v_row.meal_record_id,
    'rating_value', v_row.private_rating,
    'taste_feeling', v_row.taste_feeling,
    'portion_feeling', v_row.portion_feeling,
    'price_feeling', v_row.price_feeling,
    'repurchase_intent', v_row.repurchase_intent,
    'visibility', v_row.visibility,
    'is_current', v_row.is_current,
    'rated_at', v_row.rated_at,
    'updated_at', v_row.updated_at,
    'replaced_previous', v_replaced_count > 0
  );
end;
$function$
;

-- Exact core RPC: save_authenticated_planned_meal(p_planned_for date, p_meal_type text, p_display_name_snapshot text, p_note text, p_restaurant_id text, p_branch_id text, p_menu_item_id text, p_planned_nutrition_snapshot jsonb)
CREATE OR REPLACE FUNCTION public.save_authenticated_planned_meal(p_planned_for date, p_meal_type text, p_display_name_snapshot text, p_note text DEFAULT NULL::text, p_restaurant_id text DEFAULT NULL::text, p_branch_id text DEFAULT NULL::text, p_menu_item_id text DEFAULT NULL::text, p_planned_nutrition_snapshot jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_meal_type public.meal_type;
  v_row public.planned_meals%rowtype;
begin
  perform consumer_internal.require_core(auth.uid());
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  if p_planned_for is null then
    raise exception 'PLANNED_FOR_REQUIRED' using errcode = '22023';
  end if;

  if coalesce(length(btrim(p_display_name_snapshot)), 0) = 0 or length(btrim(p_display_name_snapshot)) > 500 then
    raise exception 'INVALID_DISPLAY_NAME' using errcode = '22023';
  end if;

  begin
    v_meal_type := p_meal_type::public.meal_type;
  exception when invalid_text_representation or others then
    raise exception 'INVALID_MEAL_TYPE' using errcode = '22023';
  end;

  if p_planned_nutrition_snapshot is null then
    raise exception 'INVALID_NUTRITION_SNAPSHOT' using errcode = '22023';
  end if;

  if (p_planned_nutrition_snapshot->>'calories') is not null then
    if (p_planned_nutrition_snapshot->>'calories')::numeric < 0
       or (p_planned_nutrition_snapshot->>'calories')::numeric != (p_planned_nutrition_snapshot->>'calories')::numeric then
      raise exception 'INVALID_NUTRITION_CALORIES' using errcode = '22023';
    end if;
  end if;

  if (p_planned_nutrition_snapshot->>'protein') is not null then
    if (p_planned_nutrition_snapshot->>'protein')::numeric < 0 then
      raise exception 'INVALID_NUTRITION_PROTEIN' using errcode = '22023';
    end if;
  end if;

  if (p_planned_nutrition_snapshot->>'carbohydrates') is not null then
    if (p_planned_nutrition_snapshot->>'carbohydrates')::numeric < 0 then
      raise exception 'INVALID_NUTRITION_CARBOHYDRATES' using errcode = '22023';
    end if;
  end if;

  if (p_planned_nutrition_snapshot->>'fat') is not null then
    if (p_planned_nutrition_snapshot->>'fat')::numeric < 0 then
      raise exception 'INVALID_NUTRITION_FAT' using errcode = '22023';
    end if;
  end if;

  if (p_planned_nutrition_snapshot->>'fiber') is not null then
    if (p_planned_nutrition_snapshot->>'fiber')::numeric < 0 then
      raise exception 'INVALID_NUTRITION_FIBER' using errcode = '22023';
    end if;
  end if;

  insert into public.planned_meals (
    user_id,
    planned_for,
    meal_type,
    restaurant_id,
    branch_id,
    menu_item_id,
    display_name_snapshot,
    planned_nutrition_snapshot,
    status,
    note
  )
  values (
    v_user_id,
    p_planned_for,
    v_meal_type,
    nullif(btrim(coalesce(p_restaurant_id, '')), ''),
    nullif(btrim(coalesce(p_branch_id, '')), ''),
    nullif(btrim(coalesce(p_menu_item_id, '')), ''),
    btrim(p_display_name_snapshot),
    p_planned_nutrition_snapshot,
    'planned',
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning * into v_row;

  return jsonb_build_object(
    'planned_meal_id', v_row.id,
    'planned_for', v_row.planned_for,
    'meal_type', v_row.meal_type,
    'display_name_snapshot', v_row.display_name_snapshot,
    'status', v_row.status,
    'nutrition_snapshot_present', (v_row.planned_nutrition_snapshot is not null and v_row.planned_nutrition_snapshot <> '{}'::jsonb),
    'created_at', v_row.created_at
  );
end;
$function$
;

-- Exact core RPC: update_authenticated_planned_meal(p_planned_meal_id uuid, p_planned_for date, p_meal_type text, p_display_name_snapshot text, p_note text, p_restaurant_id text, p_branch_id text, p_menu_item_id text, p_planned_nutrition_snapshot jsonb, p_status text)
CREATE OR REPLACE FUNCTION public.update_authenticated_planned_meal(p_planned_meal_id uuid, p_planned_for date DEFAULT NULL::date, p_meal_type text DEFAULT NULL::text, p_display_name_snapshot text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_restaurant_id text DEFAULT NULL::text, p_branch_id text DEFAULT NULL::text, p_menu_item_id text DEFAULT NULL::text, p_planned_nutrition_snapshot jsonb DEFAULT NULL::jsonb, p_status text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_existing public.planned_meals%rowtype;
  v_new_meal_type public.meal_type;
  v_new_status public.planned_meal_status;
  v_row public.planned_meals%rowtype;
begin
  perform consumer_internal.require_core(auth.uid());
  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  if p_planned_meal_id is null then
    raise exception 'PLANNED_MEAL_ID_REQUIRED' using errcode = '22023';
  end if;

  select * into v_existing from public.planned_meals where id = p_planned_meal_id and user_id = v_user_id;
  if not found then
    return jsonb_build_object('found', false, 'updated', false);
  end if;

  if p_display_name_snapshot is not null and (length(btrim(p_display_name_snapshot)) = 0 or length(btrim(p_display_name_snapshot)) > 500) then
    raise exception 'INVALID_DISPLAY_NAME' using errcode = '22023';
  end if;

  if p_meal_type is not null then
    begin
      v_new_meal_type := p_meal_type::public.meal_type;
    exception when invalid_text_representation or others then
      raise exception 'INVALID_MEAL_TYPE' using errcode = '22023';
    end;
  end if;

  if p_status is not null then
    begin
      v_new_status := p_status::public.planned_meal_status;
    exception when invalid_text_representation or others then
      raise exception 'INVALID_STATUS' using errcode = '22023';
    end;
  end if;

  if p_planned_nutrition_snapshot is not null then
    if (p_planned_nutrition_snapshot->>'calories') is not null and (p_planned_nutrition_snapshot->>'calories')::numeric < 0 then
      raise exception 'INVALID_NUTRITION_CALORIES' using errcode = '22023';
    end if;
    if (p_planned_nutrition_snapshot->>'protein') is not null and (p_planned_nutrition_snapshot->>'protein')::numeric < 0 then
      raise exception 'INVALID_NUTRITION_PROTEIN' using errcode = '22023';
    end if;
    if (p_planned_nutrition_snapshot->>'carbohydrates') is not null and (p_planned_nutrition_snapshot->>'carbohydrates')::numeric < 0 then
      raise exception 'INVALID_NUTRITION_CARBOHYDRATES' using errcode = '22023';
    end if;
    if (p_planned_nutrition_snapshot->>'fat') is not null and (p_planned_nutrition_snapshot->>'fat')::numeric < 0 then
      raise exception 'INVALID_NUTRITION_FAT' using errcode = '22023';
    end if;
    if (p_planned_nutrition_snapshot->>'fiber') is not null and (p_planned_nutrition_snapshot->>'fiber')::numeric < 0 then
      raise exception 'INVALID_NUTRITION_FIBER' using errcode = '22023';
    end if;
  end if;

  update public.planned_meals set
    planned_for             = coalesce(p_planned_for, planned_for),
    meal_type               = coalesce(v_new_meal_type, meal_type),
    display_name_snapshot   = case when p_display_name_snapshot is not null then btrim(p_display_name_snapshot) else display_name_snapshot end,
    note                    = case when p_note is not null then nullif(btrim(p_note), '') else note end,
    restaurant_id           = case when p_restaurant_id is not null then nullif(btrim(p_restaurant_id), '') else restaurant_id end,
    branch_id               = case when p_branch_id is not null then nullif(btrim(p_branch_id), '') else branch_id end,
    menu_item_id            = case when p_menu_item_id is not null then nullif(btrim(p_menu_item_id), '') else menu_item_id end,
    planned_nutrition_snapshot = coalesce(p_planned_nutrition_snapshot, planned_nutrition_snapshot),
    status                  = coalesce(v_new_status, status),
    updated_at              = now()
  where id = p_planned_meal_id and user_id = v_user_id
  returning * into v_row;

  return jsonb_build_object(
    'found', true,
    'updated', true,
    'planned_meal_id', v_row.id,
    'planned_for', v_row.planned_for,
    'meal_type', v_row.meal_type,
    'status', v_row.status,
    'nutrition_snapshot_present', (v_row.planned_nutrition_snapshot is not null and v_row.planned_nutrition_snapshot <> '{}'::jsonb),
    'updated_at', v_row.updated_at
  );
end;
$function$
;

-- Exact core RPC: update_authenticated_planned_meal_v2(p_planned_meal_id uuid, p_expected_updated_at timestamp with time zone, p_patch jsonb)
CREATE OR REPLACE FUNCTION public.update_authenticated_planned_meal_v2(p_planned_meal_id uuid, p_expected_updated_at timestamp with time zone, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_actor uuid := auth.uid(); v_row public.planned_meals%rowtype; v_time time; v_type public.meal_type; v_nutrition jsonb;
begin
  perform consumer_internal.require_core(auth.uid());
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
$function$
;

CREATE OR REPLACE FUNCTION public.opt_in_authenticated_social_participation()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_state text;
  v_opted_in_at timestamptz;
begin
  perform consumer_internal.owner_lock(auth.uid());
  if not consumer_internal.social_qualified(auth.uid()) then raise exception 'SOCIAL_QUALIFICATION_REQUIRED' using errcode='42501'; end if;

  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::pg_catalog.text || ':social_participation', 0)
  );

  select sp.state, sp.opted_in_at
  into v_state, v_opted_in_at
  from public.social_participation as sp
  where sp.user_id = v_user_id;

  -- Idempotent: an existing participant keeps its original lifecycle start, whether it is currently
  -- opted_in or paused. Opting in does not resume a paused participant — resume is its own action.
  if v_state is not null then
    return pg_catalog.jsonb_build_object(
      'status', 'already_participating',
      'state', v_state,
      'opted_in_at', v_opted_in_at
    );
  end if;

  insert into public.social_participation (user_id, state, opted_in_at, updated_at)
  values (v_user_id, 'opted_in', pg_catalog.now(), pg_catalog.now())
  on conflict on constraint social_participation_pkey do nothing
  returning state, opted_in_at into v_state, v_opted_in_at;

  if v_state is null then
    select sp.state, sp.opted_in_at
    into v_state, v_opted_in_at
    from public.social_participation as sp
    where sp.user_id = v_user_id;
    if v_state is null then
      raise exception 'SOCIAL_PARTICIPATION_WRITE_CONFLICT' using errcode = '40001';
    end if;
    return pg_catalog.jsonb_build_object(
      'status', 'already_participating',
      'state', v_state,
      'opted_in_at', v_opted_in_at
    );
  end if;

  return pg_catalog.jsonb_build_object(
    'status', 'opted_in',
    'state', v_state,
    'opted_in_at', v_opted_in_at
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.pause_authenticated_social_participation()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_state text;
  v_opted_in_at timestamptz;
begin
  perform consumer_internal.owner_lock(auth.uid());

  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::pg_catalog.text || ':social_participation', 0)
  );

  select sp.state, sp.opted_in_at
  into v_state, v_opted_in_at
  from public.social_participation as sp
  where sp.user_id = v_user_id;

  if v_state is null then
    raise exception 'SOCIAL_PARTICIPATION_NOT_FOUND' using errcode = '22023';
  end if;
  if v_state = 'paused' then
    return pg_catalog.jsonb_build_object(
      'status', 'already_paused', 'state', v_state, 'opted_in_at', v_opted_in_at
    );
  end if;

  -- opted_in_at is deliberately untouched: pausing suspends discovery, it does not end or restart
  -- the participation lifecycle.
  update public.social_participation
  set state = 'paused', updated_at = pg_catalog.now()
  where user_id = v_user_id
  returning state, opted_in_at into v_state, v_opted_in_at;

  return pg_catalog.jsonb_build_object(
    'status', 'paused', 'state', v_state, 'opted_in_at', v_opted_in_at
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resume_authenticated_social_participation()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_state text;
  v_opted_in_at timestamptz;
begin
  perform consumer_internal.owner_lock(auth.uid());
  if not consumer_internal.social_qualified(auth.uid()) then raise exception 'SOCIAL_QUALIFICATION_REQUIRED' using errcode='42501'; end if;

  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::pg_catalog.text || ':social_participation', 0)
  );

  select sp.state, sp.opted_in_at
  into v_state, v_opted_in_at
  from public.social_participation as sp
  where sp.user_id = v_user_id;

  if v_state is null then
    raise exception 'SOCIAL_PARTICIPATION_NOT_FOUND' using errcode = '22023';
  end if;
  if v_state = 'opted_in' then
    return pg_catalog.jsonb_build_object(
      'status', 'already_opted_in', 'state', v_state, 'opted_in_at', v_opted_in_at
    );
  end if;

  -- opted_in_at is deliberately untouched: resuming continues the same lifecycle.
  update public.social_participation
  set state = 'opted_in', updated_at = pg_catalog.now()
  where user_id = v_user_id
  returning state, opted_in_at into v_state, v_opted_in_at;

  return pg_catalog.jsonb_build_object(
    'status', 'resumed', 'state', v_state, 'opted_in_at', v_opted_in_at
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.opt_out_authenticated_social_participation()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_row_count integer := 0;
begin
  perform consumer_internal.owner_lock(auth.uid());

  if v_user_id is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '28000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::pg_catalog.text || ':social_participation', 0)
  );

  -- Hard delete back to canonical ABSENT. No tombstone, no deactivated flag, nothing that could be
  -- mistaken for a still-discoverable row, and nothing to go stale.
  delete from public.social_participation
  where user_id = v_user_id;

  get diagnostics v_row_count = row_count;

  if v_row_count = 0 then
    return pg_catalog.jsonb_build_object('status', 'already_absent');
  end if;
  return pg_catalog.jsonb_build_object('status', 'opted_out');
end;
$function$
;
grant usage on schema consumer_internal to meal_buddy_card_write_authority,social_authority;
grant execute on function consumer_internal.require_social(uuid) to meal_buddy_card_write_authority;
grant execute on function consumer_internal.core_eligible(uuid),consumer_internal.social_qualified(uuid) to social_authority;
grant meal_buddy_card_write_authority to postgres with inherit false,set true;
grant create on schema social_internal to meal_buddy_card_write_authority;
set local role meal_buddy_card_write_authority;
CREATE OR REPLACE FUNCTION social_internal.create_meal_buddy_card(p_actor_user_id uuid, p_card_type text, p_intention_type text, p_restaurant_id text, p_area text, p_dining_date date, p_meal_period text, p_preferred_time time without time zone, p_general_cap integer, p_restaurant_cap integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_cap integer;
  v_used integer;
  v_expires_at timestamptz;
  v_card public.meal_buddy_cards%rowtype;
  v_general integer;
  v_restaurant integer;
begin
  perform consumer_internal.require_social(p_actor_user_id);
  if p_actor_user_id is null then
    raise exception 'ACTOR_REQUIRED' using errcode = '28000';
  end if;
  if p_card_type not in ('general', 'restaurant') then
    raise exception 'INVALID_CARD_TYPE' using errcode = '22023';
  end if;
  if p_general_cap is null or p_general_cap < 0 or p_restaurant_cap is null or p_restaurant_cap < 0 then
    raise exception 'INVALID_CAP' using errcode = '22023';
  end if;

  v_cap := case p_card_type when 'general' then p_general_cap else p_restaurant_cap end;

  -- Serialise exactly the contended (actor, card_type) pair for the rest of this transaction. The
  -- count below and the insert that follows are therefore one indivisible decision.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_actor_user_id::pg_catalog.text || ':' || p_card_type, 0)
  );

  select pg_catalog.count(*)
  into v_used
  from public.meal_buddy_cards as card
  where card.owner_user_id = p_actor_user_id
    and card.card_type = p_card_type
    and card.cancelled_at is null
    and card.expires_at > v_now;

  if v_used >= v_cap then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'quota_exceeded');
  end if;

  v_expires_at := social_internal.meal_buddy_card_expires_at(p_dining_date, p_meal_period);
  if v_expires_at is null then
    raise exception 'INVALID_MEAL_PERIOD' using errcode = '22023';
  end if;

  insert into public.meal_buddy_cards
    (owner_user_id, card_type, intention_type, restaurant_id, area, dining_date, meal_period, preferred_time, expires_at)
  values
    (p_actor_user_id, p_card_type, p_intention_type, p_restaurant_id, p_area, p_dining_date, p_meal_period, p_preferred_time, v_expires_at)
  returning * into v_card;

  select
    pg_catalog.count(*) filter (where card.card_type = 'general'),
    pg_catalog.count(*) filter (where card.card_type = 'restaurant')
  into v_general, v_restaurant
  from public.meal_buddy_cards as card
  where card.owner_user_id = p_actor_user_id
    and card.cancelled_at is null
    and card.expires_at > v_now;

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'card', pg_catalog.jsonb_build_object(
      'id', v_card.id,
      'card_type', v_card.card_type,
      'intention_type', v_card.intention_type,
      'restaurant_id', v_card.restaurant_id,
      'area', v_card.area,
      'dining_date', v_card.dining_date,
      'meal_period', v_card.meal_period,
      'preferred_time', v_card.preferred_time,
      'created_at', v_card.created_at,
      'expires_at', v_card.expires_at
    ),
    'counts', pg_catalog.jsonb_build_object('general', v_general, 'restaurant', v_restaurant)
  );
end;
$function$
;
set local role postgres;
revoke create on schema social_internal from meal_buddy_card_write_authority;
revoke meal_buddy_card_write_authority from postgres granted by postgres;
grant social_authority to postgres with inherit false,set true;
grant create on schema social_internal to social_authority;
set local role social_authority;
create or replace function social_internal.authorized_candidates(
  p_actor_user_id uuid,
  p_candidate_user_ids uuid[]
)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct candidate.user_id
  from pg_catalog.unnest(p_candidate_user_ids) as candidate(user_id)
  where consumer_internal.social_qualified(p_actor_user_id)
    and consumer_internal.social_qualified(candidate.user_id)
    and p_actor_user_id is not null
    and candidate.user_id is not null
    -- 1. never authorize self-comparison
    and candidate.user_id <> p_actor_user_id
    -- 2. actor account is active and not soft-deleted
    and exists (
      select 1 from public.consumer_profiles as cp
      where cp.user_id = p_actor_user_id and cp.status = 'active' and cp.deleted_at is null
    )
    and not exists (
      select 1 from public.consumer_profiles as cp
      where cp.user_id = p_actor_user_id and (cp.status <> 'active' or cp.deleted_at is not null)
    )
    -- 3. actor has explicitly opted into Social and is not paused
    and exists (
      select 1 from public.social_participation as sp
      where sp.user_id = p_actor_user_id and sp.state = 'opted_in'
    )
    -- 4. candidate account is active and not soft-deleted
    and exists (
      select 1 from public.consumer_profiles as cp
      where cp.user_id = candidate.user_id and cp.status = 'active' and cp.deleted_at is null
    )
    and not exists (
      select 1 from public.consumer_profiles as cp
      where cp.user_id = candidate.user_id and (cp.status <> 'active' or cp.deleted_at is not null)
    )
    -- 5. candidate has explicitly opted into Social and is not paused
    and exists (
      select 1 from public.social_participation as sp
      where sp.user_id = candidate.user_id and sp.state = 'opted_in'
    )
    -- 6. neither direction of the block relation exists
    and not exists (
      select 1 from public.social_blocks as sb
      where sb.blocker_user_id = p_actor_user_id and sb.blocked_user_id = candidate.user_id
    )
    and not exists (
      select 1 from public.social_blocks as sb
      where sb.blocker_user_id = candidate.user_id and sb.blocked_user_id = p_actor_user_id
    )
  order by 1;
$$;
set local role postgres;
revoke create on schema social_internal from social_authority;
revoke social_authority from postgres granted by postgres;
commit;
