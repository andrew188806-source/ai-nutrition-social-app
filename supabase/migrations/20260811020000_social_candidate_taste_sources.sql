-- SR-1D: canonical candidate provenance to atomic private Taste reads.
-- The function accepts only the verified actor UUID. Candidate identities and both evidence bounds
-- are fixed inside this server-only authority; no caller can name a candidate or widen a window.

begin;

-- canonical_candidate_pool is owned by social_authority. postgres has no inherited authority, so
-- the durable B1 capability must be granted while acting as that exact owner.
grant social_authority to postgres with inherit false, set true;
set local role social_authority;
grant execute on function social_internal.canonical_candidate_pool(uuid)
  to social_pair_read_authority;
set local role postgres;

-- Transient privileges needed only to transfer the new function to the existing NOLOGIN B1 owner.
grant social_pair_read_authority to postgres with inherit false, set true;
grant create on schema social_internal to social_pair_read_authority;

create function social_internal.canonical_candidate_taste_sources(p_actor_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  with canonical_candidates as (
    select candidate.user_id, candidate.ordinality
    from social_internal.canonical_candidate_pool(p_actor_user_id)
      with ordinality as candidate(user_id, ordinality)
  ),
  canonical_candidate_array as (
    select coalesce(
      pg_catalog.array_agg(candidate.user_id order by candidate.ordinality),
      '{}'::uuid[]
    ) as user_ids
    from canonical_candidates candidate
  )
  select social_internal.authorized_pair_sources(
    p_actor_user_id,
    canonical_candidate_array.user_ids,
    20,
    10
  )
  from canonical_candidate_array;
$$;

comment on function social_internal.canonical_candidate_taste_sources(uuid) is
  'SR-1D protected orchestration. Derives the canonical pool internally, then atomically authorizes and reads B1 Taste sources with meal limit 20 and per-favorites-table limit 10. Actor UUID is the sole input; output remains server-private.';

-- Remove default and unwanted execution while postgres is still the actual grantor and owner.
revoke all on function social_internal.canonical_candidate_taste_sources(uuid) from public;
revoke all on function social_internal.canonical_candidate_taste_sources(uuid) from anon;
revoke all on function social_internal.canonical_candidate_taste_sources(uuid) from authenticated;
revoke all on function social_internal.canonical_candidate_taste_sources(uuid) from authenticator;
revoke all on function social_internal.canonical_candidate_taste_sources(uuid) from service_role;
revoke all on function social_internal.canonical_candidate_taste_sources(uuid) from social_authority;
revoke all on function social_internal.canonical_candidate_taste_sources(uuid) from social_runtime_executor;

alter function social_internal.canonical_candidate_taste_sources(uuid)
  owner to social_pair_read_authority;

-- The executor receives one capability only. The grant must be issued as the new function owner.
set local role social_pair_read_authority;
grant execute on function social_internal.canonical_candidate_taste_sources(uuid)
  to social_runtime_executor;
set local role postgres;

-- The B1 owner retains its frozen schema USAGE but no durable CREATE authority.
revoke create on schema social_internal from social_pair_read_authority;

revoke social_authority from postgres;
revoke social_pair_read_authority from postgres;

commit;
