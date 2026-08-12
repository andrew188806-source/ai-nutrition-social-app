-- Social Runtime SR-1B-D2-B1 local-only migration.
--
-- Creates the AUTHORIZED PRIVATE TASTE READ authority: a second, separate NOLOGIN role that can read
-- exactly the fifty private columns SR-1A composes from, and one internal function that performs
-- Candidate Authorization and the private read in a SINGLE SQL STATEMENT.
--
-- WHY A SECOND ROLE. social_authority (SR-1B-D1) stays Candidate Authorization only — seven columns
-- across consumer_profiles, social_participation and social_blocks — and is NOT widened here. Keeping
-- Taste access in a distinct authority means a column added for the read path cannot silently widen
-- the authorization path, and it leaves D1's frozen guarantee untouched.
--
-- WHY ONE STATEMENT. A single SQL statement executes under one MVCC snapshot, so the authorization
-- predicate and all seven source reads observe the same instant. A block, pause or status change
-- committed before the snapshot denies the candidate outright; one committed after it cannot tear
-- this request. That is what makes "authorize then read" impossible to split here — there is no
-- second statement to interleave with. No explicit serializable transaction is required, and any
-- failure aborts the whole statement, so a query failure can never degrade into an empty array.
--
-- WHAT THIS IS NOT. No LOGIN role, no password, no database URL, no Edge Function, no Deno adapter,
-- no Mobile endpoint, no public RPC, no candidate pool, no ranking, no entitlement, no client
-- projection. Transport is D2-B3.
--
-- SQL IS TRANSPORT, NOT A SECOND EVIDENCE MAPPER. This function moves canonical INPUT ROWS only. It
-- performs no scoring, no normalization, no mapping, and constructs no snapshot or domain result.
-- Every semantic rule stays in the frozen TypeScript.
--
-- SEMANTICS COPIED FROM SR-1A, NOT REINVENTED. Audited from serverTasteFoundationRepository.ts:
--   * taste_profiles / nutrition_goals / dietary_restrictions: NO order, NO limit.
--   * meal_records / meal_record_items: order occurred_at DESC, limit = requested meal limit.
--   * favorite_restaurants / favorite_menu_items: order created_at DESC, limit = favorites limit,
--     applied to EACH table separately (SR-1A sums the two counts afterwards).
--   * requestedStartDate / requestedEndDate are recorded metadata in SR-1A and are NOT query
--     filters, so this function does not date-filter either.
--   * deleted_at and removed_at are filtered by frozen TypeScript, so rows carrying them are
--     returned here rather than dropped in SQL.
--
-- Additive and Development-safe: one new role, one new set of grants and policies, one new function.
-- No existing table, policy, grant, view or function is altered or dropped. No backfill.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1. The private-read authority role.
-- ---------------------------------------------------------------------------------------------
create role social_pair_read_authority with
  nologin
  noinherit
  nobypassrls
  nocreatedb
  nocreaterole
  nosuperuser
  noreplication;

comment on role social_pair_read_authority is
  'Owns the authorized private Taste read function. NOLOGIN and NOBYPASSRLS: it reads cross-user rows only through the role-scoped SELECT policies below, and only the fifty columns SR-1A composes from. Deliberately distinct from social_authority so Taste access and Candidate Authorization cannot widen each other.';

grant usage on schema social_internal to social_pair_read_authority;
-- Transient: PostgreSQL requires a prospective function owner to hold CREATE on the schema at the
-- moment of the ownership transfer. Revoked at the end of this migration.
grant create on schema social_internal to social_pair_read_authority;

-- ---------------------------------------------------------------------------------------------
-- 2. Column-level read authority — exactly the fifty columns SR-1A declares, and nothing else.
--
-- Deliberately absent: every ratings table, all five nutrition macro targets, nutrition_snapshot,
-- every name column, portion_snapshot, confidence_score, and every consumer profile field. Column
-- grants rather than table grants, so `select *` is impossible for this role.
-- ---------------------------------------------------------------------------------------------
grant select (id, user_id, preferred_cuisine_tags, preferred_meal_types, disliked_tastes,
              spice_preference, dining_style, payment_preference, created_at, updated_at)
  on table public.taste_profiles to social_pair_read_authority;

grant select (id, user_id, goal_label, starts_on, ends_on, is_active, created_at, updated_at)
  on table public.nutrition_goals to social_pair_read_authority;

grant select (id, user_id, restriction_type, label, severity, visibility, created_at, updated_at)
  on table public.dietary_restrictions to social_pair_read_authority;

grant select (id, user_id, meal_type, occurred_at, deleted_at)
  on table public.meal_records to social_pair_read_authority;

grant select (id, user_id, meal_record_id, restaurant_id, branch_id, menu_item_id,
              occurred_at, consumed_ratio)
  on table public.meal_record_items to social_pair_read_authority;

grant select (id, user_id, restaurant_id, created_at, removed_at)
  on table public.favorite_restaurants to social_pair_read_authority;

grant select (id, user_id, restaurant_id, menu_item_id, created_at, removed_at)
  on table public.favorite_menu_items to social_pair_read_authority;

-- ---------------------------------------------------------------------------------------------
-- 3. Role-scoped RLS policies.
--
-- Additive permissive SELECT policies scoped TO this role only. Permissive policies OR together
-- solely within the roles they apply to, so the existing owner-only policies — and therefore the
-- anon and authenticated view of all seven tables — are completely unaffected.
-- ---------------------------------------------------------------------------------------------
create policy taste_profiles_pair_read_authority on public.taste_profiles
  for select to social_pair_read_authority using (true);
create policy nutrition_goals_pair_read_authority on public.nutrition_goals
  for select to social_pair_read_authority using (true);
create policy dietary_restrictions_pair_read_authority on public.dietary_restrictions
  for select to social_pair_read_authority using (true);
create policy meal_records_pair_read_authority on public.meal_records
  for select to social_pair_read_authority using (true);
create policy meal_record_items_pair_read_authority on public.meal_record_items
  for select to social_pair_read_authority using (true);
create policy favorite_restaurants_pair_read_authority on public.favorite_restaurants
  for select to social_pair_read_authority using (true);
create policy favorite_menu_items_pair_read_authority on public.favorite_menu_items
  for select to social_pair_read_authority using (true);

-- ---------------------------------------------------------------------------------------------
-- 4. Additive EXECUTE on D1's canonical Candidate Authorization.
--
-- Only the SET primitive is granted. may_evaluate_candidate is deliberately NOT granted: this
-- function needs the authorized subset, never a per-pair boolean. The grant must be issued by the
-- owning role, so postgres takes transient membership and releases it below. D1's migration file is
-- not edited and social_authority gains nothing.
-- ---------------------------------------------------------------------------------------------
grant social_authority to postgres with inherit false, set true;
set local role social_authority;
grant execute on function social_internal.authorized_candidates(uuid, uuid[])
  to social_pair_read_authority;
-- Deliberately NOT `reset role`. RESET ROLE returns to the SESSION user, and the Supabase CLI runs
-- migrations as `cli_login_postgres` (NOINHERIT, member of postgres with SET only) after switching
-- with SET ROLE. RESET would therefore drop every privilege for the remainder of the migration —
-- observed as "no possible grantors" on the next statement. Switching explicitly to postgres keeps
-- the migration correct under both the CLI and a direct postgres session.
set local role postgres;

-- Transient membership so the ownership transfer below is permitted: PostgreSQL requires the
-- issuing role to be able to SET ROLE to the prospective owner, and CREATE ROLE leaves postgres
-- with admin_option but NOT set_option. Released at the end of this migration.
grant social_pair_read_authority to postgres with inherit false, set true;

-- ---------------------------------------------------------------------------------------------
-- 5. The one atomic authorized read.
--
-- PER-SUBJECT BOUNDING. Every bounded source is limited inside a LATERAL subquery evaluated once per
-- subject, so the actor and every candidate each receive the full requested window. A single global
-- LIMIT over `user_id = ANY(subjects)` would let one subject's rows starve another's evidence, which
-- would silently corrupt evidence confidence.
--
-- EXACT TRUNCATION. Each bounded source fetches requested_limit + 1 rows as a sentinel and reports
-- has_more from whether that extra row existed. Only the first requested_limit rows are returned, so
-- SR-1A's own frozen truncation rule still sees exactly the row count it would have seen through
-- PostgREST. has_more is EXACT metadata carried for future authority; substituting it into SR-1A's
-- frozen truncation computation would be a semantic change and must not happen without its own round.
--
-- ORDERING. The four bounded sources use SR-1A's canonical order, with id as a deterministic
-- tiebreaker SR-1A does not specify and therefore cannot depend on. The three unbounded sources have
-- no SR-1A-specified order at all, so id ascending is imposed purely for reproducibility.
--
-- NO WALL CLOCK. The function reads no clock. The single as-of instant for the actor and every
-- candidate stays with the trusted orchestrator, exactly as SR-1A requires.
-- ---------------------------------------------------------------------------------------------
create function social_internal.authorized_pair_sources(
  p_actor_user_id uuid,
  p_candidate_user_ids uuid[],
  p_meal_limit integer,
  p_favorites_limit integer
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  with authorized as (
    select candidate.user_id
    from social_internal.authorized_candidates(p_actor_user_id, p_candidate_user_ids) as candidate(user_id)
    where p_meal_limit is not null and p_meal_limit >= 0
      and p_favorites_limit is not null and p_favorites_limit >= 0
  ),
  -- The actor appears only when at least one candidate is authorized: an ineligible actor, or one
  -- with nothing to compare against, receives no rows at all.
  subjects as (
    select p_actor_user_id as user_id, true as is_actor
    where exists (select 1 from authorized)
    union all
    select a.user_id, false as is_actor from authorized a
  ),

  taste_profiles_agg as (
    select s.user_id as subject_id,
      pg_catalog.jsonb_build_object(
        'rows', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id', t.id, 'user_id', t.user_id,
            'preferred_cuisine_tags', t.preferred_cuisine_tags,
            'preferred_meal_types', t.preferred_meal_types,
            'disliked_tastes', t.disliked_tastes,
            'spice_preference', t.spice_preference,
            'dining_style', t.dining_style,
            'payment_preference', t.payment_preference,
            'created_at', t.created_at, 'updated_at', t.updated_at
          ) order by t.id) filter (where t.id is not null), '[]'::jsonb),
        'requested_limit', null,
        'returned_count', pg_catalog.count(t.id),
        'has_more', false
      ) as payload
    from subjects s
    left join public.taste_profiles t on t.user_id = s.user_id
    group by s.user_id
  ),
  nutrition_goals_agg as (
    select s.user_id as subject_id,
      pg_catalog.jsonb_build_object(
        'rows', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id', g.id, 'user_id', g.user_id, 'goal_label', g.goal_label,
            'starts_on', g.starts_on, 'ends_on', g.ends_on, 'is_active', g.is_active,
            'created_at', g.created_at, 'updated_at', g.updated_at
          ) order by g.id) filter (where g.id is not null), '[]'::jsonb),
        'requested_limit', null,
        'returned_count', pg_catalog.count(g.id),
        'has_more', false
      ) as payload
    from subjects s
    left join public.nutrition_goals g on g.user_id = s.user_id
    group by s.user_id
  ),
  dietary_restrictions_agg as (
    select s.user_id as subject_id,
      pg_catalog.jsonb_build_object(
        'rows', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id', d.id, 'user_id', d.user_id, 'restriction_type', d.restriction_type,
            'label', d.label, 'severity', d.severity, 'visibility', d.visibility,
            'created_at', d.created_at, 'updated_at', d.updated_at
          ) order by d.id) filter (where d.id is not null), '[]'::jsonb),
        'requested_limit', null,
        'returned_count', pg_catalog.count(d.id),
        'has_more', false
      ) as payload
    from subjects s
    left join public.dietary_restrictions d on d.user_id = s.user_id
    group by s.user_id
  ),

  meal_records_probe as (
    select s.user_id as subject_id, bounded.*
    from subjects s
    left join lateral (
      select m.id, m.user_id, m.meal_type, m.occurred_at, m.deleted_at,
             pg_catalog.row_number() over (order by m.occurred_at desc, m.id) as rn
      from public.meal_records m
      where m.user_id = s.user_id
      order by m.occurred_at desc, m.id
      limit p_meal_limit + 1
    ) bounded on true
  ),
  meal_records_agg as (
    select subject_id,
      pg_catalog.jsonb_build_object(
        'rows', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id', id, 'user_id', user_id, 'meal_type', meal_type,
            'occurred_at', occurred_at, 'deleted_at', deleted_at
          ) order by rn) filter (where rn is not null and rn <= p_meal_limit), '[]'::jsonb),
        'requested_limit', p_meal_limit,
        'returned_count', pg_catalog.count(*) filter (where rn is not null and rn <= p_meal_limit),
        'has_more', coalesce(pg_catalog.bool_or(rn > p_meal_limit), false)
      ) as payload
    from meal_records_probe group by subject_id
  ),

  meal_record_items_probe as (
    select s.user_id as subject_id, bounded.*
    from subjects s
    left join lateral (
      select i.id, i.user_id, i.meal_record_id, i.restaurant_id, i.branch_id, i.menu_item_id,
             i.occurred_at, i.consumed_ratio,
             pg_catalog.row_number() over (order by i.occurred_at desc, i.id) as rn
      from public.meal_record_items i
      where i.user_id = s.user_id
      order by i.occurred_at desc, i.id
      limit p_meal_limit + 1
    ) bounded on true
  ),
  meal_record_items_agg as (
    select subject_id,
      pg_catalog.jsonb_build_object(
        'rows', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id', id, 'user_id', user_id, 'meal_record_id', meal_record_id,
            'restaurant_id', restaurant_id, 'branch_id', branch_id, 'menu_item_id', menu_item_id,
            'occurred_at', occurred_at, 'consumed_ratio', consumed_ratio
          ) order by rn) filter (where rn is not null and rn <= p_meal_limit), '[]'::jsonb),
        'requested_limit', p_meal_limit,
        'returned_count', pg_catalog.count(*) filter (where rn is not null and rn <= p_meal_limit),
        'has_more', coalesce(pg_catalog.bool_or(rn > p_meal_limit), false)
      ) as payload
    from meal_record_items_probe group by subject_id
  ),

  favorite_restaurants_probe as (
    select s.user_id as subject_id, bounded.*
    from subjects s
    left join lateral (
      select f.id, f.user_id, f.restaurant_id, f.created_at, f.removed_at,
             pg_catalog.row_number() over (order by f.created_at desc, f.id) as rn
      from public.favorite_restaurants f
      where f.user_id = s.user_id
      order by f.created_at desc, f.id
      limit p_favorites_limit + 1
    ) bounded on true
  ),
  favorite_restaurants_agg as (
    select subject_id,
      pg_catalog.jsonb_build_object(
        'rows', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id', id, 'user_id', user_id, 'restaurant_id', restaurant_id,
            'created_at', created_at, 'removed_at', removed_at
          ) order by rn) filter (where rn is not null and rn <= p_favorites_limit), '[]'::jsonb),
        'requested_limit', p_favorites_limit,
        'returned_count', pg_catalog.count(*) filter (where rn is not null and rn <= p_favorites_limit),
        'has_more', coalesce(pg_catalog.bool_or(rn > p_favorites_limit), false)
      ) as payload
    from favorite_restaurants_probe group by subject_id
  ),

  favorite_menu_items_probe as (
    select s.user_id as subject_id, bounded.*
    from subjects s
    left join lateral (
      select f.id, f.user_id, f.restaurant_id, f.menu_item_id, f.created_at, f.removed_at,
             pg_catalog.row_number() over (order by f.created_at desc, f.id) as rn
      from public.favorite_menu_items f
      where f.user_id = s.user_id
      order by f.created_at desc, f.id
      limit p_favorites_limit + 1
    ) bounded on true
  ),
  favorite_menu_items_agg as (
    select subject_id,
      pg_catalog.jsonb_build_object(
        'rows', coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id', id, 'user_id', user_id, 'restaurant_id', restaurant_id,
            'menu_item_id', menu_item_id, 'created_at', created_at, 'removed_at', removed_at
          ) order by rn) filter (where rn is not null and rn <= p_favorites_limit), '[]'::jsonb),
        'requested_limit', p_favorites_limit,
        'returned_count', pg_catalog.count(*) filter (where rn is not null and rn <= p_favorites_limit),
        'has_more', coalesce(pg_catalog.bool_or(rn > p_favorites_limit), false)
      ) as payload
    from favorite_menu_items_probe group by subject_id
  ),

  subject_payload as (
    select s.user_id, s.is_actor,
      pg_catalog.jsonb_build_object(
        'taste_profiles', tp.payload,
        'nutrition_goals', ng.payload,
        'dietary_restrictions', dr.payload,
        'meal_records', mr.payload,
        'meal_record_items', mi.payload,
        'favorite_restaurants', fr.payload,
        'favorite_menu_items', fm.payload
      ) as sources
    from subjects s
    join taste_profiles_agg tp on tp.subject_id = s.user_id
    join nutrition_goals_agg ng on ng.subject_id = s.user_id
    join dietary_restrictions_agg dr on dr.subject_id = s.user_id
    join meal_records_agg mr on mr.subject_id = s.user_id
    join meal_record_items_agg mi on mi.subject_id = s.user_id
    join favorite_restaurants_agg fr on fr.subject_id = s.user_id
    join favorite_menu_items_agg fm on fm.subject_id = s.user_id
  )

  select pg_catalog.jsonb_build_object(
    'actor', (
      select pg_catalog.jsonb_build_object('user_id', p.user_id, 'sources', p.sources)
      from subject_payload p where p.is_actor
    ),
    'authorized_candidate_user_ids', (
      select coalesce(pg_catalog.jsonb_agg(a.user_id order by a.user_id), '[]'::jsonb)
      from authorized a
    ),
    'candidates', (
      select coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object('user_id', p.user_id, 'sources', p.sources) order by p.user_id
      ), '[]'::jsonb)
      from subject_payload p where not p.is_actor
    )
  );
$$;

comment on function social_internal.authorized_pair_sources(uuid, uuid[], integer, integer) is
  'Authorized private Taste read. One SQL statement, one MVCC snapshot: Candidate Authorization and all seven source reads observe the same instant. Returns minimized canonical INPUT rows only — no snapshot, no score, no confidence, no verdict, no client DTO. Server-internal; no client role may execute it.';

-- ---------------------------------------------------------------------------------------------
-- 6. Lockdown. The PUBLIC revokes must run while postgres still owns the function: a REVOKE only
-- removes grants made by the issuing role, so revoking after the ownership transfer would be a
-- silent no-op — the defect SR-1B-D1's Development acceptance caught.
-- ---------------------------------------------------------------------------------------------
revoke all on function social_internal.authorized_pair_sources(uuid, uuid[], integer, integer) from public;
revoke all on function social_internal.authorized_pair_sources(uuid, uuid[], integer, integer) from anon;
revoke all on function social_internal.authorized_pair_sources(uuid, uuid[], integer, integer) from authenticated;
revoke all on function social_internal.authorized_pair_sources(uuid, uuid[], integer, integer) from authenticator;

alter function social_internal.authorized_pair_sources(uuid, uuid[], integer, integer)
  owner to social_pair_read_authority;

revoke create on schema social_internal from social_pair_read_authority;

-- Release both transient memberships. Supabase's automatic ADMIN grant (grantor supabase_admin)
-- survives on each role and cannot be revoked by postgres; what these revokes guarantee is that no
-- role retains INHERIT or SET, so nothing can act as either authority without an explicit re-grant.
revoke social_authority from postgres;
revoke social_pair_read_authority from postgres;

commit;
