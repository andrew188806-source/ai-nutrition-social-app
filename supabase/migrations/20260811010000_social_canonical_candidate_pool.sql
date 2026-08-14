-- SR-1C: canonical server-only candidate provenance.
-- Adds one bounded internal pool function and the minimum invocation privilege. Candidate identity
-- never crosses the network boundary; ordering is deterministic transport order, never ranking.

begin;

-- The D1 owner needs one additional column solely for the frozen transport order.
grant select (opted_in_at) on table public.social_participation to social_authority;

-- Required only while postgres creates and transfers the successor function to the NOLOGIN owner.
grant social_authority to postgres with inherit false, set true;

-- Transient: PostgreSQL requires the prospective function owner to hold CREATE on the schema at
-- ownership-transfer time. Revoked immediately after ownership moves to social_authority.
grant create on schema social_internal to social_authority;

create function social_internal.canonical_candidate_pool(p_actor_user_id uuid)
returns setof uuid
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select participation.user_id
  from public.social_participation as participation
  where participation.state = 'opted_in'
    and participation.user_id <> p_actor_user_id
    and social_internal.may_evaluate_candidate(p_actor_user_id, participation.user_id)
  order by participation.opted_in_at asc, participation.user_id asc
  limit 256
$$;

comment on function social_internal.canonical_candidate_pool(uuid) is
  'SR-1C canonical raw candidate provenance. Reuses D1 eligibility; returns at most 256 ids in opted_in_at ASC, user_id ASC transport order. Not ranking and not client-executable.';

-- Revoke PostgreSQL's default PUBLIC EXECUTE while postgres remains the grantor/owner.
revoke all on function social_internal.canonical_candidate_pool(uuid) from public;
revoke all on function social_internal.canonical_candidate_pool(uuid) from anon;
revoke all on function social_internal.canonical_candidate_pool(uuid) from authenticated;
revoke all on function social_internal.canonical_candidate_pool(uuid) from authenticator;
revoke all on function social_internal.canonical_candidate_pool(uuid) from service_role;
revoke all on function social_internal.canonical_candidate_pool(uuid) from social_runtime_executor;

alter function social_internal.canonical_candidate_pool(uuid) owner to social_authority;

-- The authority keeps its existing USAGE but does not retain schema CREATE.
revoke create on schema social_internal from social_authority;

-- The LOGIN executor receives only traversal plus this one SECURITY DEFINER invocation boundary.
-- Schema USAGE is issued by postgres, which owns social_internal.
grant usage on schema social_internal to social_runtime_executor;

-- EXECUTE must be issued by the function's owner. Ownership has already moved to social_authority
-- and postgres holds that role with inherit false, so it carries none of the role's object
-- privileges and PostgreSQL finds no possible grantor -- observed as "permission denied for
-- function canonical_candidate_pool". Switching to the owner is the only way to issue this grant.
set local role social_authority;
grant execute on function social_internal.canonical_candidate_pool(uuid) to social_runtime_executor;
-- Deliberately NOT `reset role`. RESET ROLE returns to the SESSION user, and the Supabase CLI runs
-- migrations as `cli_login_postgres` (NOINHERIT, member of postgres with SET only) after switching
-- with SET ROLE. RESET would therefore drop every privilege for the remainder of the migration.
set local role postgres;

revoke social_authority from postgres;

commit;
