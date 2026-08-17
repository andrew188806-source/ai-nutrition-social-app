-- SR-2C-R1: public Social interest projection authority.
--
-- ADDITIVE, NOT A REWRITE. The frozen SR-2C primitive
-- social_internal.project_exposed_social_profiles(uuid, uuid[]) is left byte-identical and keeps its
-- exactly five public-safe columns. Interests arrive through this SECOND primitive, which takes the
-- same actor + server-owned candidate array contract and is composed with SR-2C at the read layer.
-- Extending the frozen function in place would have changed a shape three frozen SR-2C guard checks
-- pin, for no gain.
--
-- WHY THE EXISTING ROLE. social_profile_projection_authority already owns "public-safe facts about
-- other people's profiles". Public interest tags are exactly that, so reusing it keeps the
-- capability sets disjoint rather than minting a fourth Social authority for the same concern. It
-- gains two narrow table reads and nothing else.
--
-- CURRENT VALUES ONLY. The projection joins the candidate's CURRENT rows in
-- social_profile_interest_selection. There is no card join, no snapshot table and no
-- interest-at-card-creation concept anywhere in this migration: updating Settings changes the very
-- next read of an unmodified Meal Buddy card.
--
-- WHAT IT NEVER RETURNS. No user id, no selection row id, no catalog surrogate id (tag_key IS the
-- identity), no localized label as identity, no inference source, no confidence, no Taste score and
-- no health metadata. category_key is returned explicitly so a client never has to derive a parent
-- relationship from a display string.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1. Narrow reads for the existing projection authority.
-- ---------------------------------------------------------------------------------------------
grant select (tag_key, namespace, parent_key, depth, selectable, display_order, active)
  on table public.social_interest_catalog to social_profile_projection_authority;
grant select (user_id, tag_key, namespace)
  on table public.social_profile_interest_selection to social_profile_projection_authority;

-- social_profile_interest_selection carries an owner-only policy for `authenticated`. This NOLOGIN
-- authority is neither the table owner nor NOBYPASSRLS-exempt, so without a policy scoped to it the
-- projection would evaluate auth.uid() as NULL on the server-only executor connection and return no
-- rows. Additive permissive SELECT scoped TO this role only: permissive policies OR together solely
-- within the roles they apply to, so the owner-only authenticated view is completely unaffected.
create policy social_profile_interest_selection_projection_authority
  on public.social_profile_interest_selection
  for select to social_profile_projection_authority using (true);

-- ---------------------------------------------------------------------------------------------
-- 2. The interest projection primitive.
-- ---------------------------------------------------------------------------------------------
-- Transient: PostgreSQL requires a prospective function owner to hold CREATE on the schema at the
-- moment of the ownership transfer. Revoked below.
grant create on schema social_internal to social_profile_projection_authority;
-- Transient grantor borrow, frozen safe pattern: INHERIT FALSE so postgres never silently gains the
-- role's privileges, SET TRUE so it can act as the owner for the two grants that require it. Revoked
-- by grantor at the end, restoring the exact membership topology.
grant social_profile_projection_authority to postgres with inherit false, set true;

create function social_internal.project_public_social_interests(
  p_actor_user_id uuid,
  p_candidate_user_ids uuid[]
)
returns table (
  exposure_ordinal integer,
  namespace text,
  tag_key text,
  category_key text,
  display_order integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_count integer;
begin
  if p_actor_user_id is null then
    raise exception 'SOCIAL_INTEREST_ACTOR_REQUIRED' using errcode = '22023';
  end if;
  if p_candidate_user_ids is null then
    raise exception 'SOCIAL_INTEREST_CANDIDATES_REQUIRED' using errcode = '22023';
  end if;

  v_count := pg_catalog.array_length(p_candidate_user_ids, 1);
  -- An empty exposure is a successful projection of zero candidates, never an error.
  if v_count is null then
    return;
  end if;
  -- The same frozen SR-2B Premium exposure cap SR-2C enforces. No caller can raise it.
  if v_count > 10 then
    raise exception 'SOCIAL_INTEREST_CANDIDATE_LIMIT_EXCEEDED' using errcode = '22023';
  end if;
  if pg_catalog.array_position(p_candidate_user_ids, null::uuid) is not null then
    raise exception 'SOCIAL_INTEREST_CANDIDATE_NULL' using errcode = '22023';
  end if;
  if (
    select pg_catalog.count(distinct candidate.user_id)
    from pg_catalog.unnest(p_candidate_user_ids) as candidate(user_id)
  ) <> v_count then
    raise exception 'SOCIAL_INTEREST_CANDIDATE_DUPLICATE' using errcode = '22023';
  end if;

  -- A candidate with no selections simply contributes no rows. That is an empty interest list at the
  -- read layer, never a missing profile and never a fabricated default.
  return query
  with requested as (
    select candidate.user_id, candidate.ordinality
    from pg_catalog.unnest(p_candidate_user_ids) with ordinality as candidate(user_id, ordinality)
  ),
  authorized as (
    select pool.user_id
    from social_internal.canonical_candidate_pool(p_actor_user_id) as pool(user_id)
  )
  select (requested.ordinality - 1)::integer,
         selection.namespace,
         selection.tag_key,
         catalog.parent_key,
         catalog.display_order
  from requested
  join authorized on authorized.user_id = requested.user_id
  join public.social_profile_interest_selection as selection
    on selection.user_id = requested.user_id
  join public.social_interest_catalog as catalog
    on catalog.tag_key = selection.tag_key
  where catalog.active
  order by requested.ordinality, selection.namespace, catalog.display_order, selection.tag_key;
end;
$$;

comment on function social_internal.project_public_social_interests(uuid, uuid[]) is
  'SR-2C-R1 public Social interest projection. Accepts the verified actor plus at most ten server-owned SR-2B exposed candidates, re-checks each against the canonical candidate pool, and returns the candidate owner CURRENT public interest selections keyed by zero-based exposure ordinal. Complete fine-grained selections, never truncated: the compact three-category card limit is presentation only. Returns no user id, no selection row id and no catalog surrogate id. Server-internal; no client role may execute it.';

-- Remove default and unwanted execution while postgres is still the actual grantor and owner.
revoke all on function social_internal.project_public_social_interests(uuid, uuid[]) from public;
revoke all on function social_internal.project_public_social_interests(uuid, uuid[]) from anon;
revoke all on function social_internal.project_public_social_interests(uuid, uuid[]) from authenticated;
revoke all on function social_internal.project_public_social_interests(uuid, uuid[]) from authenticator;
revoke all on function social_internal.project_public_social_interests(uuid, uuid[]) from service_role;
revoke all on function social_internal.project_public_social_interests(uuid, uuid[]) from social_authority;
revoke all on function social_internal.project_public_social_interests(uuid, uuid[]) from social_pair_read_authority;
revoke all on function social_internal.project_public_social_interests(uuid, uuid[]) from social_runtime_executor;

alter function social_internal.project_public_social_interests(uuid, uuid[])
  owner to social_profile_projection_authority;

-- The defensive candidate re-check calls a social_authority-owned function, so that grant must be
-- issued while acting as that exact owner. Same transient borrow, same by-grantor restoration.
grant social_authority to postgres with inherit false, set true;
set local role social_authority;
grant execute on function social_internal.canonical_candidate_pool(uuid)
  to social_profile_projection_authority;
set local role postgres;
revoke social_authority from postgres granted by postgres;

-- The executor receives one capability only. The grant must be issued as the new function owner.
set local role social_profile_projection_authority;
grant execute on function social_internal.project_public_social_interests(uuid, uuid[])
  to social_runtime_executor;
set local role postgres;

-- The projection authority keeps its frozen schema USAGE but no durable CREATE authority.
revoke create on schema social_internal from social_profile_projection_authority;

-- Restore the exact membership topology. GRANTED BY names the one row this migration created, so the
-- frozen supabase_admin row keeps its ADMIN OPTION and no grantor debt survives.
revoke social_profile_projection_authority from postgres granted by postgres;

commit;
