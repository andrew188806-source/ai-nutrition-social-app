-- SR-2G-A: canonical Meal Buddy card authority.
--
-- The first server-side representation of a 飯友卡. Until now a Meal Buddy Card existed only in
-- Mobile device storage under a device-local string id (`${cardType}-${createdAt}`) owned by the
-- literal user "current-user", which is not an identity and cannot be matched against.
--
-- WHAT THIS PHASE IS NOT. There is no candidate pool, no eligibility predicate, no ranking, no
-- exposure, no projection and no client write path here. This migration establishes durable card
-- identity, ownership and lifecycle only. SR-2G-B owns the entitlement-aware write authority and
-- the quota rules; SR-2G-C owns candidate eligibility. Encoding any of that here would freeze a
-- matching rule into an irreversible migration before its authority round has run.
--
-- WHY NO status COLUMN. A mutable `expired` flag plus an `expires_at` timestamp is dual authority:
-- the two can disagree, and the flag then needs a sweeper to stay true. Effective state is instead
-- derived from two immutable-in-meaning facts, evaluated against the request instant:
--     cancelled : cancelled_at is not null
--     expired   : cancelled_at is null and expires_at <= now
--     active    : cancelled_at is null and expires_at >  now
-- `matched` / `fulfilled` are action-phase concepts and deliberately absent.
--
-- WHY NO UNIQUE CONSTRAINT ON (owner, card_type, ...). The product already allows several active
-- cards per user — Free 1 per type, Premium 3 general + 2 restaurant. Those caps are entitlement
-- dependent and therefore cannot be expressed as a static UNIQUE index without permanently
-- forbidding the Premium case. Quota belongs to transactional write authority in SR-2G-B.
--
-- WHY dining_date IS A date, NOT A timestamptz. A dining date is a local calendar fact: "2026-08-20
-- dinner" in Taipei is the same card wherever the server runs. Storing an instant would re-open the
-- UTC drift the Mobile helper already suffers (`toISOString().slice(0,10)` yields the previous day
-- between 00:00 and 08:00 Taipei). The canonical rule is: dining_date is the Asia/Taipei calendar
-- date, computed by the writer, and this column stores it verbatim.
--
-- NO CLIENT WRITE PRIVILEGE. `authenticated` receives SELECT only, and RLS narrows that to the
-- caller's own rows. There is no INSERT/UPDATE/DELETE grant at all, so no policy mistake in a later
-- round can open a direct client write path, and no client can author created_at or expires_at.
--
-- NO RUNTIME-EXECUTOR GRANT YET. social_runtime_executor gets nothing here on purpose: it has no
-- reason to read cards until SR-2G-B introduces the pool primitive that needs them. Granting ahead
-- of a consumer would widen privilege with no authority to justify it.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1. Canonical card table.
-- ---------------------------------------------------------------------------------------------
create table public.meal_buddy_cards (
  id uuid not null default gen_random_uuid(),
  owner_user_id uuid not null,
  card_type text not null,
  intention_type text not null,
  restaurant_id text,
  area text,
  dining_date date not null,
  meal_period text not null,
  preferred_time time,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  cancelled_at timestamptz,
  constraint meal_buddy_cards_pkey primary key (id),
  constraint meal_buddy_cards_owner_fkey foreign key (owner_user_id)
    references auth.users (id) on delete cascade,
  constraint meal_buddy_cards_restaurant_fkey foreign key (restaurant_id)
    references public.restaurants (id),
  constraint meal_buddy_cards_card_type_valid
    check (card_type in ('general', 'restaurant')),
  constraint meal_buddy_cards_intention_type_valid
    check (intention_type in ('chat_first', 'eat_together')),
  constraint meal_buddy_cards_meal_period_valid
    check (meal_period in ('breakfast', 'lunch', 'dinner', 'late_night')),
  -- A restaurant card without a restaurant is not a weaker card, it is a contradiction. A general
  -- card may still carry a restaurant as a suggestion; that is not hard eligibility.
  constraint meal_buddy_cards_restaurant_card_requires_restaurant
    check (card_type <> 'restaurant' or restaurant_id is not null),
  constraint meal_buddy_cards_expiry_after_creation
    check (expires_at > created_at),
  constraint meal_buddy_cards_cancelled_not_before_creation
    check (cancelled_at is null or cancelled_at >= created_at)
);

comment on table public.meal_buddy_cards is
  'SR-2G-A canonical Meal Buddy card authority. One row per 飯友卡. Effective state is derived from cancelled_at and expires_at against the request instant, never from a stored status flag. Carries no ranking, score, entitlement, verification, seen, invite, match or chat state.';
comment on column public.meal_buddy_cards.id is
  'Internal durable card identity. NEVER exposed to a client: SR-2G-B/C hand out sealed opaque mbc1 references instead, so a raw card id can be neither read nor enumerated.';
comment on column public.meal_buddy_cards.owner_user_id is
  'The authenticated author. Ownership is proven server-side by this column, never by a client assertion.';
comment on column public.meal_buddy_cards.card_type is
  'general = restaurant is at most a suggestion, settled after matching. restaurant = the card is bound to one canonical restaurant chosen before matching.';
comment on column public.meal_buddy_cards.intention_type is
  'Product intent only. Not an eligibility predicate in V1: chat_first and eat_together are compatible intents, not exclusive ones.';
comment on column public.meal_buddy_cards.restaurant_id is
  'Canonical public.restaurants identity. Nullable for general cards. Hard eligibility only when both cards are restaurant-type, which SR-2G-C decides, not this migration.';
comment on column public.meal_buddy_cards.area is
  'Optional free-text presentation and future-signal value. Deliberately NOT a V1 eligibility predicate: no canonical area vocabulary exists, and filtering on free text would silently empty the pool.';
comment on column public.meal_buddy_cards.dining_date is
  'Asia/Taipei local calendar date of the intended meal. A date, not an instant, because a dining date is a local calendar fact.';
comment on column public.meal_buddy_cards.meal_period is
  'Canonical four-value period enum. The coarse matching unit; preferred_time is presentation detail beneath it.';
comment on column public.meal_buddy_cards.preferred_time is
  'Optional finer-grained local time within meal_period. Never a matching predicate in V1 — the frozen demo compared free-text time strings for exact equality, which is not a contract.';
comment on column public.meal_buddy_cards.expires_at is
  'When the card stops being active. Half of the derived lifecycle; there is no mutable expired flag to disagree with it.';
comment on column public.meal_buddy_cards.cancelled_at is
  'Set when the owner withdraws the card. The other half of the derived lifecycle. A cancelled card is never revived; a new card is authored instead.';

-- ---------------------------------------------------------------------------------------------
-- 2. Indexes. Three, each serving an access path that already exists or is required by the very
--    next round. No speculative analytics index is declared.
-- ---------------------------------------------------------------------------------------------

-- (a) Owner path. Deliberately NOT partial: it must also serve the ON DELETE CASCADE from
--     auth.users, which touches cancelled rows too. A `where cancelled_at is null` index would
--     leave the cascade to a sequential scan — the same reasoning SR-1B-B applied to social_blocks.
create index meal_buddy_cards_owner_idx
  on public.meal_buddy_cards (owner_user_id, dining_date);

-- (b) Pool path for SR-2G-B/C: candidate cards are found by date and period. Partial, because a
--     cancelled card is never a candidate and never needs to be in this index.
create index meal_buddy_cards_pool_idx
  on public.meal_buddy_cards (dining_date, meal_period)
  where cancelled_at is null;

-- (c) Restaurant path. public.restaurants is the referenced parent, and a referencing column that
--     is not index-covered forces a scan of this table on every parent delete.
create index meal_buddy_cards_restaurant_idx
  on public.meal_buddy_cards (restaurant_id)
  where restaurant_id is not null;

-- ---------------------------------------------------------------------------------------------
-- 3. Row level security and privilege.
--
-- Policy and privilege are evaluated together: a policy is unreachable without the privilege, and a
-- privilege is unbounded without the policy. Reads are narrowed to the owner by policy; writes stay
-- closed at the privilege layer entirely.
-- ---------------------------------------------------------------------------------------------
alter table public.meal_buddy_cards enable row level security;

-- The ONLY direct read authority: the caller's own cards. No policy exists that could match another
-- user's row, so a cross-user probe returns zero rows rather than being merely hidden. This is not
-- the candidate read path — candidate discovery never runs as the calling user.
create policy meal_buddy_cards_owner_read on public.meal_buddy_cards
  for select
  to authenticated
  using (auth.uid() = owner_user_id);

revoke all on table public.meal_buddy_cards from public;
revoke all on table public.meal_buddy_cards from anon;
revoke all on table public.meal_buddy_cards from authenticated;
grant select on table public.meal_buddy_cards to authenticated;

commit;
