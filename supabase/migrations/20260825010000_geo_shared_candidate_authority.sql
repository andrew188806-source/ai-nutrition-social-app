-- GEO-1A: the shared Geo candidate authority.
--
-- WHAT THIS IS. One canonical, server-only answer to four geographic questions — how far apart are
-- two points, is a candidate inside an accepted range, which candidates survive that range, and is a
-- candidate's location even known. Nothing here ranks anything. It carries no nutrition signal, no
-- taste signal and no social compatibility signal, and it must never acquire one: Geo narrows a
-- candidate set, and the owning domain then ranks what survives.
--
-- WHY THE DATABASE IS THE CANONICAL AUTHORITY. The two future consumers do not share a runtime.
-- AI next-meal recommendation is served by a SQL view read directly by Mobile, while Social
-- candidates are served by Edge functions over the frozen SR-1B-D2 executor transport. The database
-- is the only layer both already stand on, so putting the distance formula here is what makes
-- "one formula, two consumers" true rather than aspirational. A TypeScript copy for Edge and a
-- second SQL copy for the view would be two formulas that silently disagree at the boundary.
--
-- WHY NO POSTGIS AND NO EARTHDISTANCE. Both were measured, not assumed. PostGIS 3.3.7 is available
-- on Development but is not installed, and it is absent from the pinned PostgreSQL 17.6 apply gate
-- entirely. `earthdistance` is present in both but is NOT a trusted extension, so the non-superuser
-- migration runner this project deploys as cannot create it; `cube` alone is trusted. A migration
-- depending on either could therefore never be proven under the hardened apply gate, and a
-- superuser-only pass is exactly the failure mode GEO-1A inherits a rule against. The formula below
-- is extension-free and behaves identically on both. It is sealed behind these functions precisely
-- so a later phase can swap the implementation to PostGIS geography without changing one caller.
--
-- COORDINATE DATA IS NOT INVENTED. Existing branches keep a NULL coordinate, which means UNKNOWN and
-- is a first-class outcome throughout: an unknown location never becomes (0,0), never becomes a zero
-- distance and never silently qualifies as nearby. Populating real coordinates is a later phase with
-- a real geocoding source behind it.
--
-- PRIVACY. The querying point is a REQUEST PARAMETER. GEO-1A stores no user location, keeps no
-- location history and creates no tracking of any kind, so there is no actor-scoped location state
-- to leak, expire or reconcile. Restaurant coordinates are business data and stay out of the
-- consumer catalog projection; person-to-person proximity is deliberately not implemented here.
--
-- Additive and Development-safe: two nullable columns on one existing table, one new schema, one new
-- role, one policy, three functions. No existing view, function, policy or grant is altered or
-- dropped, and no row is written.

begin;

-- ---------------------------------------------------------------------------------------------
-- 1. The canonical location columns.
--
-- numeric(9,6) matches this repository's own historical schema drafts and is ~11 cm of resolution,
-- far finer than any product question Geo answers. Nullable because UNKNOWN must be representable.
-- ---------------------------------------------------------------------------------------------
alter table public.restaurant_branches
  add column latitude numeric(9,6),
  add column longitude numeric(9,6);

comment on column public.restaurant_branches.latitude is
  'GEO-1A canonical branch latitude in WGS84 decimal degrees. NULL means UNKNOWN, never zero and never "nearby". Deliberately excluded from every consumer projection view.';
comment on column public.restaurant_branches.longitude is
  'GEO-1A canonical branch longitude in WGS84 decimal degrees. NULL means UNKNOWN, never zero and never "nearby". Deliberately excluded from every consumer projection view.';

-- Range validity is enforced at rest, so a malformed coordinate cannot enter the table and later be
-- rediscovered as a plausible-looking distance.
alter table public.restaurant_branches
  add constraint restaurant_branches_latitude_valid
    check (latitude is null or (latitude >= -90 and latitude <= 90));
alter table public.restaurant_branches
  add constraint restaurant_branches_longitude_valid
    check (longitude is null or (longitude >= -180 and longitude <= 180));

-- A half-known point is malformed, not partially useful: one axis alone can never answer a Geo
-- question, and allowing it would create a second, ambiguous "unknown" state.
alter table public.restaurant_branches
  add constraint restaurant_branches_coordinate_complete
    check ((latitude is null) = (longitude is null));

-- ---------------------------------------------------------------------------------------------
-- 2. Server-only schema.
-- ---------------------------------------------------------------------------------------------
create schema geo_internal;

comment on schema geo_internal is
  'Server-only shared Geo authority. Deliberately absent from the PostgREST exposed-schema list, so nothing in here is reachable through the Data API by any role. Never add this schema to the Data API configuration.';

revoke all on schema geo_internal from public;
revoke all on schema geo_internal from anon;
revoke all on schema geo_internal from authenticated;
revoke all on schema geo_internal from authenticator;

-- A new schema has no ALTER DEFAULT PRIVILEGES entry, so PostgreSQL's built-in default would grant
-- EXECUTE on new functions to PUBLIC. Close that in addition to the explicit revokes below.
alter default privileges in schema geo_internal revoke execute on functions from public;

-- ---------------------------------------------------------------------------------------------
-- 3. The authority role.
--
-- Mirrors the frozen social_authority posture: NOLOGIN so nothing connects as it, NOINHERIT so it
-- never silently acquires privileges, NOBYPASSRLS so row level security genuinely applies and its
-- reach comes only from the explicit role-scoped policy below.
-- ---------------------------------------------------------------------------------------------
create role geo_authority with
  nologin
  noinherit
  nobypassrls
  nocreatedb
  nocreaterole
  nosuperuser
  noreplication;

comment on role geo_authority is
  'Owns the shared Geo authority functions. NOLOGIN and NOBYPASSRLS: it reads branch coordinates only through the role-scoped SELECT policy granted below, and only the columns narrowing actually consumes. No transport role may be made a member of it.';

grant usage on schema geo_internal to geo_authority;

-- Transient. Revoked at the end of this migration: PostgreSQL requires a prospective function owner
-- to hold CREATE on the function's schema at the moment of the ownership transfer.
grant create on schema geo_internal to geo_authority;

-- ---------------------------------------------------------------------------------------------
-- 4. Column-level read authority — exactly what narrowing consumes.
--
-- restaurant_branches has row level security enabled with tenant-scoped policies, so a grant alone
-- would silently return zero rows. The additive role-scoped policy below is what actually makes the
-- coordinate readable, and it applies to this role only: the tenant-facing view of the table, and
-- therefore every anon and authenticated caller, is completely unaffected.
-- ---------------------------------------------------------------------------------------------
grant select (id, restaurant_id, latitude, longitude, status, is_active)
  on table public.restaurant_branches to geo_authority;

create policy restaurant_branches_geo_authority_read on public.restaurant_branches
  for select to geo_authority using (true);

-- ---------------------------------------------------------------------------------------------
-- 5. Transient membership so postgres may transfer ownership, revoked below.
-- ---------------------------------------------------------------------------------------------
grant geo_authority to postgres with inherit false, set true;

-- ---------------------------------------------------------------------------------------------
-- 6. The canonical distance authority.
--
-- Haversine on the IUGG mean Earth radius (6 371 008.8 m). Great-circle distance is the correct
-- answer to "how far away is this", is symmetric, is stable across the antimeridian because it
-- consumes the cosine of the longitude difference rather than the difference itself, and degrades
-- gracefully at high latitude where a naive equirectangular approximation does not.
--
-- IMMUTABLE and STRICT-by-construction: any NULL input yields NULL, and NULL means UNKNOWN all the
-- way out. An out-of-range coordinate also yields NULL rather than a number, so a malformed input
-- can never be mistaken for a near one. The clamp on the asin argument absorbs floating-point
-- overshoot past 1.0 for antipodal points, which would otherwise raise instead of returning a
-- distance.
-- ---------------------------------------------------------------------------------------------
create function geo_internal.distance_meters(
  p_from_latitude numeric,
  p_from_longitude numeric,
  p_to_latitude numeric,
  p_to_longitude numeric
)
returns double precision
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select case
    when p_from_latitude is null or p_from_longitude is null
      or p_to_latitude is null or p_to_longitude is null then null
    when p_from_latitude < -90 or p_from_latitude > 90
      or p_to_latitude < -90 or p_to_latitude > 90
      or p_from_longitude < -180 or p_from_longitude > 180
      or p_to_longitude < -180 or p_to_longitude > 180 then null
    -- `least` is an SQL construct, not a schema-qualifiable function, so it is deliberately bare
    -- here while every genuine function call around it stays qualified against search_path capture.
    else 2 * 6371008.8 * pg_catalog.asin(
      least(1.0::double precision, pg_catalog.sqrt(
        pg_catalog.power(pg_catalog.sin(pg_catalog.radians(
          (p_to_latitude - p_from_latitude)::double precision) / 2), 2)
        + pg_catalog.cos(pg_catalog.radians(p_from_latitude::double precision))
        * pg_catalog.cos(pg_catalog.radians(p_to_latitude::double precision))
        * pg_catalog.power(pg_catalog.sin(pg_catalog.radians(
          (p_to_longitude - p_from_longitude)::double precision) / 2), 2)
      ))
    )
  end
$$;

comment on function geo_internal.distance_meters(numeric, numeric, numeric, numeric) is
  'GEO-1A canonical great-circle distance in METRES. The single distance formula in this repository: no caller may reimplement it. NULL in or out-of-range in yields NULL, which means UNKNOWN and never zero.';

-- ---------------------------------------------------------------------------------------------
-- 7. Radius eligibility.
--
-- INCLUSIVE at the boundary: a candidate exactly `p_radius_meters` away is inside the accepted
-- range. The radius is a CALLER input, not a product constant — GEO-1A deliberately hard-codes no
-- "3 km" or "5 km" anywhere, because no such product radius exists yet and inventing one in the
-- shared layer would silently become the default everywhere. Only the physically meaningful bounds
-- are enforced: a non-positive radius accepts nothing, and nothing beyond half the Earth's
-- circumference can narrow anything, so both fail closed to false rather than to "everything".
-- An UNKNOWN distance is never eligible.
-- ---------------------------------------------------------------------------------------------
create function geo_internal.within_radius(
  p_from_latitude numeric,
  p_from_longitude numeric,
  p_to_latitude numeric,
  p_to_longitude numeric,
  p_radius_meters double precision
)
returns boolean
language sql
immutable
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select case
    when p_radius_meters is null then false
    when p_radius_meters <> p_radius_meters then false
    when p_radius_meters <= 0 then false
    when p_radius_meters > 20037508.0 then false
    else coalesce(
      geo_internal.distance_meters(
        p_from_latitude, p_from_longitude, p_to_latitude, p_to_longitude
      ) <= p_radius_meters,
      false
    )
  end
$$;

comment on function geo_internal.within_radius(numeric, numeric, numeric, numeric, double precision) is
  'GEO-1A radius eligibility, INCLUSIVE of the boundary. The radius is a caller input with physical bounds only; GEO-1A defines no product radius. NULL/NaN/non-positive/greater-than-half-circumference radii and UNKNOWN distances all fail closed to false.';

-- ---------------------------------------------------------------------------------------------
-- 8. The candidate narrowing primitive.
--
-- Returns the branches that SURVIVE geographic filtering and how far away each one is, and stops
-- there. It emits no score, no rank and no ordering claim beyond the one it can honestly make:
-- nearest first, ties broken by branch id so the result is deterministic and stable across calls.
-- Downstream nutrition, taste and social ranking consume this and reorder it freely.
--
-- Branches with an UNKNOWN coordinate are EXCLUDED rather than sorted last. "Might be near" is not
-- an answer this function is allowed to imply; a caller that wants unknown-location candidates must
-- ask for them separately and decide their meaning itself.
-- ---------------------------------------------------------------------------------------------
create function geo_internal.narrow_branch_candidates(
  p_latitude numeric,
  p_longitude numeric,
  p_radius_meters double precision,
  p_limit integer
)
returns table (
  branch_id text,
  restaurant_id text,
  distance_meters double precision
)
language sql
stable
parallel safe
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select branch.id, branch.restaurant_id,
         geo_internal.distance_meters(p_latitude, p_longitude, branch.latitude, branch.longitude)
  from public.restaurant_branches as branch
  where p_latitude is not null
    and p_longitude is not null
    and p_latitude >= -90 and p_latitude <= 90
    and p_longitude >= -180 and p_longitude <= 180
    and p_limit is not null
    and p_limit > 0
    and branch.latitude is not null
    and branch.longitude is not null
    and branch.status = 'active'
    and branch.is_active = true
    and geo_internal.within_radius(
      p_latitude, p_longitude, branch.latitude, branch.longitude, p_radius_meters
    )
  order by geo_internal.distance_meters(
    p_latitude, p_longitude, branch.latitude, branch.longitude
  ) asc, branch.id asc
  limit least(p_limit, 200)
$$;

comment on function geo_internal.narrow_branch_candidates(numeric, numeric, double precision, integer) is
  'GEO-1A candidate narrowing. Returns active branches with a KNOWN coordinate inside the caller radius, nearest first with branch id as a deterministic tie-break, capped at 200. Unknown-coordinate branches are excluded, never implied to be nearby. It ranks nothing: no nutrition, taste or social signal reaches this function.';

-- ---------------------------------------------------------------------------------------------
-- 9. Sealing.
--
-- ORDER IS LOAD-BEARING, exactly as in the frozen SR-2B authority: a new function inherits
-- PostgreSQL's default of PUBLIC EXECUTE, and a REVOKE only removes grants made by the role issuing
-- it. Every revoke must therefore run while postgres still owns the function.
-- ---------------------------------------------------------------------------------------------
revoke all on function geo_internal.distance_meters(numeric, numeric, numeric, numeric)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function geo_internal.within_radius(numeric, numeric, numeric, numeric, double precision)
  from public, anon, authenticated, authenticator, service_role;
revoke all on function geo_internal.narrow_branch_candidates(numeric, numeric, double precision, integer)
  from public, anon, authenticated, authenticator, service_role;

alter function geo_internal.distance_meters(numeric, numeric, numeric, numeric)
  owner to geo_authority;
alter function geo_internal.within_radius(numeric, numeric, numeric, numeric, double precision)
  owner to geo_authority;
alter function geo_internal.narrow_branch_candidates(numeric, numeric, double precision, integer)
  owner to geo_authority;

-- ---------------------------------------------------------------------------------------------
-- 10. The one transport that may call this.
--
-- TWO DIFFERENT GRANTORS, DELIBERATELY. Schema USAGE is granted by postgres, which OWNS the schema;
-- issuing it while acting as geo_authority would be silently DROPPED rather than refused, because
-- that role holds USAGE without grant option. EXECUTE is the opposite case and must be issued by
-- geo_authority, which owns the functions, since postgres holds that role WITH INHERIT FALSE.
--
-- The frozen SR-1B-D2 executor is reused rather than minting a second transport role: it is already
-- the single server-side path Social Edge code reaches the database through, and a future AI
-- recommendation consumer reaches this same authority the same way.
-- ---------------------------------------------------------------------------------------------
grant usage on schema geo_internal to social_runtime_executor;

set local role geo_authority;
grant execute on function geo_internal.distance_meters(numeric, numeric, numeric, numeric)
  to social_runtime_executor;
grant execute on function geo_internal.within_radius(numeric, numeric, numeric, numeric, double precision)
  to social_runtime_executor;
grant execute on function geo_internal.narrow_branch_candidates(numeric, numeric, double precision, integer)
  to social_runtime_executor;
set local role postgres;

revoke create on schema geo_internal from geo_authority;
revoke geo_authority from postgres granted by postgres;

commit;
