-- SR-2G-C: canonical compatible-card candidate pool authority.
--
-- One question, answered once, server-side: given actor A and one owned ACTIVE source Meal Buddy
-- Card, which other Meal Buddy Cards are compatible candidate cards, and which of their owners
-- survive the existing Social authorization rules?
--
-- WHAT THIS PHASE IS NOT. No Taste comparison, no SR-2A ranking, no SR-2B exposure cap, no SR-2C
-- projection, no candidate reference, no Edge endpoint and no Mobile surface. This function returns
-- an authorized compatible-card source set and stops. SR-2G-D orchestrates the rest.
--
-- WHY A THIRD CARD-SCOPED ROLE. The pool needs a CROSS-USER read of meal_buddy_cards plus the right
-- to call the frozen Candidate Authorization primitive. meal_buddy_card_write_authority already has
-- the first, but giving it the second would fuse owner-scoped WRITE authority with candidate
-- authorization — precisely the capability mixing SR-1B-D2-B1 split apart and SR-2C re-argued. A
-- dedicated NOLOGIN / NOINHERIT / NOBYPASSRLS owner keeps read-pool, write and authorization
-- disjoint. Note the new role receives no capability that is novel to this database:
-- social_pair_read_authority already holds EXECUTE on authorized_candidates for the same reason.
--
-- WHY AUTHORIZATION IS COMPOSED, NEVER REIMPLEMENTED. Self-exclusion, blocks, participation state
-- and active-profile eligibility all live in social_internal.authorized_candidates. This function
-- hands it the candidate owner ids and keeps only the subset it returns. There is no block table,
-- participation table or profile predicate anywhere below.
--
-- WHY ONE CARD PER OWNER. The frozen exposure unit is the PERSON (SR-2B caps people, not cards), so
-- the pool reduces each owner to a single card BEFORE authorization and before anything downstream
-- can count. The choice is deterministic — newest created_at, then the primary key as a stable
-- tie-break — so the same database state always yields the same card.
--
-- NO PRODUCT CAP. There is no LIMIT here and no caller-supplied bound. Free 3 / Premium 10 remain
-- SR-2B exposure authority; capping here would starve the ranking that has not run yet.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1. Dedicated pool authority.
-- ---------------------------------------------------------------------------------------------
create role meal_buddy_candidate_pool_authority with nologin noinherit nobypassrls;

comment on role meal_buddy_candidate_pool_authority is
  'SR-2G-C Meal Buddy candidate pool authority. Holds exactly two capabilities: a cross-user SELECT on meal_buddy_cards and EXECUTE on the frozen Candidate Authorization primitive. It can write nothing, cannot log in, and holds no Taste, projection, exposure or billing capability.';

-- Membership is required for the SET LOCAL ROLE grantor steps below. On PostgreSQL 16+ a CREATEROLE
-- role that creates another role receives ADMIN OPTION but not the right to SET ROLE to it, and this
-- migration runs as a non-superuser postgres. The role is NOINHERIT, so membership confers no
-- implicit privilege.
grant meal_buddy_candidate_pool_authority to postgres;

grant usage on schema social_internal to meal_buddy_candidate_pool_authority;

-- ---------------------------------------------------------------------------------------------
-- 2. Cross-user read of the card table, and the policy that makes it reachable.
--
-- The role is NOBYPASSRLS and does not own the table, so row level security applies to it. The
-- policy is scoped to this one role and is SELECT only: there is no INSERT, UPDATE or DELETE
-- privilege for it anywhere, so the pool authority can never author or alter a card.
-- ---------------------------------------------------------------------------------------------
grant select on table public.meal_buddy_cards to meal_buddy_candidate_pool_authority;

create policy meal_buddy_cards_candidate_pool_read on public.meal_buddy_cards
  for select to meal_buddy_candidate_pool_authority using (true);

-- ---------------------------------------------------------------------------------------------
-- 3. The canonical compatible-card pool.
--
-- HARD ELIGIBILITY, and nothing else:
--     owner differs from the actor
--     candidate is active at the authority instant
--     dining_date matches exactly
--     meal_period matches exactly
--     restaurant_id matches ONLY when both cards are restaurant-type
--
-- DELIBERATELY NOT ELIGIBILITY: area, intention_type, preferred_time, food category, menu item,
-- nutrition goal, willingness to chat, Taste, entitlement, verification, distance and activity.
-- A general card is deliberately broader than a restaurant card, so restaurant↔general pairs remain
-- compatible in both directions: the restaurant may be chosen before OR after matching, and the
-- product must not split into two pools over that.
-- ---------------------------------------------------------------------------------------------
create function social_internal.canonical_meal_buddy_candidate_cards(
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
  area text,
  dining_date date,
  meal_period text,
  preferred_time time,
  created_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  with source as (
    -- Ownership is part of the predicate, not an assumption. A valid raw card id belonging to
    -- somebody else yields no source row and therefore an empty pool, even though the future Edge
    -- layer will already have opened an actor-bound reference. Defence in depth is required.
    select
      card.owner_user_id,
      card.card_type,
      card.restaurant_id,
      card.dining_date,
      card.meal_period
    from public.meal_buddy_cards as card
    where card.id = p_source_card_id
      and card.owner_user_id = p_actor_user_id
      and card.cancelled_at is null
      and card.expires_at > p_authority_instant
  ),
  compatible as (
    select
      candidate.id,
      candidate.owner_user_id,
      candidate.card_type,
      candidate.intention_type,
      candidate.restaurant_id,
      candidate.area,
      candidate.dining_date,
      candidate.meal_period,
      candidate.preferred_time,
      candidate.created_at,
      candidate.expires_at
    from public.meal_buddy_cards as candidate
    cross join source
    where candidate.owner_user_id <> source.owner_user_id
      and candidate.cancelled_at is null
      and candidate.expires_at > p_authority_instant
      and candidate.dining_date = source.dining_date
      and candidate.meal_period = source.meal_period
      and (
        source.card_type <> 'restaurant'
        or candidate.card_type <> 'restaurant'
        or candidate.restaurant_id = source.restaurant_id
      )
  ),
  one_per_owner as (
    select
      compatible.*,
      pg_catalog.row_number() over (
        partition by compatible.owner_user_id
        order by compatible.created_at desc, compatible.id asc
      ) as owner_rank
    from compatible
  ),
  selected as (
    select * from one_per_owner where one_per_owner.owner_rank = 1
  ),
  -- Self exclusion, blocks, participation and active-profile eligibility are the frozen
  -- authorization primitive's job. Only the subset it returns survives.
  authorized as (
    select authorized_owner.user_id
    from social_internal.authorized_candidates(
      p_actor_user_id,
      (select coalesce(pg_catalog.array_agg(selected.owner_user_id), '{}'::uuid[]) from selected)
    ) as authorized_owner(user_id)
  )
  select
    selected.owner_user_id,
    selected.id,
    selected.card_type,
    selected.intention_type,
    selected.restaurant_id,
    selected.area,
    selected.dining_date,
    selected.meal_period,
    selected.preferred_time,
    selected.created_at,
    selected.expires_at
  from selected
  join authorized on authorized.user_id = selected.owner_user_id
  -- Stable transport order only. This is NOT ranking: SR-2A owns ranking, and SR-2G-D must not let
  -- this ordering reach the product.
  order by selected.owner_user_id asc, selected.id asc
$$;

comment on function social_internal.canonical_meal_buddy_candidate_cards(uuid, uuid, timestamptz) is
  'SR-2G-C canonical compatible-card pool. Validates the owned active source card, applies hard card eligibility (owner differs, active, same dining_date, same meal_period, restaurant equality only when both cards are restaurant-type), reduces to one card per owner by newest created_at with a stable id tie-break, then keeps only owners returned by the frozen Candidate Authorization primitive. No ranking, no exposure cap, no projection, no limit. Server-internal only.';

-- ---------------------------------------------------------------------------------------------
-- 4. Ownership transfer and lockdown.
--
-- ORDER IS LOAD-BEARING. A new function inherits PostgreSQL's default of PUBLIC EXECUTE, and a
-- REVOKE only removes grants made by the role issuing it, so revoking after the ownership transfer
-- would be a silent no-op.
-- ---------------------------------------------------------------------------------------------
revoke all on function social_internal.canonical_meal_buddy_candidate_cards(uuid, uuid, timestamptz) from public;
revoke all on function social_internal.canonical_meal_buddy_candidate_cards(uuid, uuid, timestamptz) from anon, authenticated, authenticator, service_role;

-- Transient: PostgreSQL requires the prospective function owner to hold CREATE on the schema at
-- ownership-transfer time. Revoked immediately after, exactly as SR-1C, SR-2C and SR-2G-B did.
grant create on schema social_internal to meal_buddy_candidate_pool_authority;
alter function social_internal.canonical_meal_buddy_candidate_cards(uuid, uuid, timestamptz)
  owner to meal_buddy_candidate_pool_authority;
revoke create on schema social_internal from meal_buddy_candidate_pool_authority;

-- ---------------------------------------------------------------------------------------------
-- TRANSIENT GRANTOR LIFECYCLE.
--
-- The frozen Candidate Authorization primitive is owned by social_authority, so only social_authority
-- can grant EXECUTE on it. social_pair_read_authority already holds this exact grant for the same
-- compositional reason, so nothing novel is conferred — but on PostgreSQL 16+ this migration's
-- postgres role holds ADMIN OPTION on social_authority WITHOUT the SET option, and therefore cannot
-- assume it. The SET option is borrowed for exactly three statements and then removed.
--
-- WHY THE MEMBERSHIP IS REVOKED RATHER THAN SET BACK TO FALSE. pg_auth_members is keyed by
-- (role, member, grantor). The baseline row was granted by supabase_admin; a GRANT issued here is a
-- SECOND row granted by postgres, and `WITH SET FALSE` only clears SET on that new row — leaving it
-- in place with INHERIT defaulting to TRUE. Measured in Development: the naive restoration yields
-- 2 rows with inherit_option = true, which is a durable privilege delta. Revoking the row this
-- migration created, and only that row, returns the posture to exactly one supabase_admin row with
-- admin=true, inherit=false, set=false. INHERIT is additionally pinned false on the borrowed grant
-- so the borrowed authority can never be exercised implicitly.
grant social_authority to postgres with inherit false, set true;

set local role social_authority;
grant execute on function social_internal.authorized_candidates(uuid, uuid[])
  to meal_buddy_candidate_pool_authority;
set local role postgres;

-- GRANTED BY postgres targets only the row this migration added; the frozen supabase_admin row is
-- untouched, so ADMIN OPTION is preserved exactly as it was.
revoke social_authority from postgres granted by postgres;

-- Invocation authority stays with the established runtime executor. No client role can reach this
-- function, and it is deliberately not exposed as a PostgREST-callable RPC.
set local role meal_buddy_candidate_pool_authority;
grant execute on function social_internal.canonical_meal_buddy_candidate_cards(uuid, uuid, timestamptz)
  to social_runtime_executor;
set local role postgres;

commit;
