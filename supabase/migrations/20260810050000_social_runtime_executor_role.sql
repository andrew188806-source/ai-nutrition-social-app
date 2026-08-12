-- Social Runtime SR-1B-D2-B2 local-only migration.
--
-- Creates the transport executor identity and nothing else. The role can become a database LOGIN
-- once D2-B3 supplies an external, uncommitted credential, but PASSWORD NULL makes it unusable for
-- password authentication in this round.
--
-- ZERO STANDING SOCIAL AUTHORITY. This role is deliberately not a member of social_authority,
-- social_pair_read_authority, or any other authority role. It receives no schema, table, sequence,
-- function, policy, ownership, or default-privilege grant. D2-B3 must introduce any narrowly scoped,
-- auditable SET ROLE transport prerequisite in its own migration and acceptance round.
--
-- WHAT THIS IS NOT. No credential, database URL, Supavisor transport, Edge Function, Deno adapter,
-- service_role dependency, client API, product consumption, ranking, candidate pool, or entitlement.
-- No existing ACL, policy, function, table, schema, role membership, or PostgREST exposure changes.

begin;

create role social_runtime_executor with
  login
  password null
  noinherit
  nobypassrls
  nocreatedb
  nocreaterole
  nosuperuser
  noreplication;

comment on role social_runtime_executor is
  'Passwordless LOGIN boundary for the future Social server transport. It has zero standing Social authority, no role memberships, and no direct schema, table, or function grants. D2-B3 owns credential and transport activation.';

commit;
