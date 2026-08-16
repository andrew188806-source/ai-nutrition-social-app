-- SR-2C: public Social profile projection authority.
--
-- Turns an already-authorized, already-ranked, already-entitled SR-2B exposed candidate list into
-- public-safe profile facts. The caller supplies only the verified actor and the server-owned
-- exposed candidate array; it can name no column, no limit, no page and no arbitrary target.
--
-- WHY A THIRD AUTHORITY ROLE. social_authority owns Candidate Authorization and social_pair_read_
-- authority owns the private Taste read. Neither may widen into public profile facts, and profile
-- projection must not be able to widen into either of them. A dedicated NOLOGIN owner keeps all
-- three capability sets disjoint, exactly as SR-1B-D2-B1 argued when it split the Taste read away
-- from Candidate Authorization.
--
-- WHY NOT consumer_public_profiles. That legacy view carries no user_id join key, a far broader
-- field list including privacy-conflicted health summaries, and no security_barrier. It is left
-- completely untouched here; SR-2C uses its own narrow protected primitive instead.
--
-- COLUMN MINIMISATION. The role receives column-level SELECT on exactly seven consumer_profiles
-- columns: four projected, one join key and two predicates. `select *` is impossible for this role,
-- and consumer_private_profiles, Taste, subscription, meal and goal tables stay unreachable.
--
-- ONE SNAPSHOT FOR THE READ. Every validation below inspects only the input array, so the single
-- statement that touches the database is the final `return query`. Candidate authorization and all
-- profile facts therefore observe one MVCC snapshot.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1. The public profile projection authority role.
-- ---------------------------------------------------------------------------------------------
create role social_profile_projection_authority with
  nologin
  noinherit
  nobypassrls
  nocreatedb
  nocreaterole
  nosuperuser
  noreplication;

comment on role social_profile_projection_authority is
  'Owns the SR-2C public Social profile projection function. NOLOGIN and NOBYPASSRLS: it reads cross-user rows only through the column-level SELECT granted below, and only the public-safe columns SR-2C projects. Deliberately distinct from social_authority and social_pair_read_authority so public profile projection, Candidate Authorization and private Taste access cannot widen each other.';

grant usage on schema social_internal to social_profile_projection_authority;
-- Transient: PostgreSQL requires a prospective function owner to hold CREATE on the schema at the
-- moment of the ownership transfer. Revoked at the end of this migration.
grant create on schema social_internal to social_profile_projection_authority;

-- ---------------------------------------------------------------------------------------------
-- 2. Column-level read authority — exactly the seven columns the projection needs, nothing else.
--
-- Deliberately absent: profile_id, anonymous_display_name, real_avatar_url, diet_summary,
-- nutrition_goal_summary, recent_meal_style, verification_status, visibility, locale, timezone,
-- created_at, updated_at and the surrogate id. Column grants rather than a table grant, so
-- `select *` on consumer_profiles is impossible for this role.
-- ---------------------------------------------------------------------------------------------
grant select (user_id, display_name, mascot_avatar_key, public_bio, willing_to_chat, status, deleted_at)
  on table public.consumer_profiles to social_profile_projection_authority;

-- ---------------------------------------------------------------------------------------------
-- 3. Role-scoped RLS policy.
--
-- consumer_profiles carries the owner-only policy consumer_profiles_owner_read USING
-- (auth.uid() = user_id). This NOLOGIN authority is neither the table owner nor NOBYPASSRLS-exempt,
-- so without a policy scoped to it the projection would evaluate auth.uid() as NULL on the
-- server-only executor connection and return no rows at all.
--
-- Additive permissive SELECT policy scoped TO this role only, exactly as SR-1B-D2-B1 did for the
-- private Taste tables. Permissive policies OR together solely within the roles they apply to, so
-- the existing owner-only policy — and therefore the anon and authenticated view of
-- consumer_profiles — is completely unaffected. Row breadth is still bounded by the canonical
-- candidate pool and the active/non-deleted predicate inside the function, and column breadth is
-- still bounded by the seven-column grant above.
-- ---------------------------------------------------------------------------------------------
create policy consumer_profiles_profile_projection_authority on public.consumer_profiles
  for select to social_profile_projection_authority using (true);

-- ---------------------------------------------------------------------------------------------
-- 4. Defensive candidate authorization. The projection re-checks every supplied candidate against
-- the frozen canonical pool, so a server caller cannot project a candidate the actor was never
-- authorized to see. canonical_candidate_pool is owned by social_authority, and postgres holds that
-- role with inherit false, so the grant must be issued while acting as that exact owner.
-- ---------------------------------------------------------------------------------------------
grant social_authority to postgres with inherit false, set true;
set local role social_authority;
grant execute on function social_internal.canonical_candidate_pool(uuid)
  to social_profile_projection_authority;
set local role postgres;

-- ---------------------------------------------------------------------------------------------
-- 5. The projection primitive.
-- ---------------------------------------------------------------------------------------------
grant social_profile_projection_authority to postgres with inherit false, set true;

create function social_internal.project_exposed_social_profiles(
  p_actor_user_id uuid,
  p_candidate_user_ids uuid[]
)
returns table (
  exposure_ordinal integer,
  display_name text,
  mascot_avatar_key text,
  public_bio text,
  willing_to_chat boolean
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
    raise exception 'SOCIAL_PROFILE_ACTOR_REQUIRED' using errcode = '22023';
  end if;
  if p_candidate_user_ids is null then
    raise exception 'SOCIAL_PROFILE_CANDIDATES_REQUIRED' using errcode = '22023';
  end if;

  v_count := pg_catalog.array_length(p_candidate_user_ids, 1);
  -- An empty exposure is a successful projection of zero candidates, never an error.
  if v_count is null then
    return;
  end if;
  -- The bound is the frozen SR-2B Premium exposure cap. No caller can raise it.
  if v_count > 10 then
    raise exception 'SOCIAL_PROFILE_CANDIDATE_LIMIT_EXCEEDED' using errcode = '22023';
  end if;
  if pg_catalog.array_position(p_candidate_user_ids, null::uuid) is not null then
    raise exception 'SOCIAL_PROFILE_CANDIDATE_NULL' using errcode = '22023';
  end if;
  if (
    select pg_catalog.count(distinct candidate.user_id)
    from pg_catalog.unnest(p_candidate_user_ids) as candidate(user_id)
  ) <> v_count then
    raise exception 'SOCIAL_PROFILE_CANDIDATE_DUPLICATE' using errcode = '22023';
  end if;

  -- Ordinality is carried from the supplied array, so the SR-2B position survives regardless of
  -- physical row order. Zero-based to match the internal array index the projection correlates on.
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
         profile.display_name,
         profile.mascot_avatar_key,
         profile.public_bio,
         profile.willing_to_chat
  from requested
  join authorized on authorized.user_id = requested.user_id
  join public.consumer_profiles as profile on profile.user_id = requested.user_id
  where profile.status = 'active'
    and profile.deleted_at is null
  order by requested.ordinality;
end;
$$;

comment on function social_internal.project_exposed_social_profiles(uuid, uuid[]) is
  'SR-2C public Social profile projection. Accepts the verified actor plus at most ten server-owned SR-2B exposed candidates, re-checks each against the canonical candidate pool, and returns only public-safe profile facts keyed by zero-based exposure ordinal. Returns no user identifier, no profile_id, no avatar URL, no verification, no health summary and no private column. Server-internal; no client role may execute it.';

-- Remove default and unwanted execution while postgres is still the actual grantor and owner.
revoke all on function social_internal.project_exposed_social_profiles(uuid, uuid[]) from public;
revoke all on function social_internal.project_exposed_social_profiles(uuid, uuid[]) from anon;
revoke all on function social_internal.project_exposed_social_profiles(uuid, uuid[]) from authenticated;
revoke all on function social_internal.project_exposed_social_profiles(uuid, uuid[]) from authenticator;
revoke all on function social_internal.project_exposed_social_profiles(uuid, uuid[]) from service_role;
revoke all on function social_internal.project_exposed_social_profiles(uuid, uuid[]) from social_authority;
revoke all on function social_internal.project_exposed_social_profiles(uuid, uuid[]) from social_pair_read_authority;
revoke all on function social_internal.project_exposed_social_profiles(uuid, uuid[]) from social_runtime_executor;

alter function social_internal.project_exposed_social_profiles(uuid, uuid[])
  owner to social_profile_projection_authority;

-- The executor receives one capability only. The grant must be issued as the new function owner.
set local role social_profile_projection_authority;
grant execute on function social_internal.project_exposed_social_profiles(uuid, uuid[])
  to social_runtime_executor;
set local role postgres;

-- The projection authority keeps its frozen schema USAGE but no durable CREATE authority.
revoke create on schema social_internal from social_profile_projection_authority;

revoke social_authority from postgres;
revoke social_profile_projection_authority from postgres;

commit;
