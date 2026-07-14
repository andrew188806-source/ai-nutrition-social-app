-- Consumer Runtime Phase 2O forward-only migration.
-- Adds three authenticated atomic planned meal write functions:
--   save_authenticated_planned_meal    (INSERT new planned meal, returns created id/metadata)
--   update_authenticated_planned_meal  (UPDATE caller-owned planned meal by id)
--   remove_authenticated_planned_meal  (soft-cancel caller-owned planned meal, status = 'cancelled')
-- All functions use auth.uid() exclusively. No caller-provided user identity is accepted.
-- All functions use security definer with explicit safe search_path.
-- anon EXECUTE is revoked. authenticated EXECUTE is granted (minimal).
-- Direct INSERT/UPDATE/DELETE on planned_meals is NOT granted to authenticated or anon.
-- No seed, fixture, bootstrap, table redesign, UI change, or production credential is included.

-- ---------------------------------------------------------------------------
-- 1. save_authenticated_planned_meal
-- ---------------------------------------------------------------------------
create or replace function public.save_authenticated_planned_meal(
  p_planned_for date,
  p_meal_type text,
  p_display_name_snapshot text,
  p_note text default null,
  p_restaurant_id text default null,
  p_branch_id text default null,
  p_menu_item_id text default null,
  p_planned_nutrition_snapshot jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_meal_type public.meal_type;
  v_row public.planned_meals%rowtype;
begin
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
$$;

revoke all on function public.save_authenticated_planned_meal(
  date, text, text, text, text, text, text, jsonb
) from public;

revoke all on function public.save_authenticated_planned_meal(
  date, text, text, text, text, text, text, jsonb
) from anon;

grant execute on function public.save_authenticated_planned_meal(
  date, text, text, text, text, text, text, jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. update_authenticated_planned_meal
-- ---------------------------------------------------------------------------
create or replace function public.update_authenticated_planned_meal(
  p_planned_meal_id uuid,
  p_planned_for date default null,
  p_meal_type text default null,
  p_display_name_snapshot text default null,
  p_note text default null,
  p_restaurant_id text default null,
  p_branch_id text default null,
  p_menu_item_id text default null,
  p_planned_nutrition_snapshot jsonb default null,
  p_status text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.planned_meals%rowtype;
  v_new_meal_type public.meal_type;
  v_new_status public.planned_meal_status;
  v_row public.planned_meals%rowtype;
begin
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
$$;

revoke all on function public.update_authenticated_planned_meal(
  uuid, date, text, text, text, text, text, text, jsonb, text
) from public;

revoke all on function public.update_authenticated_planned_meal(
  uuid, date, text, text, text, text, text, text, jsonb, text
) from anon;

grant execute on function public.update_authenticated_planned_meal(
  uuid, date, text, text, text, text, text, text, jsonb, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. remove_authenticated_planned_meal
-- ---------------------------------------------------------------------------
create or replace function public.remove_authenticated_planned_meal(
  p_planned_meal_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing public.planned_meals%rowtype;
begin
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
$$;

revoke all on function public.remove_authenticated_planned_meal(uuid) from public;
revoke all on function public.remove_authenticated_planned_meal(uuid) from anon;
grant execute on function public.remove_authenticated_planned_meal(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Explicitly deny direct table writes to authenticated and anon.
-- (authenticated only has SELECT from Phase 2M; enforce no INSERT/UPDATE/DELETE)
-- ---------------------------------------------------------------------------
revoke insert, update, delete on table public.planned_meals from authenticated;
revoke insert, update, delete on table public.planned_meals from anon;
