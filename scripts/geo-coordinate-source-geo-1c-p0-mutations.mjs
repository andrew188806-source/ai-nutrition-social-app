#!/usr/bin/env node
// GEO-1C-P0 mutation suite.
//
// Every mutation below is a defect a reviewer could plausibly ship: a fifth lifecycle state, a
// coordinate that outlives the address that produced it, a city edit that quietly leaves stale
// coordinates behind, a completion that stops checking the fingerprint, an unbounded retry loop, a
// client role handed write access, or a real vendor smuggled in behind a mock. Each is applied to
// the source text IN MEMORY and must be KILLED by the shared invariants. The repository is never
// written to.
import fs from "node:fs";
import path from "node:path";
import {
  GEO1CP0_PATHS,
  auditGeo1cp0AuthoredSources
} from "./geo-coordinate-source-geo-1c-p0-successor-manifest.mjs";

const SUITE = "geo-coordinate-source-geo-1c-p0-mutations";
const root = process.cwd();
const MIGRATION = "supabase/migrations/20260826010000_restaurant_geocode_source_authority.sql";
const TYPES = "supabase/functions/_shared/restaurant-geocoding/types.ts";
const MOCK = "supabase/functions/_shared/restaurant-geocoding/mockProvider.ts";
const REPOSITORY = "supabase/functions/_shared/restaurant-geocoding/repository.ts";
const BARREL = "supabase/functions/_shared/restaurant-geocoding/index.ts";
const CONFIG = "supabase/functions/restaurant-geocode-dispatch/config.ts";
const HANDLER = "supabase/functions/restaurant-geocode-dispatch/handler.ts";
const CONFIG_TOML = "supabase/config.toml";

const pristine = Object.fromEntries(
  GEO1CP0_PATHS.filter((file) => !file.startsWith("scripts/") && file !== "package.json")
    .map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")])
);

const checks = []; const failures = [];
const check = (name, ok, detail) => {
  const result = { name, pass: Boolean(ok), ...(ok ? {} : { detail }) };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 320)}`);
};

check("pristine GEO-1C-P0 source satisfies every invariant",
  auditGeo1cp0AuthoredSources(pristine).length === 0, auditGeo1cp0AuthoredSources(pristine));

const MUTATIONS = [
  // --- the four-state lifecycle ------------------------------------------------------------------
  ["a fifth stale state is introduced", MIGRATION,
    (s) => s.replace("check (geocode_status in ('unknown', 'pending', 'resolved', 'failed'))",
      "check (geocode_status in ('unknown', 'pending', 'resolved', 'failed', 'stale'))")],
  ["the resolved-implies-coordinate equivalence is removed", MIGRATION,
    (s) => s.replace("check ((geocode_status = 'resolved') = (latitude is not null))",
      "check (geocode_status is not null)")],
  ["the equivalence is weakened to an implication", MIGRATION,
    (s) => s.replace("check ((geocode_status = 'resolved') = (latitude is not null))",
      "check ((geocode_status = 'resolved') <= (latitude is not null))")],
  ["an unresolved row is allowed to keep provider provenance", MIGRATION,
    (s) => s.replace("or (geocode_provider is null and geocode_provider_ref is null and geocode_resolved_at is null)",
      "or true")],
  ["a resolution no longer has to be attributable", MIGRATION,
    (s) => s.replace("and geocode_address_fingerprint is not null", "and true")],

  // --- branch-side invalidation -------------------------------------------------------------------
  ["the branch trigger stops firing on an address change", MIGRATION,
    (s) => s.replace("before insert or update of address, district, restaurant_id",
      "before insert")],
  ["the branch trigger stops firing on a district change", MIGRATION,
    (s) => s.replace("before insert or update of address, district, restaurant_id",
      "before insert or update of address, restaurant_id")],
  ["branch invalidation stops clearing the coordinate", MIGRATION,
    (s) => s.replace("  new.latitude := null;\n  new.longitude := null;", "")],
  ["branch invalidation stops clearing provider provenance", MIGRATION,
    (s) => s.replace("  new.geocode_provider := null;\n  new.geocode_provider_ref := null;", "")],
  ["branch invalidation stops resetting the attempt budget", MIGRATION,
    (s) => s.replace("  new.geocode_attempts := 0;", "")],
  ["an insufficient address is admitted as pending instead of unknown", MIGRATION,
    (s) => s.replace("new.geocode_status := case when v_fingerprint is null then 'unknown' else 'pending' end;",
      "new.geocode_status := 'pending';")],

  // --- the city correction ---------------------------------------------------------------------------
  ["the parent city trigger is removed entirely", MIGRATION,
    (s) => s.replace("create trigger restaurants_city_geocode_invalidate", "-- removed trigger")],
  ["the city trigger stops watching the city column", MIGRATION,
    (s) => s.replace("after update of city on public.restaurants", "after insert on public.restaurants")],
  ["the city trigger fires unconditionally instead of on an actual change", MIGRATION,
    (s) => s.replace("when (old.city is distinct from new.city)", "when (true)")],
  ["city invalidation stops clearing child coordinates", MIGRATION,
    (s) => s.replace("    latitude = null,\n    longitude = null,", "    geocode_last_error = null,")],
  ["city invalidation stops narrowing to genuinely affected branches", MIGRATION,
    (s) => s.replace("is distinct from branch.geocode_address_fingerprint", "is not null")],

  // --- the fingerprint -------------------------------------------------------------------------------
  ["the city is dropped from the canonical address", MIGRATION,
    (s) => s.replace("compose_branch_address(\n  p_city text,\n  p_district text,\n  p_address text\n)",
      "compose_branch_address(\n  p_district text,\n  p_address text\n)")],
  ["a branch with no street address starts composing anyway", MIGRATION,
    (s) => s.replace("when p_address is null or pg_catalog.btrim(p_address) = '' then null",
      "when false then null")],
  ["the fingerprint stops being a digest", MIGRATION,
    (s) => s.replace("pg_catalog.sha256(pg_catalog.convert_to(", "pg_catalog.upper((")],
  ["the address functions stop being immutable", MIGRATION,
    (s) => s.replace(/\bimmutable\b/g, "volatile")],

  // --- the staleness race -----------------------------------------------------------------------------
  ["completion stops checking the fingerprint", MIGRATION,
    (s) => s.replace(/if v_current is distinct from p_address_fingerprint then return 'rejected_stale'; end if;/,
      "")],
  ["completion stops locking the row before deciding", MIGRATION,
    (s) => s.replace("where branch.id = p_branch_id\n  for update;", "where branch.id = p_branch_id;")],
  ["completion accepts an out-of-range coordinate", MIGRATION,
    (s) => s.replace("or p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180", "")],
  ["the stored normalized address becomes a provider string", MIGRATION,
    (s) => s.replace("geocode_normalized_address = v_composed", "geocode_normalized_address = p_provider_ref")],
  ["a failure is allowed to write a coordinate", MIGRATION,
    (s) => s.replace("  set geocode_status = 'failed',\n      geocode_last_error",
      "  set latitude = 0, longitude = 0,\n      geocode_status = 'failed',\n      geocode_last_error")],

  // --- bounded retry ------------------------------------------------------------------------------------
  ["the attempt bound is removed from claiming", MIGRATION,
    (s) => s.replace("and branch.geocode_attempts < p_max_attempts", "")],
  ["the attempt stops being counted at claim time", MIGRATION,
    (s) => s.replace("set geocode_attempts = branch.geocode_attempts + 1,", "set")],
  ["concurrent dispatchers are allowed to collide", MIGRATION,
    (s) => s.replace("for update skip locked", "")],
  ["a claim starts returning a coordinate", MIGRATION,
    (s) => s.replace("  returning branch.id,", "  returning branch.id, branch.latitude,")],

  // --- write authority -----------------------------------------------------------------------------------
  ["the authority is granted the whole table instead of named columns", MIGRATION,
    (s) => s.replace(/grant update \(latitude, longitude, geocode_status[\s\S]*?to geo_geocode_authority;/,
      "grant update on table public.restaurant_branches to geo_geocode_authority;")],
  ["the authority gains write access to the fingerprint it is checked against", MIGRATION,
    (s) => s.replace("grant update (latitude, longitude, geocode_status",
      "grant update (geocode_address_fingerprint, latitude, longitude, geocode_status")],
  ["the write policy is dropped, so the grant silently does nothing", MIGRATION,
    (s) => s.replace("create policy restaurant_branches_geocode_authority_write", "-- removed policy")],
  ["the write role gains a login", MIGRATION,
    (s) => s.replace(/(create role geo_geocode_authority with\s*\n\s*)nologin/, "$1login")],
  ["the write role gains RLS bypass", MIGRATION,
    (s) => s.replace("nobypassrls", "bypassrls")],
  ["the executor loses its grant on claiming", MIGRATION,
    (s) => s.replace(/grant execute on function geo_internal\.claim_branch_geocodes\(integer, integer\) to social_runtime_executor;/,
      "")],

  // --- provider neutrality ------------------------------------------------------------------------------
  ["the canonical field is renamed to provider-specific place vocabulary", MIGRATION,
    (s) => s.replace(/geocode_provider_ref/g, "geocode_place_id")],
  ["a real commercial geocoder is called from the shared layer", TYPES,
    (s) => `${s}\nexport const endpoint = "https://maps.googleapis.com/maps/api/geocode/json";\n`],
  ["a vendor provider module is exported", BARREL,
    (s) => `${s}\nexport { googleProvider } from "./googleProvider.ts";\n`],
  ["the provider port is handed the branch it is resolving for", TYPES,
    (s) => s.replace("resolve(sourceAddress: string): Promise<GeocodeProviderOutcome>;",
      "resolve(sourceAddress: string, branchId: string): Promise<GeocodeProviderOutcome>;")],
  ["the provider error vocabulary is opened up", TYPES,
    (s) => s.replace(/\| "provider_invalid_response";/, "| string;")],
  ["an unrecognised provider silently falls back instead of refusing", CONFIG,
    (s) => s.replace('if (providerRaw !== "mock") return { ok: false, errorCode: "server_unavailable" };',
      'const ignored = providerRaw;')],
  ["the mock starts inventing a plausible coordinate for any address", MOCK,
    (s) => s.replace('return Promise.resolve(Object.freeze({ ok: false, errorCode: "provider_no_match" } as const));',
      'return Promise.resolve(Object.freeze({ ok: true, value: Object.freeze({ coordinate: { latitude: 25.03, longitude: 121.56 }, providerRef: null }) } as const));')],

  // --- the dispatcher is operational, not a consumer surface -----------------------------------------------
  ["the shared-secret gate is removed from the dispatcher", HANDLER,
    (s) => s.replace(/if \(!secretMatches\(config\.value\.dispatchSecret, request\.headers\.get\("x-restaurant-geocode-dispatch"\)\)\) \{[\s\S]*?\}/,
      "")],
  ["the secret comparison becomes short-circuiting", CONFIG,
    (s) => s.replace("difference |= expected.charCodeAt(index) ^ presented.charCodeAt(index);",
      "if (expected[index] !== presented[index]) return false;")],
  ["the dispatcher is registered with JWT verification, implying a user surface", CONFIG_TOML,
    (s) => s.replace(/(\[functions\.restaurant-geocode-dispatch\][\s\S]*?)verify_jwt = false/,
      "$1verify_jwt = true")],
  ["a second provider secret is read outside the server config", REPOSITORY,
    (s) => `${s}\nexport const key = Deno.env.get("GEOCODER_API_KEY");\n`],

  // --- scope creep -------------------------------------------------------------------------------------------
  ["a district centroid is substituted for a real coordinate", TYPES,
    (s) => `${s}\nexport const districtCenter = { latitude: 25.03, longitude: 121.56 };\n`],
  ["recommendation-time geocoding is introduced", TYPES,
    (s) => `${s}\nexport const geocodeOnRequest = true;\n`],
  ["distance arithmetic is pulled into the geocoding layer", TYPES,
    (s) => `${s}\nexport const gap = (a, b) => Math.asin(a - b);\n`],
  ["user location persistence is introduced", TYPES,
    (s) => `${s}\nexport type Held = { userLocation: GeocodeCoordinate };\n`],
  ["a deployment operator command is embedded", MIGRATION,
    (s) => `${s}\nsupabase db push --project-ref something\n`]
];

for (const [label, file, mutate] of MUTATIONS) {
  const mutated = { ...pristine, [file]: mutate(pristine[file]) };
  if (mutated[file] === pristine[file]) {
    check(`${label} is killed`, false, "mutation did not change the source");
    continue;
  }
  check(`${label} is killed`, auditGeo1cp0AuthoredSources(mutated).length > 0);
}

check("the repository was never written to during mutation",
  Object.keys(pristine).every((file) =>
    fs.readFileSync(path.join(root, file), "utf8") === pristine[file]));

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
