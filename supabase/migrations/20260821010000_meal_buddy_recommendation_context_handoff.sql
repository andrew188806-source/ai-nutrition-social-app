-- SR-2G-G: canonical recommendation -> Meal Buddy food-context handoff.
--
-- The selected recommendation is identified only by the stable restaurant catalog keys already
-- carried by the live next-meal DTO.  Localized menu names and Profile interests are deliberately
-- absent: neither can become card context authority.  A missing mapping is a valid null context;
-- an invalid or cross-restaurant identity is rejected before a card can be created.

begin;

create table public.meal_buddy_menu_item_food_context_mapping (
  menu_item_id text primary key
    references public.menu_items (id) on delete restrict,
  food_context_tag_key text not null,
  food_context_namespace text not null default 'food'
    check (food_context_namespace = 'food'),
  active boolean not null default true,
  retired_at timestamptz,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint meal_buddy_menu_item_food_context_mapping_lifecycle
    check ((active and retired_at is null) or (not active)),
  constraint meal_buddy_menu_item_food_context_mapping_catalog_fkey
    foreign key (food_context_tag_key, food_context_namespace)
    references public.social_interest_catalog (tag_key, namespace) on delete restrict
);

comment on table public.meal_buddy_menu_item_food_context_mapping is
  'SR-2G-G stable menu-item to canonical food taxonomy mapping. Active mappings apply only to newly created cards; retiring a mapping never rewrites a card context snapshot.';
comment on column public.meal_buddy_menu_item_food_context_mapping.menu_item_id is
  'Canonical public.menu_items identity. Never a localized menu name or display label.';
comment on column public.meal_buddy_menu_item_food_context_mapping.food_context_tag_key is
  'Canonical social_interest_catalog tag_key in namespace food.';

alter table public.meal_buddy_menu_item_food_context_mapping enable row level security;
revoke all on table public.meal_buddy_menu_item_food_context_mapping from public;
revoke all on table public.meal_buddy_menu_item_food_context_mapping from anon;
revoke all on table public.meal_buddy_menu_item_food_context_mapping from authenticated;
revoke all on table public.meal_buddy_menu_item_food_context_mapping from authenticator;
revoke all on table public.meal_buddy_menu_item_food_context_mapping from service_role;

-- The existing card-write authority validates the selected canonical catalog relationship and
-- resolves the one active mapping. Grants remain column-scoped and provide no Mobile table access.
grant select (id, status) on table public.restaurants to meal_buddy_card_write_authority;
grant select (id, restaurant_id, status) on table public.restaurant_branches to meal_buddy_card_write_authority;
grant select (id, restaurant_id, status) on table public.menus to meal_buddy_card_write_authority;
grant select (id, menu_id) on table public.menu_categories to meal_buddy_card_write_authority;
grant select (id, restaurant_id, menu_category_id, status) on table public.menu_items to meal_buddy_card_write_authority;
grant select (id, restaurant_id, branch_id, menu_item_id, availability, sold_out, branch_specific_status)
  on table public.branch_menu_items to meal_buddy_card_write_authority;
grant select (menu_item_id, food_context_tag_key, food_context_namespace, active, retired_at)
  on table public.meal_buddy_menu_item_food_context_mapping to meal_buddy_card_write_authority;

-- The mapping table is RLS-protected and the function owner is deliberately NOBYPASSRLS. Without
-- this role-scoped policy every valid mapping would be invisible and would silently degrade to the
-- null-context fallback. No client role is named here or has a table grant.
create policy meal_buddy_menu_item_food_context_mapping_write_authority_read
  on public.meal_buddy_menu_item_food_context_mapping
  for select to meal_buddy_card_write_authority using (true);

grant meal_buddy_card_write_authority to postgres with inherit false, set true;
grant create on schema social_internal to meal_buddy_card_write_authority;

create function social_internal.create_meal_buddy_card_from_recommendation(
  p_actor_user_id uuid,
  p_card_type text,
  p_intention_type text,
  p_restaurant_id text,
  p_area text,
  p_dining_date date,
  p_meal_period text,
  p_preferred_time time,
  p_general_cap integer,
  p_restaurant_cap integer,
  p_food_context_tag_key text,
  p_branch_menu_item_id text,
  p_menu_item_id text,
  p_recommendation_restaurant_id text,
  p_branch_id text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_has_recommendation boolean;
  v_identity_ok boolean := false;
  v_derived_context text;
begin
  v_has_recommendation := p_branch_menu_item_id is not null
    or p_menu_item_id is not null
    or p_recommendation_restaurant_id is not null
    or p_branch_id is not null;

  if v_has_recommendation then
    if p_branch_menu_item_id is null
      or p_menu_item_id is null
      or p_recommendation_restaurant_id is null
      or p_branch_id is null
      or p_food_context_tag_key is not null
      or p_card_type <> 'restaurant'
      or p_restaurant_id is distinct from p_recommendation_restaurant_id then
      raise exception 'INVALID_RECOMMENDATION_IDENTITY' using errcode = '22023';
    end if;

    select true, mapping.food_context_tag_key
      into v_identity_ok, v_derived_context
    from public.branch_menu_items as branch_item
    join public.restaurant_branches as branch
      on branch.id = branch_item.branch_id
     and branch.restaurant_id = branch_item.restaurant_id
    join public.menu_items as item
      on item.id = branch_item.menu_item_id
     and item.restaurant_id = branch_item.restaurant_id
    join public.menu_categories as category
      on category.id = item.menu_category_id
    join public.menus as menu
      on menu.id = category.menu_id
     and menu.restaurant_id = item.restaurant_id
    join public.restaurants as restaurant
      on restaurant.id = item.restaurant_id
    left join public.meal_buddy_menu_item_food_context_mapping as mapping
      on mapping.menu_item_id = item.id
     and mapping.food_context_namespace = 'food'
     and mapping.active
     and mapping.retired_at is null
    left join public.social_interest_catalog as catalog
      on catalog.tag_key = mapping.food_context_tag_key
     and catalog.namespace = 'food'
     and catalog.selectable
     and catalog.active
    where branch_item.id = p_branch_menu_item_id
      and branch_item.menu_item_id = p_menu_item_id
      and branch_item.restaurant_id = p_recommendation_restaurant_id
      and branch_item.branch_id = p_branch_id
      and branch_item.availability in ('available', 'limited')
      and not branch_item.sold_out
      and branch_item.branch_specific_status = 'available'
      and branch.status = 'active'
      and item.status = 'active'
      and menu.status = 'published'
      and restaurant.status = 'active';

    if v_identity_ok is not true then
      raise exception 'INVALID_RECOMMENDATION_IDENTITY' using errcode = '22023';
    end if;

    -- A retired/missing mapping, or a mapping whose catalog target is no longer selectable,
    -- deliberately becomes null. The selected card is still created with frozen V1 behavior.
    if not exists (
      select 1 from public.social_interest_catalog as catalog
      where catalog.tag_key = v_derived_context
        and catalog.namespace = 'food'
        and catalog.selectable
        and catalog.active
    ) then
      v_derived_context := null;
    end if;
  else
    -- Existing internal/Development callers retain the frozen optional explicit-context seam.
    v_derived_context := p_food_context_tag_key;
  end if;

  return social_internal.create_meal_buddy_card_with_context(
    p_actor_user_id,
    p_card_type,
    p_intention_type,
    p_restaurant_id,
    p_area,
    p_dining_date,
    p_meal_period,
    p_preferred_time,
    p_general_cap,
    p_restaurant_cap,
    v_derived_context
  );
end;
$$;

comment on function social_internal.create_meal_buddy_card_from_recommendation(uuid, text, text, text, text, date, text, time, integer, integer, text, text, text, text, text) is
  'SR-2G-G atomic card create authority. Validates one selected live branch/menu/restaurant identity, snapshots its active canonical food mapping, and delegates unchanged quota/storage semantics to the frozen SR-2G-F writer. Missing mapping yields NULL; invalid identity fails closed.';

revoke all on function social_internal.create_meal_buddy_card_from_recommendation(uuid, text, text, text, text, date, text, time, integer, integer, text, text, text, text, text) from public;
revoke all on function social_internal.create_meal_buddy_card_from_recommendation(uuid, text, text, text, text, date, text, time, integer, integer, text, text, text, text, text) from anon;
revoke all on function social_internal.create_meal_buddy_card_from_recommendation(uuid, text, text, text, text, date, text, time, integer, integer, text, text, text, text, text) from authenticated;
revoke all on function social_internal.create_meal_buddy_card_from_recommendation(uuid, text, text, text, text, date, text, time, integer, integer, text, text, text, text, text) from authenticator;
revoke all on function social_internal.create_meal_buddy_card_from_recommendation(uuid, text, text, text, text, date, text, time, integer, integer, text, text, text, text, text) from service_role;
revoke all on function social_internal.create_meal_buddy_card_from_recommendation(uuid, text, text, text, text, date, text, time, integer, integer, text, text, text, text, text) from social_authority;
revoke all on function social_internal.create_meal_buddy_card_from_recommendation(uuid, text, text, text, text, date, text, time, integer, integer, text, text, text, text, text) from social_runtime_executor;

alter function social_internal.create_meal_buddy_card_from_recommendation(uuid, text, text, text, text, date, text, time, integer, integer, text, text, text, text, text)
  owner to meal_buddy_card_write_authority;

set local role meal_buddy_card_write_authority;
grant execute on function social_internal.create_meal_buddy_card_from_recommendation(uuid, text, text, text, text, date, text, time, integer, integer, text, text, text, text, text)
  to social_runtime_executor;
set local role postgres;

revoke create on schema social_internal from meal_buddy_card_write_authority;
revoke meal_buddy_card_write_authority from postgres granted by postgres;

commit;
