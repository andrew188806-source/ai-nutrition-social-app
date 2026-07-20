-- Phase 2Z-B2-A Development-only candidate.
-- Adds actor-scoped request idempotency for Meal Create without changing the V1 RPC.

alter table public.meal_records
  add column client_request_id uuid,
  add column request_fingerprint jsonb;

alter table public.meal_records
  add constraint meal_records_request_fingerprint_pair_check
  check ((client_request_id is null) = (request_fingerprint is null));

create unique index meal_records_user_client_request_id_unique
  on public.meal_records (user_id, client_request_id)
  where client_request_id is not null;

create function public.create_current_user_meal_record_v2(
  p_meal_type public.meal_type,
  p_occurred_at timestamptz,
  p_meal_date date,
  p_client_request_id uuid,
  p_timezone text default 'Asia/Taipei',
  p_title text default null,
  p_note text default null,
  p_source public.meal_source_type default 'manual',
  p_items jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_items jsonb := coalesce(p_items, '[]'::jsonb);
  v_fingerprint jsonb;
  v_existing public.meal_records%rowtype;
  v_created jsonb;
  v_created_id uuid;
  v_existing_items jsonb;
begin
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
$$;

revoke all on function public.create_current_user_meal_record_v2(
  public.meal_type, timestamptz, date, uuid, text, text, text, public.meal_source_type, jsonb
) from public;

revoke all on function public.create_current_user_meal_record_v2(
  public.meal_type, timestamptz, date, uuid, text, text, text, public.meal_source_type, jsonb
) from anon;

revoke all on function public.create_current_user_meal_record_v2(
  public.meal_type, timestamptz, date, uuid, text, text, text, public.meal_source_type, jsonb
) from authenticated;

grant execute on function public.create_current_user_meal_record_v2(
  public.meal_type, timestamptz, date, uuid, text, text, text, public.meal_source_type, jsonb
) to authenticated;

revoke insert, update, delete on table public.meal_records from authenticated;
revoke insert, update, delete on table public.meal_record_items from authenticated;
revoke insert, update, delete on table public.meal_records from anon;
revoke insert, update, delete on table public.meal_record_items from anon;
