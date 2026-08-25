#!/usr/bin/env node
// GEO-1A behavioural smoke — the REAL shared Geo contract executed against a deterministic
// in-process transport double. No network, no database, no credentials, no Development.
//
// The distance arithmetic itself is NOT proven here and must not be: it lives in PostgreSQL and is
// proven by the hardened apply gate against a real cluster. What is proven here is the boundary —
// what the contract accepts, what it refuses, and that it never answers a geographic question on its
// own instead of asking the authority.
import fs from "node:fs"; import path from "node:path"; import Module from "node:module";
const root = process.cwd();
const require_ = Module.createRequire(import.meta.url);
const ts = require_("typescript");

require_.extensions[".ts"] = function (module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const out = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, isolatedModules: true },
    fileName: filename
  });
  module._compile(out.outputText, filename);
};
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  if (request.startsWith(".") && parent?.filename) {
    const base = path.resolve(path.dirname(parent.filename), request);
    for (const ext of [".ts", ".tsx"]) if (fs.existsSync(base + ext)) return base + ext;
  }
  return origResolve.call(this, request, parent, ...rest);
};

const GEO = path.join(root, "supabase/functions/_shared/geo-api");
const {
  parseGeoPoint, parseOptionalGeoPoint, parseGeoRadiusMeters, parseGeoLimit, parseGeoQuery
} = require_(path.join(GEO, "validate.ts"));
const { ExecutorGeoRepository } = require_(path.join(GEO, "repository.ts"));
const { GEO_NARROW_LIMIT_MAX, GEO_RADIUS_METERS_MAX } = require_(path.join(GEO, "types.ts"));

const SUITE = "geo-shared-authority-geo-1a-smoke";
const checks = []; const failures = [];
const check = (name, ok, detail) => {
  const result = { name, pass: Boolean(ok), ...(ok ? {} : { detail }) };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
};

// A transport double that records every statement and answers with whatever the test decides the
// database said. It never computes anything, so any geographic answer the repository produces
// without asking is immediately visible.
function transportDouble(answers) {
  const asked = [];
  return {
    asked,
    transport: {
      async withTransaction(run) {
        return await run({
          async query(statement, params) {
            asked.push({ text: statement.text, params });
            const answer = answers.shift();
            if (answer === undefined) throw new Error("unexpected_query");
            return answer;
          }
        });
      },
      async close() {}
    }
  };
}

const point = (lat, lng) => {
  const parsed = parseGeoPoint(lat, lng);
  if (!parsed.ok) throw new Error(`fixture point invalid: ${parsed.reason}`);
  return parsed.value;
};
const TAIPEI = point(25.033964, 121.564468);

// --- coordinate validation ------------------------------------------------------------------------
check("a valid coordinate is accepted and frozen", (() => {
  const parsed = parseGeoPoint(25.5, 121.5);
  return parsed.ok && parsed.value.latitude === 25.5 && Object.isFrozen(parsed.value);
})());
check("the latitude range is inclusive at both poles",
  parseGeoPoint(90, 0).ok && parseGeoPoint(-90, 0).ok);
check("the longitude range is inclusive at the antimeridian",
  parseGeoPoint(0, 180).ok && parseGeoPoint(0, -180).ok);
for (const [label, lat, lng, reason] of [
  ["a latitude past the pole", 90.0001, 0, "latitude_out_of_range"],
  ["a latitude below the pole", -90.0001, 0, "latitude_out_of_range"],
  ["a longitude past the antimeridian", 0, 180.0001, "longitude_out_of_range"],
  ["a NaN latitude", Number.NaN, 0, "coordinate_not_finite"],
  ["an infinite longitude", 0, Number.POSITIVE_INFINITY, "coordinate_not_finite"],
  ["a string coordinate", "25.0", 121.5, "coordinate_not_finite"],
  ["a null coordinate", null, 121.5, "coordinate_not_finite"]
]) {
  const parsed = parseGeoPoint(lat, lng);
  check(`${label} is refused as ${reason}`, !parsed.ok && parsed.reason === reason, parsed);
}

// A swapped pair is only detectable when one value is out of the other's range; that it IS detected
// there is what stops a swapped call from silently becoming a plausible location.
check("a swapped coordinate pair is refused when longitude cannot be a latitude",
  !parseGeoPoint(121.564468, 25.033964).ok);

// --- optional coordinates: UNKNOWN is first class ------------------------------------------------
check("both axes absent is UNKNOWN, not an error", (() => {
  const parsed = parseOptionalGeoPoint(null, null);
  return parsed.ok && parsed.value === null;
})());
check("both axes undefined is UNKNOWN", (() => {
  const parsed = parseOptionalGeoPoint(undefined, undefined);
  return parsed.ok && parsed.value === null;
})());
for (const [label, lat, lng] of [
  ["a latitude without a longitude", 25.0, null],
  ["a longitude without a latitude", null, 121.5]
]) {
  const parsed = parseOptionalGeoPoint(lat, lng);
  check(`${label} is refused as incomplete`, !parsed.ok && parsed.reason === "coordinate_incomplete");
}

// --- radius -----------------------------------------------------------------------------------
check("a positive radius is accepted", parseGeoRadiusMeters(1500).ok);
check("the maximum radius is accepted", parseGeoRadiusMeters(GEO_RADIUS_METERS_MAX).ok);
for (const [label, value] of [
  ["a zero radius", 0], ["a negative radius", -1], ["a NaN radius", Number.NaN],
  ["an infinite radius", Number.POSITIVE_INFINITY], ["a radius past half the Earth", GEO_RADIUS_METERS_MAX + 1],
  ["a string radius", "1500"], ["a null radius", null]
]) {
  const parsed = parseGeoRadiusMeters(value);
  check(`${label} is refused`, !parsed.ok && parsed.reason === "radius_out_of_range");
}

// --- limit ------------------------------------------------------------------------------------
check("a positive integer limit is accepted", parseGeoLimit(20).ok);
check("the maximum limit is accepted", parseGeoLimit(GEO_NARROW_LIMIT_MAX).ok);
for (const [label, value] of [
  ["a zero limit", 0], ["a negative limit", -1], ["a fractional limit", 1.5],
  ["a limit past the cap", GEO_NARROW_LIMIT_MAX + 1], ["a NaN limit", Number.NaN]
]) {
  check(`${label} is refused`, !parseGeoLimit(value).ok);
}

// --- query composition ---------------------------------------------------------------------------
check("a well-formed query composes", (() => {
  const parsed = parseGeoQuery({ latitude: 25.0, longitude: 121.5, radiusMeters: 3000, limit: 20 });
  return parsed.ok && Object.isFrozen(parsed.value) && parsed.value.radiusMeters === 3000;
})());
check("a query with a bad coordinate fails on the coordinate",
  parseGeoQuery({ latitude: 91, longitude: 121.5, radiusMeters: 3000, limit: 20 }).reason === "latitude_out_of_range");
check("a query with a bad radius fails on the radius",
  parseGeoQuery({ latitude: 25, longitude: 121.5, radiusMeters: 0, limit: 20 }).reason === "radius_out_of_range");
check("a query with a bad limit fails on the limit",
  parseGeoQuery({ latitude: 25, longitude: 121.5, radiusMeters: 3000, limit: 0 }).reason === "limit_out_of_range");

// --- the repository asks the authority; it never answers ------------------------------------------
{
  const { asked, transport } = transportDouble([[
    { branch_id: "b-near", restaurant_id: "r-1", distance_meters: 120.5 },
    { branch_id: "b-far", restaurant_id: "r-2", distance_meters: 2400 }
  ]]);
  const rows = await new ExecutorGeoRepository(transport).narrowBranchCandidates({
    origin: TAIPEI, radiusMeters: 3000, limit: 20
  });
  check("narrowing delegates to the sealed database authority",
    asked.length === 1 && asked[0].text.includes("geo_internal.narrow_branch_candidates"));
  check("narrowing passes origin, radius and limit through in canonical order",
    JSON.stringify(asked[0].params) === JSON.stringify([TAIPEI.latitude, TAIPEI.longitude, 3000, 20]));
  check("narrowing preserves the database ordering rather than re-sorting",
    rows.map((r) => r.branchId).join(",") === "b-near,b-far");
  check("narrowing exposes the public branch and restaurant references and the distance",
    rows[0].branchId === "b-near" && rows[0].restaurantId === "r-1" && rows[0].distanceMeters === 120.5);
  check("a narrowed row is frozen", Object.isFrozen(rows[0]));
}
{
  const { transport } = transportDouble([[
    { branch_id: "b-1", restaurant_id: "r-1", distance_meters: "1234.5" }
  ]]);
  const rows = await new ExecutorGeoRepository(transport).narrowBranchCandidates({
    origin: TAIPEI, radiusMeters: 3000, limit: 20
  });
  check("a numeric distance delivered as a string is parsed, not dropped",
    rows.length === 1 && rows[0].distanceMeters === 1234.5);
}
{
  const { transport } = transportDouble([[
    { branch_id: "b-1", restaurant_id: "r-1", distance_meters: null },
    { branch_id: "b-2", restaurant_id: "r-2", distance_meters: 10 }
  ]]);
  const rows = await new ExecutorGeoRepository(transport).narrowBranchCandidates({
    origin: TAIPEI, radiusMeters: 3000, limit: 20
  });
  check("a row with no distance is dropped rather than becoming zero metres",
    rows.length === 1 && rows[0].branchId === "b-2");
}

// --- UNKNOWN never reaches the authority as a number ----------------------------------------------
{
  const { asked, transport } = transportDouble([]);
  const distance = await new ExecutorGeoRepository(transport).distanceBetween(TAIPEI, null);
  check("an unknown candidate yields UNKNOWN without asking the database at all",
    distance === null && asked.length === 0);
}
{
  const { asked, transport } = transportDouble([]);
  const eligibility = await new ExecutorGeoRepository(transport).eligibility(TAIPEI, null, 3000);
  check("an unknown candidate is reported as unknown_location, never as outside_radius",
    eligibility === "unknown_location" && asked.length === 0);
}
{
  const { asked, transport } = transportDouble([[{ distance_meters: 4711.25 }]]);
  const distance = await new ExecutorGeoRepository(transport).distanceBetween(TAIPEI, point(25.05, 121.51));
  check("a known distance is returned exactly as the authority computed it",
    distance !== null && distance.meters === 4711.25
    && asked[0].text.includes("geo_internal.distance_meters"));
}
{
  const { transport } = transportDouble([[{ distance_meters: null }]]);
  check("a NULL distance from the authority stays UNKNOWN",
    (await new ExecutorGeoRepository(transport).distanceBetween(TAIPEI, point(25.05, 121.51))) === null);
}
for (const [label, answer, expected] of [
  ["true", [{ within: true }], "eligible"],
  ["false", [{ within: false }], "outside_radius"],
  ["null", [{ within: null }], "outside_radius"],
  ["nothing", [], "outside_radius"]
]) {
  const { transport } = transportDouble([answer]);
  const eligibility = await new ExecutorGeoRepository(transport)
    .eligibility(TAIPEI, point(25.05, 121.51), 3000);
  check(`an authority answer of ${label} maps to ${expected}`, eligibility === expected);
}

// --- the boundary carries no ranking and no private coordinate ------------------------------------
const geoSource = ["types.ts", "validate.ts", "repository.ts", "index.ts"]
  .map((file) => fs.readFileSync(path.join(GEO, file), "utf8")).join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");
check("the shared contract contains no distance arithmetic of its own",
  !/Math\.(sin|cos|asin|atan2|sqrt)|haversine|6371/i.test(geoSource));
check("the shared contract carries no taste, nutrition or social ranking signal",
  !/taste|nutrition|calorie|protein|similarity|compatib|rankCandidates/i.test(geoSource));
check("the shared contract never names a person, profile or pair identifier",
  !/user_id|userId|profileId|pairKey|counterpart/i.test(geoSource));

const socialDto = fs.readFileSync(
  path.join(root, "supabase/functions/_shared/social-candidate-api/toCandidateDto.ts"), "utf8");
check("the frozen Social candidate projection still exposes no coordinate or distance",
  !/latitude|longitude|distanceMeters|geoPoint/i.test(socialDto));

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
