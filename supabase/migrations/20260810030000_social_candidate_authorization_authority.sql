-- Social Runtime SR-1B-D1 local-only migration.
--
-- Creates the INTERNAL Candidate Authorization database authority and nothing else.
--
-- WHAT THIS IS. One question, answered server-side only: may actor A evaluate candidate B right now?
-- It combines three already-frozen authorities — account status (consumer_profiles), Social
-- participation (SR-1B-C) and directional blocks (SR-1B-B) — without duplicating any of them.
--
-- WHY A NON-EXPOSED SCHEMA. SR-1B-D-A proved empirically that a SECURITY DEFINER function in
-- `public` with EXECUTE granted to `authenticated` IS directly callable by a Mobile JWT (HTTP 200),
-- which would turn this predicate into an arbitrary-UUID membership oracle. It also proved that
-- PostgREST refuses any schema outside its exposed list for EVERY role:
--   PGRST106 "Only the following schemas are exposed: public, graphql_public"
-- So unreachability here is STRUCTURAL — a property of schema exposure, not of getting a GRANT
-- right. This migration does not change the exposed-schema configuration.
--
-- WHAT THIS IS NOT. No Edge Function, no LOGIN role, no direct-connection transport, no
-- service-role dependency, no Mobile or public RPC, no Taste Foundation grant, no SR-1A
-- integration, no candidate pool, no ranking, no entitlement, no relationship state, no public
-- Social profile. Transport is SR-1B-D2's responsibility and is deliberately absent.
--
-- ACTOR IDENTITY IS AN INTERNAL TRUSTED PARAMETER HERE. D1 does NOT solve client actor spoofing.
-- SR-1B-D2 must derive the actor from a validated server context and never from a Mobile body.
--
-- Additive and Development-safe: one new schema, one new role, one new set of grants and policies,
-- two new functions. No existing table, policy, grant, view or function is altered or dropped. No
-- backfill, no seed, no Auth user, no credential.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1. Internal, non-exposed schema.
-- ---------------------------------------------------------------------------------------------
create schema social_internal;

comment on schema social_internal is
  'Server-only Social authority. Deliberately absent from the PostgREST exposed-schema list, so nothing in here is reachable through the Data API by any role. Never add this schema to the Data API configuration.';

revoke all on schema social_internal from public;
revoke all on schema social_internal from anon;
revoke all on schema social_internal from authenticated;
revoke all on schema social_internal from authenticator;

-- A new schema has no ALTER DEFAULT PRIVILEGES entry, so PostgreSQL's built-in default would grant
-- EXECUTE on new functions to PUBLIC. Close that for anything created here later, in addition to the
-- explicit per-function revokes below.
alter default privileges in schema social_internal revoke execute on functions from public;

-- ---------------------------------------------------------------------------------------------
-- 2. The authority role.
--
-- NOLOGIN: nothing can connect as it. SECURITY DEFINER does not require LOGIN.
-- NOINHERIT: it never silently acquires privileges from any role it might later be placed in.
-- NOBYPASSRLS: row level security genuinely applies to it — that is the entire point. Its
--   cross-user reach comes from explicit role-scoped policies below, never from bypassing RLS.
-- It owns no source table; postgres retains ownership of all three.
-- ---------------------------------------------------------------------------------------------
create role social_authority with
  nologin
  noinherit
  nobypassrls
  nocreatedb
  nocreaterole
  nosuperuser
  noreplication;

comment on role social_authority is
  'Owns the internal Candidate Authorization functions. NOLOGIN and NOBYPASSRLS: it reads cross-user rows only through the role-scoped SELECT policies granted below, and only the seven columns those predicates need. No transport role may be made a member of it.';

grant usage on schema social_internal to social_authority;

-- Transient. Revoked at the end of this migration: PostgreSQL requires a prospective function owner
-- to hold CREATE on the function's schema at the moment of the ownership transfer.
grant create on schema social_internal to social_authority;

-- ---------------------------------------------------------------------------------------------
-- 3. Column-level read authority — exactly the seven columns the predicate consumes.
--
-- Deliberately excluded: every consumer_profiles display/public field, visibility, willing_to_chat,
-- verification_status; social_participation.opted_in_at and updated_at; social_blocks.created_at;
-- and every Taste Foundation column. Column grants, never table grants, so `select *` is impossible
-- for this role even if a future function tried it.
-- ---------------------------------------------------------------------------------------------
grant select (user_id, status, deleted_at) on table public.consumer_profiles to social_authority;
grant select (user_id, state) on table public.social_participation to social_authority;
grant select (blocker_user_id, blocked_user_id) on table public.social_blocks to social_authority;

-- ---------------------------------------------------------------------------------------------
-- 4. Role-scoped RLS policies.
--
-- These are ADDITIVE permissive policies scoped TO social_authority. Permissive policies OR together
-- only within the roles they apply to, so the existing owner-facing policies — and therefore the
-- anon and authenticated view of all three tables — are completely unaffected. In particular a
-- Mobile client still cannot see an inbound block; only this role can see both directions.
--
-- USING (true) is correct and minimal here rather than lax: authorization must be able to evaluate
-- an arbitrary (actor, candidate) pair, so no narrowing row predicate exists. Containment comes from
-- three other places — the role cannot be logged into, cannot be reached through the Data API, and
-- the only things that read through it return a boolean or a subset of ids.
-- ---------------------------------------------------------------------------------------------
create policy consumer_profiles_social_authority_read on public.consumer_profiles
  for select to social_authority using (true);

create policy social_participation_social_authority_read on public.social_participation
  for select to social_authority using (true);

create policy social_blocks_social_authority_read on public.social_blocks
  for select to social_authority using (true);

-- ---------------------------------------------------------------------------------------------
-- 5. Transient membership so postgres may transfer ownership, revoked below.
-- ---------------------------------------------------------------------------------------------
grant social_authority to postgres with inherit false, set true;

-- ---------------------------------------------------------------------------------------------
-- 6. The canonical authority.
--
-- The SET form is canonical and the pair form delegates to it, so there is exactly ONE
-- implementation of the authorization semantics and no possibility of the two drifting apart.
--
-- Ordering is ascending uuid purely so results are reproducible in tests. It is NOT ranking, NOT
-- relevance and NOT recommendation order; no consumer may read meaning into it.
--
-- consumer_profiles.user_id carries no unique constraint (only id and profile_id do), so account
-- checks are written to fail closed: the user must have an active, non-deleted row AND must have no
-- row that is inactive or soft-deleted. A stray soft-deleted duplicate can therefore never be
-- masked by an active one.
--
-- search_path is pinned to pg_catalog, pg_temp and every reference is schema-qualified, which is
-- tighter than including `public` and removes any object-shadowing surface.
-- ---------------------------------------------------------------------------------------------
create function social_internal.authorized_candidates(
  p_actor_user_id uuid,
  p_candidate_user_ids uuid[]
)
returns setof uuid
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select distinct candidate.user_id
  from pg_catalog.unnest(p_candidate_user_ids) as candidate(user_id)
  where p_actor_user_id is not null
    and candidate.user_id is not null
    -- 1. never authorize self-comparison
    and candidate.user_id <> p_actor_user_id
    -- 2. actor account is active and not soft-deleted
    and exists (
      select 1 from public.consumer_profiles as cp
      where cp.user_id = p_actor_user_id and cp.status = 'active' and cp.deleted_at is null
    )
    and not exists (
      select 1 from public.consumer_profiles as cp
      where cp.user_id = p_actor_user_id and (cp.status <> 'active' or cp.deleted_at is not null)
    )
    -- 3. actor has explicitly opted into Social and is not paused
    and exists (
      select 1 from public.social_participation as sp
      where sp.user_id = p_actor_user_id and sp.state = 'opted_in'
    )
    -- 4. candidate account is active and not soft-deleted
    and exists (
      select 1 from public.consumer_profiles as cp
      where cp.user_id = candidate.user_id and cp.status = 'active' and cp.deleted_at is null
    )
    and not exists (
      select 1 from public.consumer_profiles as cp
      where cp.user_id = candidate.user_id and (cp.status <> 'active' or cp.deleted_at is not null)
    )
    -- 5. candidate has explicitly opted into Social and is not paused
    and exists (
      select 1 from public.social_participation as sp
      where sp.user_id = candidate.user_id and sp.state = 'opted_in'
    )
    -- 6. neither direction of the block relation exists
    and not exists (
      select 1 from public.social_blocks as sb
      where sb.blocker_user_id = p_actor_user_id and sb.blocked_user_id = candidate.user_id
    )
    and not exists (
      select 1 from public.social_blocks as sb
      where sb.blocker_user_id = candidate.user_id and sb.blocked_user_id = p_actor_user_id
    )
  order by 1;
$$;

create function social_internal.may_evaluate_candidate(
  p_actor_user_id uuid,
  p_candidate_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
    from social_internal.authorized_candidates(p_actor_user_id, array[p_candidate_user_id])
  );
$$;

comment on function social_internal.authorized_candidates(uuid, uuid[]) is
  'Canonical Candidate Authorization. Returns the authorized SUBSET of the supplied candidates for the supplied actor. Server-internal only. Returns ids alone — never a per-candidate denial reason, which would reintroduce the oracle it exists to prevent.';
comment on function social_internal.may_evaluate_candidate(uuid, uuid) is
  'Single-pair Candidate Authorization, expressed as the degenerate case of authorized_candidates so the semantics cannot drift. Returns a bare boolean with no denial reason. Server-internal only.';

-- ---------------------------------------------------------------------------------------------
-- 7. Ownership transfer and lockdown.
-- ---------------------------------------------------------------------------------------------
-- ORDER IS LOAD-BEARING. A new function inherits PostgreSQL's built-in default of PUBLIC EXECUTE,
-- and a REVOKE only removes grants made by the role issuing it. Revoking AFTER the ownership
-- transfer would therefore be a silent no-op — postgres would no longer be the grantor, PostgreSQL
-- would emit only a warning, and PUBLIC would keep EXECUTE. Development acceptance caught exactly
-- that. The revokes must run while postgres still owns the functions.
revoke all on function social_internal.authorized_candidates(uuid, uuid[]) from public;
revoke all on function social_internal.may_evaluate_candidate(uuid, uuid) from public;
revoke all on function social_internal.authorized_candidates(uuid, uuid[]) from anon;
revoke all on function social_internal.may_evaluate_candidate(uuid, uuid) from anon;
revoke all on function social_internal.authorized_candidates(uuid, uuid[]) from authenticated;
revoke all on function social_internal.may_evaluate_candidate(uuid, uuid) from authenticated;
revoke all on function social_internal.authorized_candidates(uuid, uuid[]) from authenticator;
revoke all on function social_internal.may_evaluate_candidate(uuid, uuid) from authenticator;

-- With the ACL already materialised as owner-only, the ownership transfer rewrites it to
-- social_authority=X/social_authority and introduces no PUBLIC entry.
alter function social_internal.authorized_candidates(uuid, uuid[]) owner to social_authority;
alter function social_internal.may_evaluate_candidate(uuid, uuid) owner to social_authority;

-- The role keeps USAGE but loses CREATE now that its functions exist.
revoke create on schema social_internal from social_authority;

-- Release the transient membership taken in step 5. This removes the postgres-granted row.
--
-- Recorded honestly: Supabase automatically grants postgres ADMIN OPTION on every newly created
-- role, with supabase_admin as grantor, and postgres cannot revoke a grant it did not make. That
-- row therefore survives and is a platform artifact, not something this migration creates. What
-- this migration does guarantee is that postgres retains NEITHER inherit NOR set on the role, so no
-- postgres session can act as social_authority without an explicit, auditable re-grant.
revoke social_authority from postgres;

commit;
