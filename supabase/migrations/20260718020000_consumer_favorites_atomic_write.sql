-- Consumer Runtime Phase 2X-D-A local-only migration draft.
-- Adds authenticated atomic/idempotent Favorites write RPCs.
-- Ownership is derived exclusively from auth.uid(); no caller identity is accepted.

begin;

-- Keep table writes closed. The existing authenticated SELECT grants remain unchanged.
revoke insert, update, delete on table public.favorite_restaurants from public, anon, authenticated;
revoke insert, update, delete on table public.favorite_menu_items from public, anon, authenticated;

create or replace function public.add_authenticated_restaurant_favorite(
  p_restaurant_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_restaurant_id text := nullif(pg_catalog.btrim(p_restaurant_id), '');
  v_row public.favorite_restaurants%rowtype;
begin
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
$$;

create or replace function public.remove_authenticated_restaurant_favorite(
  p_restaurant_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_restaurant_id text := nullif(pg_catalog.btrim(p_restaurant_id), '');
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_row public.favorite_restaurants%rowtype;
begin
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
$$;

create or replace function public.add_authenticated_menu_item_favorite(
  p_restaurant_id text,
  p_menu_item_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_restaurant_id text := nullif(pg_catalog.btrim(p_restaurant_id), '');
  v_menu_item_id text := nullif(pg_catalog.btrim(p_menu_item_id), '');
  v_row public.favorite_menu_items%rowtype;
begin
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
$$;

create or replace function public.remove_authenticated_menu_item_favorite(
  p_restaurant_id text,
  p_menu_item_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_restaurant_id text := nullif(pg_catalog.btrim(p_restaurant_id), '');
  v_menu_item_id text := nullif(pg_catalog.btrim(p_menu_item_id), '');
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_row public.favorite_menu_items%rowtype;
begin
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
$$;

comment on function public.add_authenticated_restaurant_favorite(text)
  is 'Atomically adds the current authenticated user restaurant favorite; ownership derives only from auth.uid().';
comment on function public.remove_authenticated_restaurant_favorite(text)
  is 'Atomically soft-removes the current authenticated user restaurant favorite; ownership derives only from auth.uid().';
comment on function public.add_authenticated_menu_item_favorite(text, text)
  is 'Atomically adds the current authenticated user menu-item favorite after canonical parent validation.';
comment on function public.remove_authenticated_menu_item_favorite(text, text)
  is 'Atomically soft-removes the current authenticated user menu-item favorite using its canonical target pair.';

revoke all on function public.add_authenticated_restaurant_favorite(text) from public, anon, authenticated;
revoke all on function public.remove_authenticated_restaurant_favorite(text) from public, anon, authenticated;
revoke all on function public.add_authenticated_menu_item_favorite(text, text) from public, anon, authenticated;
revoke all on function public.remove_authenticated_menu_item_favorite(text, text) from public, anon, authenticated;

grant execute on function public.add_authenticated_restaurant_favorite(text) to authenticated;
grant execute on function public.remove_authenticated_restaurant_favorite(text) to authenticated;
grant execute on function public.add_authenticated_menu_item_favorite(text, text) to authenticated;
grant execute on function public.remove_authenticated_menu_item_favorite(text, text) to authenticated;

commit;
