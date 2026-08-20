-- SR-2G-F: Meal Buddy meal/menu context matching authority.
--
-- WHAT THIS ADDS. A Meal Buddy card may now declare ONE canonical food context — 火鍋, 壽司, 拉麵 —
-- and the candidate pool is then bucketed by how each candidate relates to that context. Two cards
-- that are identical in every frozen respect (same actor, same dining_date, same meal_period, same
-- hard eligibility) can therefore produce different candidate results, which is the entire point of
-- this round.
--
-- WHY THE SR-2C-R1 CATALOG IS THE CONTEXT IDENTITY. `public.social_interest_catalog` already is the
-- repository's canonical, data-driven food taxonomy: `tag_key` is its stable machine identity and
-- the ONLY identifier it ever exposes publicly, localized text lives in a separate label table, and
-- 火鍋 / 壽司 / 拉麵 are already seeded as food.taiwanese_chinese.hotpot, food.japanese.sushi and
-- food.japanese.ramen. Inventing a second food vocabulary here would create a parallel taxonomy that
-- immediately needs reconciling with the first.
--
-- WHY NOT public.menu_items. A menu item is restaurant-scoped, so a `general` card could never carry
-- one, and NO mapping from a menu item to a food category exists anywhere in this repository. Using
-- menu identity would therefore require inventing exactly the parallel taxonomy described above,
-- plus a per-restaurant mapping table, to express "this person wants hotpot".
--
-- WHY THE CONTEXT LIVES ON THE CARD. meal-buddy-candidate-list accepts `{ sourceCardRef }` and
-- nothing else. Putting the context on the card keeps that request contract byte-identical: the
-- server resolves the context from the actor's own sealed card, so no client can submit a context,
-- a weight, a dish name or a score. The ref seals card IDENTITY; the context is card STATE, read
-- fresh on every request, so an mbc2 ref generation is neither required nor introduced.
--
-- BACKWARD COMPATIBILITY IS STRUCTURAL, NOT A CODE PATH. The column is nullable and every
-- pre-SR-2G-F card has it null. A null source context makes the classification below return
-- 'neutral' for EVERY candidate, which is one bucket, which is the frozen SR-2G-E2 order unchanged.
-- Legacy cards are not special-cased, not rejected and not hidden; they are the degenerate case of
-- the same rule.
--
-- EVIDENCE, AND WHAT IS NEVER EVIDENCE. Strongest evidence is the candidate CARD's own declared
-- context, because it is the same authority as the source and it is about this specific meal.
-- SR-2C-R1 food selections are promoted here to POSITIVE-ONLY secondary evidence: they can lift a
-- candidate to 'matched', never demote one. Absence of a tag never means dislike, so missing
-- evidence is 'neutral'. The `general` interest namespace is never read. No allergen, restriction,
-- medical condition, health goal, nutrition fact or inferred health signal is read by any statement
-- in this file — meal context is explicit food preference, never medical inference.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1. Additive card context columns.
--
-- The companion namespace column exists so the composite foreign key can pin the namespace through
-- referential integrity rather than trust — exactly the idiom social_profile_interest_selection
-- already uses. A `general` tag can therefore never be recorded as a card's food context even if a
-- caller lies about it, and `on delete restrict` makes a dangling context impossible.
-- ---------------------------------------------------------------------------------------------
alter table public.meal_buddy_cards
  add column food_context_tag_key text,
  add column food_context_namespace text,
  add constraint meal_buddy_cards_food_context_namespace_valid
    check (food_context_namespace is null or food_context_namespace = 'food'),
  add constraint meal_buddy_cards_food_context_shape
    check ((food_context_tag_key is null) = (food_context_namespace is null)),
  add constraint meal_buddy_cards_food_context_fkey
    foreign key (food_context_tag_key, food_context_namespace)
    references public.social_interest_catalog (tag_key, namespace) on delete restrict;

comment on column public.meal_buddy_cards.food_context_tag_key is
  'SR-2G-F optional canonical meal/menu context. A public.social_interest_catalog tag_key in the food namespace, which is the stable machine identity SR-2C-R1 already exposes. NULL means no context, which reproduces frozen SR-2G-E2 behavior exactly. Never a dish name, never free text, never a raw menu or restaurant identifier.';
comment on column public.meal_buddy_cards.food_context_namespace is
  'Constant food companion to food_context_tag_key. Exists only so the composite foreign key pins the namespace by referential integrity; a general-namespace tag can never become a food context.';

-- Partial: a card without a context is never a context lookup, and a cancelled card is never in the
-- pool the classification runs over.
create index meal_buddy_cards_food_context_idx
  on public.meal_buddy_cards (food_context_tag_key)
  where food_context_tag_key is not null and cancelled_at is null;

-- ---------------------------------------------------------------------------------------------
-- 2. Narrow reads for the two existing authorities. No new role is created: "which cards are
--    compatible for an actor" and "author an owned card" are the same concerns these roles already
--    own, now with one more column each.
-- ---------------------------------------------------------------------------------------------

-- The pool authority classifies candidates, so it needs the catalog's parent relationship and the
-- candidates' declared food selections. Column-scoped: `select *` stays impossible for this role.
grant select (tag_key, namespace, parent_key, depth, selectable, active)
  on table public.social_interest_catalog to meal_buddy_candidate_pool_authority;
grant select (user_id, tag_key, namespace)
  on table public.social_profile_interest_selection to meal_buddy_candidate_pool_authority;

-- social_profile_interest_selection carries an owner-only policy for `authenticated`. This NOLOGIN
-- authority is neither the table owner nor NOBYPASSRLS-exempt, so without a policy scoped to it the
-- classification would evaluate auth.uid() as NULL on the executor connection and see no selections
-- at all — every candidate would silently fall to 'neutral'. Additive permissive SELECT scoped TO
-- this role only: permissive policies OR together solely within the roles they apply to, so the
-- owner-only `authenticated` view is completely unaffected.
create policy social_profile_interest_selection_meal_buddy_context_read
  on public.social_profile_interest_selection
  for select to meal_buddy_candidate_pool_authority using (true);

-- The write authority validates a submitted context against the catalog before it can be stored.
grant select (tag_key, namespace, selectable, active)
  on table public.social_interest_catalog to meal_buddy_card_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 3. The context classification primitive.
--
-- COMPOSITION, NOT DUPLICATION. It CALLS the frozen SR-2G-D bridge, which in turn calls the frozen
-- SR-2G-C pool. It re-implements no ownership check, no active-state rule, no dining_date or
-- meal_period equality, no restaurant rule, no one-card-per-owner reduction and no block or
-- participation authorization. Delete this file and every one of those semantics is unchanged.
--
-- IT ALSO REMOVES NOBODY. Every row the frozen pool returns is returned here, labelled. Context
-- reorders and re-buckets; it never shrinks the eligible universe, so it can never empty a pool.
-- ---------------------------------------------------------------------------------------------
grant meal_buddy_candidate_pool_authority to postgres with inherit false, set true;
grant create on schema social_internal to meal_buddy_candidate_pool_authority;

create function social_internal.canonical_meal_buddy_context_candidates(
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
  meal_period text,
  context_state text
)
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  with pool as (
    -- The frozen authority chain. Nothing below widens, redirects or re-filters it.
    select *
    from social_internal.meal_buddy_candidate_cards_with_restaurant(
      p_actor_user_id, p_source_card_id, p_authority_instant
    )
  ),
  source_context as (
    -- Ownership is re-asserted rather than assumed, exactly as the frozen pool does. A context can
    -- only ever be read from a card the actor actually owns.
    select
      card.food_context_tag_key as tag_key,
      -- depth-1 selectable tags carry their top-level category as parent_key; the coalesce keeps a
      -- depth-0 row (which is not selectable and cannot be stored) from producing a null family.
      coalesce(catalog.parent_key, catalog.tag_key) as family_key
    from public.meal_buddy_cards as card
    join public.social_interest_catalog as catalog
      on catalog.tag_key = card.food_context_tag_key
     and catalog.namespace = 'food'
    where card.id = p_source_card_id
      and card.owner_user_id = p_actor_user_id
      and card.food_context_tag_key is not null
  ),
  candidate_context as (
    -- The strongest evidence: the candidate card's own declared context for this same meal.
    select
      pool.candidate_card_id,
      card.food_context_tag_key as tag_key,
      coalesce(catalog.parent_key, catalog.tag_key) as family_key
    from pool
    join public.meal_buddy_cards as card
      on card.id = pool.candidate_card_id
    join public.social_interest_catalog as catalog
      on catalog.tag_key = card.food_context_tag_key
     and catalog.namespace = 'food'
  ),
  declared_evidence as (
    -- POSITIVE-ONLY secondary evidence, food namespace only. This CTE can add 'matched'; there is no
    -- statement anywhere in this function through which a missing selection produces a negative.
    select distinct selection.user_id
    from public.social_profile_interest_selection as selection
    join source_context on selection.tag_key = source_context.tag_key
    where selection.namespace = 'food'
      and selection.user_id in (select pool.candidate_owner_user_id from pool)
  )
  select
    pool.candidate_owner_user_id,
    pool.candidate_card_id,
    pool.card_type,
    pool.intention_type,
    pool.restaurant_id,
    pool.restaurant_name,
    pool.dining_date,
    pool.meal_period,
    case
      -- No source context: one bucket, so the frozen SR-2G-E2 order survives byte for byte.
      when not exists (select 1 from source_context) then 'neutral'
      -- Explicit candidate card context. Exact agreement is the only 'matched'; the same cuisine
      -- family is related but not the same meal, so it stays neutral rather than being promoted;
      -- only an explicitly declared DIFFERENT family is 'unsupported'.
      when candidate_context.tag_key is not null then
        case
          when candidate_context.tag_key = (select tag_key from source_context) then 'matched'
          when candidate_context.family_key = (select family_key from source_context) then 'neutral'
          else 'unsupported'
        end
      -- No card context: the candidate's own SR-2C-R1 food declaration may lift them, never demote.
      when exists (
        select 1 from declared_evidence
        where declared_evidence.user_id = pool.candidate_owner_user_id
      ) then 'matched'
      else 'neutral'
    end as context_state
  from pool
  left join candidate_context on candidate_context.candidate_card_id = pool.candidate_card_id
  -- Stable transport order only, identical to the frozen bridge. This is NOT ranking and NOT the
  -- bucket order: SR-2A still ranks, and the Edge composes the buckets.
  order by pool.candidate_owner_user_id asc, pool.candidate_card_id asc;
$$;

comment on function social_internal.canonical_meal_buddy_context_candidates(uuid, uuid, timestamptz) is
  'SR-2G-F meal/menu context classification. Calls the frozen SR-2G-D card bridge (and through it the frozen SR-2G-C pool), then labels every returned row matched / neutral / unsupported against the source card canonical food context. Adds no eligibility rule and removes no candidate. A null source context labels everything neutral, which is exactly frozen pre-SR-2G-F behavior. Reads only the food interest namespace; never an allergen, restriction, condition, goal or nutrition fact. No ranking, no exposure, no limit. Server-internal only.';

revoke all on function social_internal.canonical_meal_buddy_context_candidates(uuid, uuid, timestamptz) from public;
revoke all on function social_internal.canonical_meal_buddy_context_candidates(uuid, uuid, timestamptz) from anon;
revoke all on function social_internal.canonical_meal_buddy_context_candidates(uuid, uuid, timestamptz) from authenticated;
revoke all on function social_internal.canonical_meal_buddy_context_candidates(uuid, uuid, timestamptz) from authenticator;
revoke all on function social_internal.canonical_meal_buddy_context_candidates(uuid, uuid, timestamptz) from service_role;
revoke all on function social_internal.canonical_meal_buddy_context_candidates(uuid, uuid, timestamptz) from social_authority;
revoke all on function social_internal.canonical_meal_buddy_context_candidates(uuid, uuid, timestamptz) from social_pair_read_authority;
revoke all on function social_internal.canonical_meal_buddy_context_candidates(uuid, uuid, timestamptz) from social_profile_projection_authority;
revoke all on function social_internal.canonical_meal_buddy_context_candidates(uuid, uuid, timestamptz) from social_runtime_executor;

alter function social_internal.canonical_meal_buddy_context_candidates(uuid, uuid, timestamptz)
  owner to meal_buddy_candidate_pool_authority;

set local role meal_buddy_candidate_pool_authority;
grant execute on function social_internal.canonical_meal_buddy_context_candidates(uuid, uuid, timestamptz)
  to social_runtime_executor;
set local role postgres;

revoke create on schema social_internal from meal_buddy_candidate_pool_authority;
revoke meal_buddy_candidate_pool_authority from postgres granted by postgres;

-- ---------------------------------------------------------------------------------------------
-- 4. Context-aware successor write and list authority.
--
-- WHY NEW FUNCTION NAMES RATHER THAN AN OVERLOAD. Adding a defaulted parameter to
-- social_internal.create_meal_buddy_card would leave two candidate functions for a ten-argument
-- call and make resolution depend on PostgreSQL's preference rules. A distinct name is
-- unambiguous, and the frozen ten-argument function keeps working untouched for anything still
-- calling it.
-- ---------------------------------------------------------------------------------------------
grant meal_buddy_card_write_authority to postgres with inherit false, set true;
grant create on schema social_internal to meal_buddy_card_write_authority;

create function social_internal.create_meal_buddy_card_with_context(
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
  p_food_context_tag_key text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_cap integer;
  v_used integer;
  v_expires_at timestamptz;
  v_card public.meal_buddy_cards%rowtype;
  v_general integer;
  v_restaurant integer;
  v_context_ok boolean;
begin
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

  -- The context must be a CURRENTLY selectable, active food tag. A depth-0 category is
  -- selectable = false in the catalog and is rejected here for the same reason Profile Settings
  -- rejects it: it is a grouping, not a choice. An archived tag cannot be newly chosen either.
  if p_food_context_tag_key is not null then
    select true into v_context_ok
    from public.social_interest_catalog as catalog
    where catalog.tag_key = p_food_context_tag_key
      and catalog.namespace = 'food'
      and catalog.selectable
      and catalog.active;
    if v_context_ok is not true then
      raise exception 'INVALID_FOOD_CONTEXT' using errcode = '22023';
    end if;
  end if;

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
    (owner_user_id, card_type, intention_type, restaurant_id, area, dining_date, meal_period,
     preferred_time, expires_at, food_context_tag_key, food_context_namespace)
  values
    (p_actor_user_id, p_card_type, p_intention_type, p_restaurant_id, p_area, p_dining_date,
     p_meal_period, p_preferred_time, v_expires_at, p_food_context_tag_key,
     case when p_food_context_tag_key is null then null else 'food' end)
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
      'expires_at', v_card.expires_at,
      'food_context_tag_key', v_card.food_context_tag_key
    ),
    'counts', pg_catalog.jsonb_build_object('general', v_general, 'restaurant', v_restaurant)
  );
end;
$$;

comment on function social_internal.create_meal_buddy_card_with_context(uuid, text, text, text, text, date, text, time, integer, integer, text) is
  'SR-2G-F context-aware successor to social_internal.create_meal_buddy_card. Identical quota, advisory lock, expiry and ownership semantics; the only addition is an optional canonical food context validated against the SR-2C-R1 catalog as selectable and active before it can be stored. A null context produces a card indistinguishable from a frozen SR-2G-B card.';

create function social_internal.list_owned_meal_buddy_cards_with_context(
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_cards jsonb;
  v_general integer;
  v_restaurant integer;
begin
  if p_actor_user_id is null then
    raise exception 'ACTOR_REQUIRED' using errcode = '28000';
  end if;

  -- The frozen order is reproduced exactly: dining date, canonical period order, newest first,
  -- primary key tie-break. Context is a returned field only and never an ordering term.
  select coalesce(pg_catalog.jsonb_agg(entry order by entry_rank), '[]'::jsonb)
  into v_cards
  from (
    select
      pg_catalog.jsonb_build_object(
        'id', card.id,
        'card_type', card.card_type,
        'intention_type', card.intention_type,
        'restaurant_id', card.restaurant_id,
        'area', card.area,
        'dining_date', card.dining_date,
        'meal_period', card.meal_period,
        'preferred_time', card.preferred_time,
        'created_at', card.created_at,
        'expires_at', card.expires_at,
        'food_context_tag_key', card.food_context_tag_key
      ) as entry,
      pg_catalog.row_number() over (
        order by
          card.dining_date asc,
          case card.meal_period
            when 'breakfast' then 1
            when 'lunch' then 2
            when 'dinner' then 3
            when 'late_night' then 4
          end asc,
          card.created_at desc,
          card.id asc
      ) as entry_rank
    from public.meal_buddy_cards as card
    where card.owner_user_id = p_actor_user_id
      and card.cancelled_at is null
      and card.expires_at > v_now
  ) as ordered;

  select
    pg_catalog.count(*) filter (where card.card_type = 'general'),
    pg_catalog.count(*) filter (where card.card_type = 'restaurant')
  into v_general, v_restaurant
  from public.meal_buddy_cards as card
  where card.owner_user_id = p_actor_user_id
    and card.cancelled_at is null
    and card.expires_at > v_now;

  return pg_catalog.jsonb_build_object(
    'cards', v_cards,
    'counts', pg_catalog.jsonb_build_object('general', v_general, 'restaurant', v_restaurant)
  );
end;
$$;

comment on function social_internal.list_owned_meal_buddy_cards_with_context(uuid) is
  'SR-2G-F context-aware successor to social_internal.list_owned_meal_buddy_cards. Same owner predicate, same active-only filter and the same deterministic order; the only addition is food_context_tag_key on each card so the owner can see and choose among their own contexts.';

revoke all on function social_internal.create_meal_buddy_card_with_context(uuid, text, text, text, text, date, text, time, integer, integer, text) from public;
revoke all on function social_internal.create_meal_buddy_card_with_context(uuid, text, text, text, text, date, text, time, integer, integer, text) from anon;
revoke all on function social_internal.create_meal_buddy_card_with_context(uuid, text, text, text, text, date, text, time, integer, integer, text) from authenticated;
revoke all on function social_internal.create_meal_buddy_card_with_context(uuid, text, text, text, text, date, text, time, integer, integer, text) from authenticator;
revoke all on function social_internal.create_meal_buddy_card_with_context(uuid, text, text, text, text, date, text, time, integer, integer, text) from service_role;
revoke all on function social_internal.create_meal_buddy_card_with_context(uuid, text, text, text, text, date, text, time, integer, integer, text) from social_authority;
revoke all on function social_internal.create_meal_buddy_card_with_context(uuid, text, text, text, text, date, text, time, integer, integer, text) from social_runtime_executor;
revoke all on function social_internal.list_owned_meal_buddy_cards_with_context(uuid) from public;
revoke all on function social_internal.list_owned_meal_buddy_cards_with_context(uuid) from anon;
revoke all on function social_internal.list_owned_meal_buddy_cards_with_context(uuid) from authenticated;
revoke all on function social_internal.list_owned_meal_buddy_cards_with_context(uuid) from authenticator;
revoke all on function social_internal.list_owned_meal_buddy_cards_with_context(uuid) from service_role;
revoke all on function social_internal.list_owned_meal_buddy_cards_with_context(uuid) from social_authority;
revoke all on function social_internal.list_owned_meal_buddy_cards_with_context(uuid) from social_runtime_executor;

alter function social_internal.create_meal_buddy_card_with_context(uuid, text, text, text, text, date, text, time, integer, integer, text)
  owner to meal_buddy_card_write_authority;
alter function social_internal.list_owned_meal_buddy_cards_with_context(uuid)
  owner to meal_buddy_card_write_authority;

set local role meal_buddy_card_write_authority;
grant execute on function social_internal.create_meal_buddy_card_with_context(uuid, text, text, text, text, date, text, time, integer, integer, text)
  to social_runtime_executor;
grant execute on function social_internal.list_owned_meal_buddy_cards_with_context(uuid)
  to social_runtime_executor;
set local role postgres;

revoke create on schema social_internal from meal_buddy_card_write_authority;
revoke meal_buddy_card_write_authority from postgres granted by postgres;

commit;
