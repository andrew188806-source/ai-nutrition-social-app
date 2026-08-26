-- GEO-1C-P0: the restaurant coordinate source authority.
--
-- WHAT THIS IS. The lifecycle that puts real coordinates into the columns GEO-1A created, and the
-- rules that keep them honest. GEO-1A answers "how far away is this"; this migration answers "where
-- is this, who said so, and is that still true".
--
-- WHY A LIFECYCLE AT ALL. Before this round the repository had no branch-write path whatsoever: no
-- creation, no address editing, no import, no trigger, and an admin surface backed entirely by a
-- mock adapter. Rather than invent an application lifecycle that does not exist, invalidation is
-- enforced in the DATABASE, so it holds no matter who eventually writes an address -- an admin
-- screen, an importer, or a hand-run statement.
--
-- THE CANONICAL SOURCE ADDRESS SPANS TWO TABLES: restaurants.city + restaurant_branches.district +
-- restaurant_branches.address. A trigger on branches alone would miss a city edit and leave GEO-1A
-- narrowing on coordinates that no longer describe the address. Both sides are invalidated
-- synchronously, so a stale coordinate never survives the statement that staled it.
--
-- FOUR STATES, AND NO stale STATE. unknown -> pending -> resolved | failed. A stale address is not
-- something a coordinate may be: the moment the address changes the coordinates are cleared and the
-- row returns to pending, or to unknown when the address is no longer sufficient. The invariant
-- resolved <=> latitude and longitude present is enforced by CHECK, so there is exactly one
-- coordinate truth and GEO-1A needs no knowledge of any of this.
--
-- NO PROVIDER IS INTEGRATED HERE. The resolver contract is provider-neutral and this round ships a
-- mock only: durable storage rights for a real geocoder's returned coordinates are an unsettled
-- commercial question, and the schema deliberately does not depend on persisting arbitrary provider
-- response content. geocode_provider_ref is the provider-neutral handle, and
-- geocode_normalized_address is TastKind's OWN composed address, never a provider's formatted
-- string.
--
-- Additive and Development-safe: nine columns on one existing table, two trigger functions, one new
-- role, six functions. No existing view, policy, grant or function is altered or dropped, and
-- GEO-1A's bytes are untouched.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1. Lifecycle and provenance columns.
-- ---------------------------------------------------------------------------------------------
alter table public.restaurant_branches
  add column geocode_status text not null default 'unknown',
  add column geocode_provider text,
  add column geocode_provider_ref text,
  add column geocode_normalized_address text,
  add column geocode_address_fingerprint text,
  add column geocode_resolved_at timestamptz,
  add column geocode_attempts integer not null default 0,
  add column geocode_last_error text,
  add column geocode_last_attempt_at timestamptz;

comment on column public.restaurant_branches.geocode_status is
  'GEO-1C-P0 resolution lifecycle: unknown (no sufficient address, or never attempted), pending (a sufficient address awaiting resolution), resolved (coordinates present), failed (a bounded number of attempts produced no coordinate). There is deliberately no stale state: a changed address clears the coordinates instead.';
comment on column public.restaurant_branches.geocode_provider is
  'GEO-1C-P0 provider that produced the current coordinates. Recorded so a resolution can be attributed and re-derived if the provider changes.';
comment on column public.restaurant_branches.geocode_provider_ref is
  'GEO-1C-P0 provider-neutral reference for the matched location. Deliberately NOT named place_id, which is one provider vocabulary: a provider identifier may be stored here only where that provider terms permit the intended durable use.';
comment on column public.restaurant_branches.geocode_normalized_address is
  'GEO-1C-P0 the canonicalised source address TastKind itself composed from city, district and address at the moment of resolution. It is never a provider returned formatted address, so the schema depends on no provider storage terms.';
comment on column public.restaurant_branches.geocode_address_fingerprint is
  'GEO-1C-P0 deterministic fingerprint of the CURRENT canonical source address across restaurants.city, restaurant_branches.district and restaurant_branches.address. Maintained only by trigger, never by the geocoding authority, and used to reject a result computed for an address that has since changed.';
comment on column public.restaurant_branches.geocode_attempts is
  'GEO-1C-P0 attempts made against the CURRENT address. Reset to zero whenever the address changes, so retries are bounded per address rather than per row for all time.';

-- ---------------------------------------------------------------------------------------------
-- 2. Integrity.
--
-- The resolved/coordinate equivalence is the whole reason GEO-1A needs no change: it keeps
-- filtering on `latitude is not null` and can never observe a coordinate this lifecycle considers
-- unresolved.
-- ---------------------------------------------------------------------------------------------
alter table public.restaurant_branches
  add constraint restaurant_branches_geocode_status_valid
    check (geocode_status in ('unknown', 'pending', 'resolved', 'failed'));

alter table public.restaurant_branches
  add constraint restaurant_branches_geocode_resolved_iff_coordinate
    check ((geocode_status = 'resolved') = (latitude is not null));

alter table public.restaurant_branches
  add constraint restaurant_branches_geocode_attempts_valid
    check (geocode_attempts >= 0);

-- A resolution that cannot be attributed to a provider AND to a specific address is not a
-- resolution; it is an unexplained coordinate.
alter table public.restaurant_branches
  add constraint restaurant_branches_geocode_resolution_attributable
    check (
      geocode_status <> 'resolved'
      or (geocode_provider is not null and geocode_resolved_at is not null
          and geocode_address_fingerprint is not null)
    );

-- Nothing unresolved may carry provider provenance: clearing coordinates must clear the story that
-- justified them.
alter table public.restaurant_branches
  add constraint restaurant_branches_geocode_provenance_cleared
    check (
      geocode_status = 'resolved'
      or (geocode_provider is null and geocode_provider_ref is null and geocode_resolved_at is null)
    );

create index restaurant_branches_geocode_pending_idx
  on public.restaurant_branches (geocode_status, geocode_attempts)
  where geocode_status in ('pending', 'failed');

-- ---------------------------------------------------------------------------------------------
-- 3. The canonical source address, composed and fingerprinted.
--
-- Both are IMMUTABLE and pure so the fingerprint is reproducible: the same three inputs always
-- produce the same value. sha256 is a core function, so no extension is required and this migration
-- stays provable under the hardened non-superuser apply gate.
-- ---------------------------------------------------------------------------------------------
create function geo_internal.compose_branch_address(
  p_city text,
  p_district text,
  p_address text
)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  -- The street address is the one component that can locate a building; a city or district alone
  -- cannot. Without it there is nothing to geocode and the branch is unknown, not pending.
  select case
    when p_address is null or pg_catalog.btrim(p_address) = '' then null
    else pg_catalog.btrim(pg_catalog.regexp_replace(
      pg_catalog.concat_ws(' ',
        nullif(pg_catalog.btrim(coalesce(p_city, '')), ''),
        nullif(pg_catalog.btrim(coalesce(p_district, '')), ''),
        pg_catalog.btrim(p_address)
      ), '\s+', ' ', 'g'))
  end
$$;

comment on function geo_internal.compose_branch_address(text, text, text) is
  'GEO-1C-P0 canonical source address. Taiwan-first composition of city, district and street address with deterministic whitespace normalisation. Returns NULL when no street address exists, which is what makes a branch unknown rather than pending.';

create function geo_internal.branch_address_fingerprint(
  p_city text,
  p_district text,
  p_address text
)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select case
    when geo_internal.compose_branch_address(p_city, p_district, p_address) is null then null
    else pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        geo_internal.compose_branch_address(p_city, p_district, p_address), 'UTF8')),
      'hex')
  end
$$;

comment on function geo_internal.branch_address_fingerprint(text, text, text) is
  'GEO-1C-P0 deterministic fingerprint of the canonical source address. A change to city, district or street address all change it, which is what lets a completion be rejected as stale.';

-- ---------------------------------------------------------------------------------------------
-- 4. Invalidation on the branch side.
--
-- SECURITY DEFINER because invalidation must be unconditional: it may not depend on whether the
-- role that edited the address happens to be able to read the parent restaurant, and a future
-- restaurant-admin writer must not be able to sidestep it by lacking a privilege.
-- ---------------------------------------------------------------------------------------------
create function geo_internal.branch_geocode_invalidate()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_city text;
  v_fingerprint text;
begin
  select restaurant.city into v_city
  from public.restaurants as restaurant
  where restaurant.id = new.restaurant_id;

  v_fingerprint := geo_internal.branch_address_fingerprint(v_city, new.district, new.address);

  -- An address that did not actually change leaves the resolution alone: re-saving a branch must
  -- not discard a good coordinate or reset the retry budget.
  if tg_op = 'UPDATE' and v_fingerprint is not distinct from old.geocode_address_fingerprint then
    new.geocode_address_fingerprint := old.geocode_address_fingerprint;
    return new;
  end if;

  new.latitude := null;
  new.longitude := null;
  new.geocode_provider := null;
  new.geocode_provider_ref := null;
  new.geocode_normalized_address := null;
  new.geocode_resolved_at := null;
  new.geocode_last_error := null;
  new.geocode_last_attempt_at := null;
  new.geocode_attempts := 0;
  new.geocode_address_fingerprint := v_fingerprint;
  new.geocode_status := case when v_fingerprint is null then 'unknown' else 'pending' end;
  return new;
end;
$$;

comment on function geo_internal.branch_geocode_invalidate() is
  'GEO-1C-P0 branch-side invalidation. Any INSERT, or any UPDATE that actually changes the canonical source address, clears the coordinates and the provider provenance and returns the row to pending or unknown. An unchanged address is left untouched.';

create trigger restaurant_branches_geocode_invalidate
  before insert or update of address, district, restaurant_id
  on public.restaurant_branches
  for each row execute function geo_internal.branch_geocode_invalidate();

-- ---------------------------------------------------------------------------------------------
-- 5. Invalidation on the restaurant side.
--
-- THE CORRECTION THAT MATTERS. City lives on the parent, so a branch-only trigger would let a city
-- edit leave every child branch holding coordinates for an address that no longer exists. Deferring
-- that to a later resolver pass would leave a window in which GEO-1A narrows on stale coordinates.
-- This fires in the SAME statement, so the window does not exist.
-- ---------------------------------------------------------------------------------------------
create function geo_internal.restaurant_city_geocode_invalidate()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  update public.restaurant_branches as branch
  set
    latitude = null,
    longitude = null,
    geocode_provider = null,
    geocode_provider_ref = null,
    geocode_normalized_address = null,
    geocode_resolved_at = null,
    geocode_last_error = null,
    geocode_last_attempt_at = null,
    geocode_attempts = 0,
    geocode_address_fingerprint =
      geo_internal.branch_address_fingerprint(new.city, branch.district, branch.address),
    geocode_status = case
      when geo_internal.branch_address_fingerprint(new.city, branch.district, branch.address) is null
        then 'unknown' else 'pending' end
  where branch.restaurant_id = new.id
    -- Only branches whose canonical address actually moved. A city edit that leaves a given
    -- branch's fingerprint unchanged must not discard that branch's good coordinate.
    and geo_internal.branch_address_fingerprint(new.city, branch.district, branch.address)
        is distinct from branch.geocode_address_fingerprint;
  return null;
end;
$$;

comment on function geo_internal.restaurant_city_geocode_invalidate() is
  'GEO-1C-P0 parent-side invalidation. A change to restaurants.city synchronously clears the coordinates of every child branch whose canonical source address it changes, so GEO-1A can never narrow on a coordinate the city edit already invalidated.';

create trigger restaurants_city_geocode_invalidate
  after update of city on public.restaurants
  for each row when (old.city is distinct from new.city)
  execute function geo_internal.restaurant_city_geocode_invalidate();

-- ---------------------------------------------------------------------------------------------
-- 6. Initialise the lifecycle for rows that already exist.
--
-- This fabricates NO coordinate. It records only what is already true: a branch with a street
-- address is pending resolution, and a branch without one is unknown.
-- ---------------------------------------------------------------------------------------------
update public.restaurant_branches as branch
set
  geocode_address_fingerprint = geo_internal.branch_address_fingerprint(
    (select restaurant.city from public.restaurants as restaurant where restaurant.id = branch.restaurant_id),
    branch.district, branch.address),
  geocode_status = case
    when geo_internal.branch_address_fingerprint(
      (select restaurant.city from public.restaurants as restaurant where restaurant.id = branch.restaurant_id),
      branch.district, branch.address) is null then 'unknown' else 'pending' end
where branch.latitude is null;

-- ---------------------------------------------------------------------------------------------
-- 7. The write authority.
--
-- A SEPARATE role from geo_authority on purpose: one role reads coordinates to narrow candidates,
-- another writes them. Neither can do the other's job, so a defect in narrowing cannot become a
-- write and a defect in resolution cannot become a read of anything else.
-- ---------------------------------------------------------------------------------------------
create role geo_geocode_authority with
  nologin
  noinherit
  nobypassrls
  nocreatedb
  nocreaterole
  nosuperuser
  noreplication;

comment on role geo_geocode_authority is
  'Owns the GEO-1C-P0 coordinate resolution functions. NOLOGIN and NOBYPASSRLS: it writes only the columns named in its column grant, only through the four authority functions, and only under the role-scoped policies granted here.';

grant usage on schema geo_internal to geo_geocode_authority;
grant create on schema geo_internal to geo_geocode_authority;

-- The authority functions run AS this role and compose the canonical address themselves, so the
-- role needs to execute the two pure helpers. They stay owned by postgres and revoked from every
-- client role: this is the narrowest grant that makes the definer functions work at all.
grant execute on function geo_internal.compose_branch_address(text, text, text)
  to geo_geocode_authority;
grant execute on function geo_internal.branch_address_fingerprint(text, text, text)
  to geo_geocode_authority;

-- Column-scoped, never a table grant. geocode_address_fingerprint is deliberately EXCLUDED from the
-- UPDATE grant: it is trigger-maintained truth about the address, and the resolver must never be
-- able to move the goal posts it is checked against.
grant select (id, restaurant_id, district, address, status, is_active, latitude, longitude,
              geocode_status, geocode_provider, geocode_provider_ref, geocode_normalized_address,
              geocode_address_fingerprint, geocode_resolved_at, geocode_attempts,
              geocode_last_error, geocode_last_attempt_at)
  on table public.restaurant_branches to geo_geocode_authority;
grant update (latitude, longitude, geocode_status, geocode_provider, geocode_provider_ref,
              geocode_normalized_address, geocode_resolved_at, geocode_attempts,
              geocode_last_error, geocode_last_attempt_at)
  on table public.restaurant_branches to geo_geocode_authority;
grant select (id, city) on table public.restaurants to geo_geocode_authority;

-- Row level security is enabled on both tables and every existing policy is SELECT-only, so a grant
-- without a matching policy would silently read and write nothing.
create policy restaurant_branches_geocode_authority_read on public.restaurant_branches
  for select to geo_geocode_authority using (true);
create policy restaurant_branches_geocode_authority_write on public.restaurant_branches
  for update to geo_geocode_authority using (true) with check (true);
create policy restaurants_geocode_authority_read on public.restaurants
  for select to geo_geocode_authority using (true);

grant geo_geocode_authority to postgres with inherit false, set true;

-- ---------------------------------------------------------------------------------------------
-- 8. Claiming work.
--
-- SKIP LOCKED so two dispatchers can never claim the same branch, and the attempt is counted at
-- CLAIM time so a resolver that dies mid-flight consumes its budget instead of looping forever.
-- The caller receives the fingerprint it must present back; that is the whole staleness contract.
-- ---------------------------------------------------------------------------------------------
create function geo_internal.claim_branch_geocodes(
  p_limit integer,
  p_max_attempts integer
)
returns table (
  branch_id text,
  source_address text,
  address_fingerprint text
)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if p_limit is null or p_limit <= 0 or p_max_attempts is null or p_max_attempts <= 0 then
    return;
  end if;

  return query
  with claimable as (
    select branch.id as id
    from public.restaurant_branches as branch
    where branch.geocode_status in ('pending', 'failed')
      and branch.geocode_address_fingerprint is not null
      and branch.geocode_attempts < p_max_attempts
    order by branch.geocode_attempts asc, branch.id asc
    limit least(p_limit, 100)
    for update skip locked
  )
  update public.restaurant_branches as branch
  set geocode_attempts = branch.geocode_attempts + 1,
      geocode_last_attempt_at = pg_catalog.clock_timestamp(),
      geocode_status = 'pending'
  from claimable
  where branch.id = claimable.id
  returning branch.id,
    geo_internal.compose_branch_address(
      (select restaurant.city from public.restaurants as restaurant where restaurant.id = branch.restaurant_id),
      branch.district, branch.address),
    branch.geocode_address_fingerprint;
end;
$$;

comment on function geo_internal.claim_branch_geocodes(integer, integer) is
  'GEO-1C-P0 dispatcher claim. Returns at most p_limit branches whose address is sufficient and whose attempts remain under the configured bound, counting the attempt at claim time and locking with SKIP LOCKED so concurrent dispatchers cannot collide. It returns the composed address and the fingerprint the caller must present back, and never a coordinate.';

-- ---------------------------------------------------------------------------------------------
-- 9. Completing work.
--
-- THE RACE THIS EXISTS TO LOSE. A resolver reads an address, spends time in a provider call, and
-- returns with a coordinate. If the address changed meanwhile, the answer describes a place the
-- branch no longer is. The presented fingerprint must therefore still equal the row current
-- fingerprint, and a mismatch writes NOTHING.
-- ---------------------------------------------------------------------------------------------
create function geo_internal.complete_branch_geocode(
  p_branch_id text,
  p_address_fingerprint text,
  p_latitude numeric,
  p_longitude numeric,
  p_provider text,
  p_provider_ref text
)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_current text;
  v_composed text;
begin
  if p_branch_id is null or p_address_fingerprint is null or p_provider is null then
    return 'rejected_invalid';
  end if;
  -- A coordinate outside the world is not a coordinate. GEO-1A's CHECK would refuse it at rest;
  -- refusing it here keeps the failure attributable instead of aborting the dispatcher.
  if p_latitude is null or p_longitude is null
    or p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180 then
    return 'rejected_invalid';
  end if;

  select branch.geocode_address_fingerprint,
    geo_internal.compose_branch_address(
      (select restaurant.city from public.restaurants as restaurant where restaurant.id = branch.restaurant_id),
      branch.district, branch.address)
  into v_current, v_composed
  from public.restaurant_branches as branch
  where branch.id = p_branch_id
  for update;

  if not found then return 'not_found'; end if;
  if v_current is distinct from p_address_fingerprint then return 'rejected_stale'; end if;

  update public.restaurant_branches as branch
  set latitude = p_latitude,
      longitude = p_longitude,
      geocode_status = 'resolved',
      geocode_provider = p_provider,
      geocode_provider_ref = p_provider_ref,
      geocode_normalized_address = v_composed,
      geocode_last_error = null,
      geocode_resolved_at = pg_catalog.clock_timestamp()
  where branch.id = p_branch_id;
  return 'resolved';
end;
$$;

comment on function geo_internal.complete_branch_geocode(text, text, numeric, numeric, text, text) is
  'GEO-1C-P0 resolution. Writes coordinates only when the presented fingerprint still matches the branch current canonical address, so a result computed for an address that has since changed is rejected as stale and no coordinate is written. The stored normalized address is the composition TastKind made, never a provider formatted string.';

-- ---------------------------------------------------------------------------------------------
-- 10. Failing work, and explicit retry.
-- ---------------------------------------------------------------------------------------------
create function geo_internal.fail_branch_geocode(
  p_branch_id text,
  p_address_fingerprint text,
  p_error text
)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_current text;
begin
  if p_branch_id is null or p_address_fingerprint is null then return 'rejected_invalid'; end if;

  select branch.geocode_address_fingerprint into v_current
  from public.restaurant_branches as branch where branch.id = p_branch_id for update;

  if not found then return 'not_found'; end if;
  if v_current is distinct from p_address_fingerprint then return 'rejected_stale'; end if;

  -- A failure can never produce a coordinate, and the resolved/coordinate equivalence means an
  -- unresolved row never had one to clear.
  update public.restaurant_branches as branch
  set geocode_status = 'failed',
      geocode_last_error = pg_catalog.left(coalesce(p_error, 'provider_unavailable'), 500)
  where branch.id = p_branch_id;
  return 'failed';
end;
$$;

comment on function geo_internal.fail_branch_geocode(text, text, text) is
  'GEO-1C-P0 failure record. Marks the branch failed and keeps the reason, and cannot create a coordinate. Fingerprint-checked exactly like completion, so a failure attributed to an old address is rejected too.';

create function geo_internal.reset_branch_geocode(p_branch_id text)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, pg_temp
as $$
declare
  v_fingerprint text;
begin
  if p_branch_id is null then return 'rejected_invalid'; end if;

  select branch.geocode_address_fingerprint into v_fingerprint
  from public.restaurant_branches as branch where branch.id = p_branch_id for update;
  if not found then return 'not_found'; end if;

  -- An explicit retry restores the attempt budget for the CURRENT address. It never touches a
  -- resolved row: re-resolving something already correct is not a retry.
  update public.restaurant_branches as branch
  set geocode_status = case when v_fingerprint is null then 'unknown' else 'pending' end,
      geocode_attempts = 0,
      geocode_last_error = null
  where branch.id = p_branch_id and branch.geocode_status = 'failed';

  return case when v_fingerprint is null then 'unknown' else 'pending' end;
end;
$$;

comment on function geo_internal.reset_branch_geocode(text) is
  'GEO-1C-P0 explicit retry. Returns a failed branch to pending and restores its attempt budget for the current address. A resolved branch is deliberately untouched.';

-- ---------------------------------------------------------------------------------------------
-- 11. Sealing.
--
-- ORDER IS LOAD-BEARING, exactly as in the frozen SR-2B and GEO-1A authorities: a new function
-- inherits PostgreSQL's default of PUBLIC EXECUTE, and a REVOKE only removes grants made by the
-- role issuing it, so every revoke must run while postgres still owns the function.
-- ---------------------------------------------------------------------------------------------
revoke all on function geo_internal.compose_branch_address(text, text, text)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function geo_internal.branch_address_fingerprint(text, text, text)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function geo_internal.claim_branch_geocodes(integer, integer)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function geo_internal.complete_branch_geocode(text, text, numeric, numeric, text, text)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function geo_internal.fail_branch_geocode(text, text, text)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function geo_internal.reset_branch_geocode(text)
  from public, anon, authenticated, authenticator, service_role;

alter function geo_internal.claim_branch_geocodes(integer, integer) owner to geo_geocode_authority;
alter function geo_internal.complete_branch_geocode(text, text, numeric, numeric, text, text)
  owner to geo_geocode_authority;
alter function geo_internal.fail_branch_geocode(text, text, text) owner to geo_geocode_authority;
alter function geo_internal.reset_branch_geocode(text) owner to geo_geocode_authority;

-- ---------------------------------------------------------------------------------------------
-- 12. The one transport that may drive resolution.
--
-- TWO DIFFERENT GRANTORS, DELIBERATELY, exactly as GEO-1A learned: schema USAGE is granted by
-- postgres, which OWNS geo_internal, because issuing it while acting as the authority would be
-- silently DROPPED rather than refused. EXECUTE is the opposite case and must come from the
-- authority, which owns the functions, since postgres holds that role WITH INHERIT FALSE.
-- ---------------------------------------------------------------------------------------------
set local role geo_geocode_authority;
grant execute on function geo_internal.claim_branch_geocodes(integer, integer) to social_runtime_executor;
grant execute on function geo_internal.complete_branch_geocode(text, text, numeric, numeric, text, text)
  to social_runtime_executor;
grant execute on function geo_internal.fail_branch_geocode(text, text, text) to social_runtime_executor;
grant execute on function geo_internal.reset_branch_geocode(text) to social_runtime_executor;
set local role postgres;

revoke create on schema geo_internal from geo_geocode_authority;
revoke geo_geocode_authority from postgres granted by postgres;

commit;
