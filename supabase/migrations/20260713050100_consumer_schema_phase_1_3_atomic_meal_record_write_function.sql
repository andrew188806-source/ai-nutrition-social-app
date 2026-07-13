-- Consumer Runtime Phase 2D forward-only migration.
-- Adds one authenticated current-user atomic meal create function.
-- No seed, fixture, profile bootstrap, table redesign, production credential, or UI change is included.

create or replace function public.create_current_user_meal_record(
  p_meal_type public.meal_type,
  p_occurred_at timestamptz,
  p_meal_date date,
  p_timezone text default 'Asia/Taipei',
  p_title text default null,
  p_note text default null,
  p_source public.meal_source_type default 'manual',
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.create_current_user_meal_record(
  public.meal_type,
  timestamptz,
  date,
  text,
  text,
  text,
  public.meal_source_type,
  jsonb
) from public;

revoke all on function public.create_current_user_meal_record(
  public.meal_type,
  timestamptz,
  date,
  text,
  text,
  text,
  public.meal_source_type,
  jsonb
) from anon;

grant execute on function public.create_current_user_meal_record(
  public.meal_type,
  timestamptz,
  date,
  text,
  text,
  text,
  public.meal_source_type,
  jsonb
) to authenticated;

revoke insert, update, delete on table public.meal_records from authenticated;
revoke insert, update, delete on table public.meal_record_items from authenticated;
revoke insert, update, delete on table public.meal_records from anon;
revoke insert, update, delete on table public.meal_record_items from anon;
