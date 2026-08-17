-- SR-2G-B: Meal Buddy card write, lifecycle and quota authority.
--
-- Turns the SR-2G-A durable card table into an authenticated write boundary. Three server-internal
-- functions own create, list and cancel; there is still no candidate pool, no ranking, no exposure
-- and no cross-owner read of any kind. SR-2G-C owns candidate eligibility.
--
-- WHY A DEDICATED OWNER ROLE. The card table is owned by postgres, and a SECURITY DEFINER function
-- owned by postgres would run every product write as superuser. A dedicated NOLOGIN / NOINHERIT /
-- NOBYPASSRLS owner keeps this capability set disjoint from social_authority (Candidate
-- Authorization), social_pair_read_authority (private Taste) and social_profile_projection_authority
-- (public projection), exactly as SR-1B-D2-B1 and SR-2C argued. This is a new AUTHORITY OWNER, not
-- a new runtime role: invocation authority still belongs to the established social_runtime_executor.
--
-- WHY EXPLICIT RLS POLICIES FOR THAT OWNER. The owner is NOBYPASSRLS and is not the table owner, so
-- row level security applies to it — the precise defect SR-2C hit. Each policy below is scoped TO
-- that one role. Correctness never rests on them: every function filters owner_user_id explicitly,
-- so ownership is enforced in the statement and the policy is only the second lock.
--
-- WHY THE CAP IS AN ARGUMENT. Entitlement lives in public.subscription_entitlements, which SR-2B
-- reads through the AUTHENTICATED user-scoped client. Moving that read onto the executor connection
-- would widen executor privilege into billing — the regression SR-2D explicitly refused. The Edge
-- therefore resolves entitlement through the frozen canonical resolver, derives the caps, and passes
-- them in. The caps are server-derived and never client-supplied; these functions are executable by
-- the executor alone, so no client can reach this argument at all.
--
-- WHY AN ADVISORY LOCK. Counting active cards and then inserting is a read-then-write race: two
-- concurrent creates could each observe the final free slot. A transaction-scoped advisory lock keyed
-- by (actor, card_type) serialises exactly the contended pair and nothing else, so the count and the
-- insert are one indivisible decision.
--
-- EXPIRY IS DERIVED, NEVER SUPPLIED. A caller cannot name expires_at. It is computed from the card's
-- own dining_date and meal_period in Asia/Taipei, so a card stops being active when its meal occasion
-- ends. late_night deliberately crosses midnight into the following local day.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1. Authority owner.
-- ---------------------------------------------------------------------------------------------
create role meal_buddy_card_write_authority with nologin noinherit nobypassrls;

comment on role meal_buddy_card_write_authority is
  'SR-2G-B Meal Buddy card write authority. Owns create/list/cancel only. Holds no Taste, projection, candidate-authorization, billing or cross-owner capability, and cannot log in.';

-- Membership is required for the SET LOCAL ROLE below. On PostgreSQL 16+ a CREATEROLE role that
-- creates another role receives ADMIN OPTION but NOT the right to SET ROLE to it, and the migration
-- runs as a non-superuser postgres. Every existing Social authority role carries this same
-- membership. The role is NOINHERIT, so membership confers no implicit privilege: postgres must
-- still SET ROLE explicitly, which is exactly what the grantor lifecycle below does.
grant meal_buddy_card_write_authority to postgres;

-- The owner must be able to reach its own functions' schema, exactly as social_authority,
-- social_pair_read_authority, social_profile_projection_authority and social_runtime_executor each
-- received. USAGE alone: no CREATE on this or any other schema.
grant usage on schema social_internal to meal_buddy_card_write_authority;

-- ---------------------------------------------------------------------------------------------
-- 2. Canonical local-time expiry derivation.
--
-- The end of the meal occasion, in Asia/Taipei. Anchored to the product's own four-period
-- vocabulary; late_night runs past midnight and therefore lands on the next local calendar day.
-- ---------------------------------------------------------------------------------------------
create function social_internal.meal_buddy_card_expires_at(
  p_dining_date date,
  p_meal_period text
)
returns timestamptz
language sql
immutable
as $$
  select case p_meal_period
    when 'breakfast'  then ((p_dining_date + time '11:00') at time zone 'Asia/Taipei')
    when 'lunch'      then ((p_dining_date + time '15:00') at time zone 'Asia/Taipei')
    when 'dinner'     then ((p_dining_date + time '22:00') at time zone 'Asia/Taipei')
    when 'late_night' then (((p_dining_date + 1) + time '02:00') at time zone 'Asia/Taipei')
  end
$$;

comment on function social_internal.meal_buddy_card_expires_at(date, text) is
  'SR-2G-B canonical card expiry. The end of the meal occasion in Asia/Taipei. late_night crosses midnight into the next local day. Never caller-supplied.';

-- ---------------------------------------------------------------------------------------------
-- 3. Create with atomic quota enforcement.
-- ---------------------------------------------------------------------------------------------
create function social_internal.create_meal_buddy_card(
  p_actor_user_id uuid,
  p_card_type text,
  p_intention_type text,
  p_restaurant_id text,
  p_area text,
  p_dining_date date,
  p_meal_period text,
  p_preferred_time time,
  p_general_cap integer,
  p_restaurant_cap integer
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
$$;

comment on function social_internal.create_meal_buddy_card(uuid, text, text, text, text, date, text, time, integer, integer) is
  'SR-2G-B atomic card create. The actor comes only from verified Edge identity and the caps only from the frozen entitlement resolver. Quota is enforced under a transaction-scoped advisory lock keyed by actor and card type, so two concurrent creates cannot both take the last slot. Returns the internal row; the raw id is sealed by the Edge and never reaches a client.';

-- ---------------------------------------------------------------------------------------------
-- 4. Owner-scoped list.
-- ---------------------------------------------------------------------------------------------
create function social_internal.list_owned_meal_buddy_cards(
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

  -- Deterministic order: dining date, then canonical period order (not alphabetical), then newest
  -- first, with the primary key as a stable final tie-break.
  -- `coalesce` is a SQL parser construct, not a catalog function, so it is never schema-qualified.
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
        'expires_at', card.expires_at
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

comment on function social_internal.list_owned_meal_buddy_cards(uuid) is
  'SR-2G-B owner-scoped active card list. The owner predicate is explicit and required; no argument can name another user, and cancelled or expired cards are never returned and never counted.';

-- ---------------------------------------------------------------------------------------------
-- 5. Idempotent owner-scoped cancel.
-- ---------------------------------------------------------------------------------------------
create function social_internal.cancel_meal_buddy_card(
  p_actor_user_id uuid,
  p_card_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_cancelled integer;
begin
  if p_actor_user_id is null then
    raise exception 'ACTOR_REQUIRED' using errcode = '28000';
  end if;
  if p_card_id is null then
    return pg_catalog.jsonb_build_object('ok', false);
  end if;

  -- Idempotent by construction: an already-cancelled card keeps its original cancellation instant,
  -- so repeating the operation is a success that changes nothing. An expired card may also be
  -- cancelled; it already consumes no quota.
  update public.meal_buddy_cards as card
  set cancelled_at = coalesce(card.cancelled_at, v_now)
  where card.id = p_card_id
    and card.owner_user_id = p_actor_user_id;

  get diagnostics v_cancelled = row_count;

  -- A card belonging to somebody else and a card that does not exist are one indistinguishable
  -- outcome. Nothing here can confirm that an opaque reference named a real card.
  return pg_catalog.jsonb_build_object('ok', v_cancelled = 1);
end;
$$;

comment on function social_internal.cancel_meal_buddy_card(uuid, uuid) is
  'SR-2G-B idempotent owner-scoped cancel. Ownership is part of the UPDATE predicate, so a foreign card is never touched and never distinguishable from a card that does not exist.';

-- ---------------------------------------------------------------------------------------------
-- 6. Table privileges for the authority owner, and the policies that make them reachable.
--
-- The owner is NOBYPASSRLS and does not own the table, so RLS applies to it. Each policy is scoped
-- to this one role. The functions themselves always filter owner_user_id, so these policies are the
-- second lock and never the first.
-- ---------------------------------------------------------------------------------------------
grant select, insert on table public.meal_buddy_cards to meal_buddy_card_write_authority;
grant update (cancelled_at) on table public.meal_buddy_cards to meal_buddy_card_write_authority;

create policy meal_buddy_cards_write_authority_read on public.meal_buddy_cards
  for select to meal_buddy_card_write_authority using (true);

create policy meal_buddy_cards_write_authority_insert on public.meal_buddy_cards
  for insert to meal_buddy_card_write_authority with check (true);

create policy meal_buddy_cards_write_authority_cancel on public.meal_buddy_cards
  for update to meal_buddy_card_write_authority using (true) with check (true);

-- ---------------------------------------------------------------------------------------------
-- 7. Ownership transfer and lockdown.
--
-- ORDER IS LOAD-BEARING. A new function inherits PostgreSQL's built-in default of PUBLIC EXECUTE,
-- and a REVOKE only removes grants made by the role issuing it. Revoking AFTER the ownership
-- transfer would be a silent no-op, because postgres would no longer be the grantor.
-- ---------------------------------------------------------------------------------------------
revoke all on function social_internal.meal_buddy_card_expires_at(date, text) from public;
revoke all on function social_internal.create_meal_buddy_card(uuid, text, text, text, text, date, text, time, integer, integer) from public;
revoke all on function social_internal.list_owned_meal_buddy_cards(uuid) from public;
revoke all on function social_internal.cancel_meal_buddy_card(uuid, uuid) from public;

revoke all on function social_internal.create_meal_buddy_card(uuid, text, text, text, text, date, text, time, integer, integer) from anon, authenticated, authenticator, service_role;
revoke all on function social_internal.list_owned_meal_buddy_cards(uuid) from anon, authenticated, authenticator, service_role;
revoke all on function social_internal.cancel_meal_buddy_card(uuid, uuid) from anon, authenticated, authenticator, service_role;
revoke all on function social_internal.meal_buddy_card_expires_at(date, text) from anon, authenticated, authenticator, service_role;

-- Transient: PostgreSQL requires the prospective function owner to hold CREATE on the schema at
-- ownership-transfer time. Revoked immediately after ownership moves, exactly as SR-1C and SR-2C
-- did, so the role is left holding USAGE alone and can never create an object of its own.
grant create on schema social_internal to meal_buddy_card_write_authority;

alter function social_internal.meal_buddy_card_expires_at(date, text) owner to meal_buddy_card_write_authority;
alter function social_internal.create_meal_buddy_card(uuid, text, text, text, text, date, text, time, integer, integer) owner to meal_buddy_card_write_authority;
alter function social_internal.list_owned_meal_buddy_cards(uuid) owner to meal_buddy_card_write_authority;
alter function social_internal.cancel_meal_buddy_card(uuid, uuid) owner to meal_buddy_card_write_authority;

revoke create on schema social_internal from meal_buddy_card_write_authority;

-- EXECUTE must be granted by the new owner: a grant issued by postgres after the transfer would not
-- be the owner's grant. SET LOCAL ROLE, never RESET ROLE, so the transaction's role stack is exact.
set local role meal_buddy_card_write_authority;
grant execute on function social_internal.create_meal_buddy_card(uuid, text, text, text, text, date, text, time, integer, integer) to social_runtime_executor;
grant execute on function social_internal.list_owned_meal_buddy_cards(uuid) to social_runtime_executor;
grant execute on function social_internal.cancel_meal_buddy_card(uuid, uuid) to social_runtime_executor;
set local role postgres;

commit;
