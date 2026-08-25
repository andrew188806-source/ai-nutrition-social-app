#!/usr/bin/env node
// GEO-1A mutation suite.
//
// Every mutation below is a defect a reviewer could plausibly ship: a kilometre/metre slip, a
// degrees/radians slip, an off-by-one at the radius boundary, an UNKNOWN silently becoming zero, a
// swapped latitude/longitude pair, a second distance formula in TypeScript, or a scope creep that
// turns the shared foundation into a Mobile GPS phase. Each is applied to the source text IN MEMORY
// and must be KILLED by the shared invariants. The repository is never written to.
import fs from "node:fs";
import path from "node:path";
import {
  GEO1A_PATHS,
  auditGeo1aAuthoredSources
} from "./geo-shared-authority-geo-1a-successor-manifest.mjs";

const SUITE = "geo-shared-authority-geo-1a-mutations";
const root = process.cwd();
const MIGRATION = GEO1A_PATHS.find((file) => file.startsWith("supabase/migrations/"));
const REPOSITORY = "supabase/functions/_shared/geo-api/repository.ts";
const TYPES = "supabase/functions/_shared/geo-api/types.ts";

const pristine = Object.fromEntries(
  GEO1A_PATHS.filter((file) => file !== "package.json")
    .map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")])
);

const checks = []; const failures = [];
const check = (name, ok, detail) => {
  const result = { name, pass: Boolean(ok), ...(ok ? {} : { detail }) };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 300)}`);
};

check("pristine GEO-1A source satisfies every Geo invariant",
  auditGeo1aAuthoredSources(pristine).length === 0, auditGeo1aAuthoredSources(pristine));

// [label, file, mutate]. A mutation that does not change the text is itself a defect: it would
// report a kill it never earned.
const MUTATIONS = [
  // --- the distance formula ---------------------------------------------------------------------
  ["the earth radius is expressed in kilometres instead of metres", MIGRATION,
    (s) => s.replace("6371008.8", "6371.0088")],
  ["the earth radius constant is removed entirely", MIGRATION,
    (s) => s.replace("6371008.8", "6400000.0")],
  ["degrees are fed to the trigonometry without conversion", MIGRATION,
    (s) => s.replaceAll("pg_catalog.radians", "pg_catalog.abs")],
  ["the distance function stops being immutable", MIGRATION,
    (s) => s.replace(/(create function geo_internal\.distance_meters\([\s\S]*?)\bimmutable\b/, "$1volatile")],
  ["the arcsine is dropped for a linear approximation", MIGRATION,
    (s) => s.replace("pg_catalog.asin", "pg_catalog.abs")],

  // --- UNKNOWN must never become a number --------------------------------------------------------
  ["a null coordinate stops yielding UNKNOWN", MIGRATION,
    (s) => s.replace("p_from_latitude is null or p_from_longitude is null", "false")],
  ["an out-of-range coordinate stops yielding UNKNOWN", MIGRATION,
    (s) => s.replace("p_from_latitude < -90 or p_from_latitude > 90", "false")],
  ["narrowing stops excluding unknown-coordinate branches", MIGRATION,
    (s) => s.replace("branch.latitude is not null", "true")],
  ["a half-known coordinate becomes storable", MIGRATION,
    (s) => s.replace("(latitude is null) = (longitude is null)", "true")],
  ["an unknown location collapses into outside_radius", REPOSITORY,
    (s) => s.replace('return "unknown_location";', 'return "outside_radius";')],
  ["a null distance is coerced through Number() into zero", REPOSITORY,
    (s) => s.replace("if (value === null || value === undefined) return null;", "")],

  // --- radius semantics ---------------------------------------------------------------------------
  ["the radius boundary becomes exclusive", MIGRATION,
    (s) => s.replace("<= p_radius_meters", "< p_radius_meters")],
  ["a zero radius stops failing closed", MIGRATION,
    (s) => s.replace("p_radius_meters <= 0 then false", "p_radius_meters < 0 then false")],
  ["a NaN radius stops failing closed", MIGRATION,
    (s) => s.replace("p_radius_meters <> p_radius_meters then false", "false then false")],
  ["an absurd radius stops failing closed", MIGRATION,
    (s) => s.replace("p_radius_meters > 20037508.0", "false")],
  ["a product radius is hard-coded into the shared layer", TYPES,
    (s) => `${s}\nexport const DEFAULT_RADIUS = 3000;\n`],

  // --- swapped axes ---------------------------------------------------------------------------------
  ["the origin is passed longitude-first", REPOSITORY,
    (s) => s.replace("query.origin.latitude, query.origin.longitude", "query.origin.longitude, query.origin.latitude")],
  ["the candidate pair is passed longitude-first", REPOSITORY,
    (s) => s.replace("origin.latitude, origin.longitude, candidate.latitude, candidate.longitude",
      "origin.longitude, origin.latitude, candidate.longitude, candidate.latitude")],

  // --- narrowing is narrowing --------------------------------------------------------------------
  ["the deterministic tie-break is dropped from narrowing", MIGRATION,
    (s) => s.replace(/order by geo_internal\.distance_meters\([\s\S]*?\) asc, branch\.id asc/,
      "order by branch.restaurant_id")],
  ["narrowing stops capping its own result set", MIGRATION,
    (s) => s.replace("limit least(p_limit, 200)", "limit p_limit")],
  ["a taste signal reaches the Geo authority", MIGRATION,
    (s) => s.replace("branch.status = 'active'", "branch.status = 'active' and branch.taste_score > 0")],

  // --- a second distance formula in TypeScript ---------------------------------------------------
  ["a haversine implementation appears in TypeScript", REPOSITORY,
    (s) => `${s}\nexport const fallback = (a, b) => Math.asin(a - b);\n`],
  ["an earth radius constant appears in TypeScript", TYPES,
    (s) => `${s}\nexport const EARTH_RADIUS = 6371;\n`],
  ["a degrees-to-radians helper appears in TypeScript", TYPES,
    (s) => `${s}\nexport const toRadians = (d) => d * Math.PI / 180;\n`],

  // --- sealing and privacy --------------------------------------------------------------------
  ["the authority leaves the server-only schema", MIGRATION,
    (s) => s.replace("create schema geo_internal;", "")],
  ["the schema stops being revoked from anon", MIGRATION,
    (s) => s.replace("revoke all on schema geo_internal from anon;", "")],
  ["the authority role gains a login", MIGRATION,
    (s) => s.replace(/(create role geo_authority with\s*\n\s*)nologin/, "$1login")],
  ["the authority role gains RLS bypass", MIGRATION,
    (s) => s.replace("nobypassrls", "bypassrls")],
  ["a function stays owned by the migration runner", MIGRATION,
    (s) => s.replace("alter function geo_internal.within_radius(numeric, numeric, numeric, numeric, double precision)\n  owner to geo_authority;", "")],
  ["the role-scoped read policy is dropped", MIGRATION,
    (s) => s.replace("create policy restaurant_branches_geo_authority_read", "-- removed policy")],
  ["the executor loses its grant on narrowing", MIGRATION,
    (s) => s.replace(/grant execute on function geo_internal\.narrow_branch_candidates\(numeric, numeric, double precision, integer\)\s*\n\s*to social_runtime_executor;/, "")],
  ["a user location history table is introduced", MIGRATION,
    (s) => s.replace("commit;", "create table public.user_location_history (user_id uuid);\n\ncommit;")],

  // --- scope creep ----------------------------------------------------------------------------
  ["Mobile device location acquisition is pulled into GEO-1A", REPOSITORY,
    (s) => `${s}\nimport * as Location from "expo-location";\n`],
  ["continuous position watching is introduced", REPOSITORY,
    (s) => `${s}\nexport const track = () => watchPositionAsync({});\n`],
  ["a location history buffer is introduced", TYPES,
    (s) => `${s}\nexport type LocationHistory = { locationHistory: GeoPoint[] };\n`],
  ["map browsing UI is pulled into the shared layer", TYPES,
    (s) => `${s}\nexport type Marker = { mapMarker: string };\n`],
  ["route planning is pulled into the shared layer", TYPES,
    (s) => `${s}\nexport type Route = { turnByTurn: boolean };\n`],
  ["travel time estimation is pulled into the shared layer", TYPES,
    (s) => `${s}\nexport type Eta = { travelTime: number };\n`],
  ["user-to-user location sharing is introduced", TYPES,
    (s) => `${s}\nexport type Share = { shareLocationWith: string };\n`],
  ["a deployment operator command is embedded", MIGRATION,
    (s) => `${s}\nsupabase db push --project-ref something\n`]
];

for (const [label, file, mutate] of MUTATIONS) {
  const mutated = { ...pristine, [file]: mutate(pristine[file]) };
  if (mutated[file] === pristine[file]) {
    check(`${label} is killed`, false, "mutation did not change the source");
    continue;
  }
  check(`${label} is killed`, auditGeo1aAuthoredSources(mutated).length > 0);
}

check("the repository was never written to during mutation",
  GEO1A_PATHS.filter((file) => file !== "package.json")
    .every((file) => fs.readFileSync(path.join(root, file), "utf8") === pristine[file]));

console.log("\n" + JSON.stringify({
  suite: SUITE,
  total: checks.length,
  passed: checks.length - failures.length,
  failed: failures.length,
  failures: failures.map((f) => f.name),
  networkUsed: false,
  databaseUsed: false,
  credentialsUsed: false,
  developmentTouched: false,
  productionTouched: false
}, null, 2));
if (failures.length) process.exitCode = 1;
