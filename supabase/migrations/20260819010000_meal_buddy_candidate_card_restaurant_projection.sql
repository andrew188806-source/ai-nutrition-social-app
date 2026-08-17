-- SR-2G-D: Meal Buddy candidate card restaurant display bridge.
--
-- THE ONLY SCHEMA DELTA SR-2G-D NEEDS. Every other authority it composes — the SR-2G-C compatible
-- card pool, the SR-1D Taste sources, the SR-2C profile projection and the SR-2C-R1 interest
-- projection — is already executable by social_runtime_executor, so nothing else is granted here.
--
-- WHY A BRIDGE EXISTS AT ALL. A candidate card must show the restaurant NAME, but public.restaurants
-- carries RLS and neither the executor nor the pool authority can read it. Rather than granting the
-- executor a table it would then hold for every purpose, this migration gives the existing pool
-- authority column-level SELECT on exactly two columns and wraps the join in one narrow primitive.
--
-- COMPOSITION, NOT DUPLICATION. The function CALLS the frozen
-- social_internal.canonical_meal_buddy_candidate_cards and only left-joins a name onto its rows. It
-- re-implements no eligibility rule, no ownership check, no one-card-per-owner reduction and no
-- ordering: delete this file and the pool semantics are entirely unchanged.
--
-- NO NEW ROLE. meal_buddy_candidate_pool_authority already owns "compatible Meal Buddy cards for an
-- actor". A restaurant display name attached to one of those cards is the same concern.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1. Two columns, nothing else. `select *` on public.restaurants stays impossible for this role.
-- ---------------------------------------------------------------------------------------------
grant select (id, name) on table public.restaurants to meal_buddy_candidate_pool_authority;

-- public.restaurants is RLS-protected. This NOLOGIN authority is neither the table owner nor
-- NOBYPASSRLS-exempt, so without a policy scoped to it the join would return no name at all.
-- Additive permissive SELECT scoped TO this role only: permissive policies OR together solely within
-- the roles they apply to, so the existing anon, authenticated and restaurant-staff views of
-- public.restaurants are completely unaffected. Row breadth is still bounded by the frozen pool.
create policy restaurants_meal_buddy_candidate_pool_read on public.restaurants
  for select to meal_buddy_candidate_pool_authority using (true);

-- ---------------------------------------------------------------------------------------------
-- 2. The bridge primitive.
-- ---------------------------------------------------------------------------------------------
-- Transient grantor borrow, frozen safe pattern: INHERIT FALSE so postgres never silently gains the
-- role's privileges, SET TRUE so it can act as the owner. Revoked by grantor at the end.
grant meal_buddy_candidate_pool_authority to postgres with inherit false, set true;
-- Transient: PostgreSQL requires a prospective function owner to hold CREATE on the schema at the
-- moment of the ownership transfer. Revoked below.
grant create on schema social_internal to meal_buddy_candidate_pool_authority;

create function social_internal.meal_buddy_candidate_cards_with_restaurant(
  p_actor_user_id uuid,
  p_source_card_id uuid,
  p_authority_instant timestamptz
)
returns table (
  candidate_owner_user_id uuid,
  candidate_card_id uuid,
  card_type text,
  intention_type text,
  restaurant_id text,
  restaurant_name text,
  dining_date date,
  meal_period text
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  -- The frozen pool is the sole authority for which cards exist and in what order. This adds a name
  -- and drops the columns the candidate DTO must never expose (area, preferred_time, created_at,
  -- expires_at); a left join so a general card, or a card whose restaurant row is gone, still
  -- survives with a null name rather than vanishing from the pool.
  select
    pool.candidate_owner_user_id,
    pool.candidate_card_id,
    pool.card_type,
    pool.intention_type,
    pool.restaurant_id,
    restaurant.name,
    pool.dining_date,
    pool.meal_period
  from social_internal.canonical_meal_buddy_candidate_cards(
         p_actor_user_id, p_source_card_id, p_authority_instant
       ) as pool
  left join public.restaurants as restaurant
    on restaurant.id = pool.restaurant_id
  order by pool.candidate_owner_user_id asc, pool.candidate_card_id asc;
$$;

comment on function social_internal.meal_buddy_candidate_cards_with_restaurant(uuid, uuid, timestamptz) is
  'SR-2G-D Meal Buddy candidate card projection. Calls the frozen SR-2G-C compatible-card pool and left-joins the restaurant display name, adding no eligibility rule, no ownership check and no ordering of its own. Returns only the public card context the candidate DTO needs. Server-internal; no client role may execute it.';

-- Remove default and unwanted execution while postgres is still the actual grantor and owner.
revoke all on function social_internal.meal_buddy_candidate_cards_with_restaurant(uuid, uuid, timestamptz) from public;
revoke all on function social_internal.meal_buddy_candidate_cards_with_restaurant(uuid, uuid, timestamptz) from anon;
revoke all on function social_internal.meal_buddy_candidate_cards_with_restaurant(uuid, uuid, timestamptz) from authenticated;
revoke all on function social_internal.meal_buddy_candidate_cards_with_restaurant(uuid, uuid, timestamptz) from authenticator;
revoke all on function social_internal.meal_buddy_candidate_cards_with_restaurant(uuid, uuid, timestamptz) from service_role;
revoke all on function social_internal.meal_buddy_candidate_cards_with_restaurant(uuid, uuid, timestamptz) from social_authority;
revoke all on function social_internal.meal_buddy_candidate_cards_with_restaurant(uuid, uuid, timestamptz) from social_pair_read_authority;
revoke all on function social_internal.meal_buddy_candidate_cards_with_restaurant(uuid, uuid, timestamptz) from social_profile_projection_authority;
revoke all on function social_internal.meal_buddy_candidate_cards_with_restaurant(uuid, uuid, timestamptz) from social_runtime_executor;

alter function social_internal.meal_buddy_candidate_cards_with_restaurant(uuid, uuid, timestamptz)
  owner to meal_buddy_candidate_pool_authority;

-- The executor receives one capability only. The grant must be issued as the new function owner.
set local role meal_buddy_candidate_pool_authority;
grant execute on function social_internal.meal_buddy_candidate_cards_with_restaurant(uuid, uuid, timestamptz)
  to social_runtime_executor;
set local role postgres;

-- The pool authority keeps its frozen schema USAGE but no durable CREATE authority.
revoke create on schema social_internal from meal_buddy_candidate_pool_authority;

-- Restore the exact membership topology. GRANTED BY names the one row this migration created, so the
-- frozen supabase_admin row keeps its ADMIN OPTION and no grantor debt survives.
revoke meal_buddy_candidate_pool_authority from postgres granted by postgres;

commit;
