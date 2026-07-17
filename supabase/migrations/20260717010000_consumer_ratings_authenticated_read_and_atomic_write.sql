-- Consumer Runtime Phase 2W-B local-only migration draft.
-- Adds owner-scoped authenticated reads and atomic authenticated rating writes.
-- Ownership is derived exclusively from auth.uid(); no caller-provided identity is accepted.

begin;

-- Read access is table SELECT plus the existing auth.uid() owner RLS policies.
-- Remove every direct privilege first, then grant only SELECT to authenticated.
revoke all on table public.user_restaurant_ratings from public, anon, authenticated;
revoke all on table public.user_menu_item_ratings from public, anon, authenticated;

grant select on table public.user_restaurant_ratings to authenticated;
grant select on table public.user_menu_item_ratings to authenticated;

-- Keep direct writes closed. Only the authenticated RPCs below may write ratings.
revoke insert, update, delete on table public.user_restaurant_ratings from public, anon, authenticated;
revoke insert, update, delete on table public.user_menu_item_ratings from public, anon, authenticated;

create or replace function public.save_authenticated_restaurant_rating(
  p_restaurant_id text,
  p_private_rating numeric,
  p_meal_record_id uuid default null,
  p_taste_feeling text default null,
  p_portion_feeling text default null,
  p_price_feeling text default null,
  p_repurchase_intent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_restaurant_id text := nullif(btrim(p_restaurant_id), '');
  v_now timestamptz := clock_timestamp();
  v_row public.user_restaurant_ratings%rowtype;
  v_replaced_count integer := 0;
begin
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
$$;

comment on function public.save_authenticated_restaurant_rating(
  text, numeric, uuid, text, text, text, text
) is 'Atomically saves the current authenticated user restaurant rating; ownership is derived only from auth.uid().';

revoke all on function public.save_authenticated_restaurant_rating(
  text, numeric, uuid, text, text, text, text
) from public, anon, authenticated;

grant execute on function public.save_authenticated_restaurant_rating(
  text, numeric, uuid, text, text, text, text
) to authenticated;

create or replace function public.save_authenticated_menu_item_rating(
  p_restaurant_id text,
  p_menu_item_id text,
  p_private_rating numeric,
  p_branch_id text default null,
  p_meal_record_item_id uuid default null,
  p_finished boolean default null,
  p_dislike_reasons text[] default '{}'::text[],
  p_taste_feeling text default null,
  p_portion_feeling text default null,
  p_price_feeling text default null,
  p_repurchase_intent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_restaurant_id text := nullif(btrim(p_restaurant_id), '');
  v_menu_item_id text := nullif(btrim(p_menu_item_id), '');
  v_branch_id text := nullif(btrim(coalesce(p_branch_id, '')), '');
  v_now timestamptz := clock_timestamp();
  v_row public.user_menu_item_ratings%rowtype;
  v_replaced_count integer := 0;
begin
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
$$;

comment on function public.save_authenticated_menu_item_rating(
  text, text, numeric, text, uuid, boolean, text[], text, text, text, text
) is 'Atomically saves the current authenticated user menu-item rating; ownership is derived only from auth.uid().';

revoke all on function public.save_authenticated_menu_item_rating(
  text, text, numeric, text, uuid, boolean, text[], text, text, text, text
) from public, anon, authenticated;

grant execute on function public.save_authenticated_menu_item_rating(
  text, text, numeric, text, uuid, boolean, text[], text, text, text, text
) to authenticated;

commit;
