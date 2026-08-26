#!/usr/bin/env node
// GEO-1C-P0 behavioural smoke — the REAL dispatch service, provider port and config driven against
// deterministic in-process doubles. No network, no database, no credentials, no Development.
//
// The database half of this round is proven by the hardened apply gate against a real cluster. What
// is proven here is the Edge half: what the provider port may see, what the service does with each
// provider answer, and that the dispatcher is configured as operational machinery rather than as a
// consumer surface.
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

// The dispatcher config reads Deno.env. A minimal stub lets the real selector logic run unchanged in
// a Node harness rather than being asserted only as text.
const denoEnv = new Map();
globalThis.Deno = { env: { get: (name) => denoEnv.get(name) } };

const SHARED = path.join(root, "supabase/functions/_shared/restaurant-geocoding");
const DISPATCH = path.join(root, "supabase/functions/restaurant-geocode-dispatch");
const { parseGeocodeCoordinate, RESTAURANT_GEOCODING_POLICY_VERSION } = require_(path.join(SHARED, "types.ts"));
const { createMockRestaurantGeocodeProvider, MOCK_GEOCODE_PROVIDER_NAME } = require_(path.join(SHARED, "mockProvider.ts"));
const { RestaurantGeocodeDispatchService } = require_(path.join(SHARED, "service.ts"));
const { loadRestaurantGeocodeDispatchConfig, secretMatches } = require_(path.join(DISPATCH, "config.ts"));

const SUITE = "geo-coordinate-source-geo-1c-p0-smoke";
const checks = []; const failures = [];
const check = (name, ok, detail) => {
  const result = { name, pass: Boolean(ok), ...(ok ? {} : { detail }) };
  checks.push(result);
  if (!result.pass) failures.push(result);
  console.log(`${result.pass ? "PASS" : "FAIL"} ${String(checks.length).padStart(2, "0")} ${name}`);
  if (!result.pass && detail !== undefined) console.log(`     detail: ${JSON.stringify(detail).slice(0, 400)}`);
};

const KNOWN = "台北市 松山區 南京東路三段 100 號";
const FINGERPRINT = "a".repeat(64);
const item = (branchId, sourceAddress, fingerprint = FINGERPRINT) =>
  Object.freeze({ branchId, sourceAddress, addressFingerprint: fingerprint });

// A repository double that records every call, so anything the service decides on its own — a
// coordinate it invented, a staleness judgement it made locally — is immediately visible.
function repositoryDouble(claims, outcomes = {}) {
  const calls = [];
  return {
    calls,
    repository: {
      async claim(limit, maxAttempts) { calls.push({ op: "claim", limit, maxAttempts }); return claims; },
      async complete(work, latitude, longitude, provider, providerRef) {
        calls.push({ op: "complete", branchId: work.branchId, fingerprint: work.addressFingerprint, latitude, longitude, provider, providerRef });
        return outcomes.complete ?? "resolved";
      },
      async fail(work, errorCode) {
        calls.push({ op: "fail", branchId: work.branchId, fingerprint: work.addressFingerprint, errorCode });
        return outcomes.fail ?? "failed";
      }
    }
  };
}

// --- coordinate validation ------------------------------------------------------------------------
check("a valid coordinate parses and is frozen", (() => {
  const parsed = parseGeocodeCoordinate(25.05, 121.54);
  return parsed !== null && Object.isFrozen(parsed) && parsed.latitude === 25.05;
})());
check("the poles and the antimeridian are inclusive",
  parseGeocodeCoordinate(90, 180) !== null && parseGeocodeCoordinate(-90, -180) !== null);
for (const [label, lat, lng] of [
  ["a latitude past the pole", 90.0001, 0],
  ["a longitude past the antimeridian", 0, 180.0001],
  ["a NaN latitude", Number.NaN, 0],
  ["an infinite longitude", 0, Number.POSITIVE_INFINITY],
  ["a string coordinate", "25", 121],
  ["a null coordinate", null, 121]
]) {
  check(`${label} is refused`, parseGeocodeCoordinate(lat, lng) === null);
}

// --- the mock provider ------------------------------------------------------------------------------
const provider = createMockRestaurantGeocodeProvider();
check("the provider names itself and is provider-neutral at the port",
  provider.name === MOCK_GEOCODE_PROVIDER_NAME && MOCK_GEOCODE_PROVIDER_NAME === "mock");
{
  const answer = await provider.resolve(KNOWN);
  check("a known fixture address resolves to a declared coordinate",
    answer.ok === true && parseGeocodeCoordinate(answer.value.coordinate.latitude, answer.value.coordinate.longitude) !== null);
  check("a resolved fixture carries a provider-neutral reference",
    answer.ok === true && typeof answer.value.providerRef === "string"
    && answer.value.providerRef.startsWith("mock-fixture-"));
}
for (const [label, address] of [
  ["a synthetic address", "台北市 Synthetic District 2 Synthetic Ave"],
  ["an unknown real-looking address", "台北市 信義區 松高路 11 號"],
  ["an empty address", ""]
]) {
  const answer = await provider.resolve(address);
  check(`${label} is a genuine no-match, never an invented coordinate`,
    answer.ok === false && answer.errorCode === "provider_no_match", answer);
}

// --- the dispatch service ---------------------------------------------------------------------------
{
  const { calls, repository } = repositoryDouble([item("b-known", KNOWN)]);
  const summary = await new RestaurantGeocodeDispatchService(repository, provider).dispatch(25, 3);
  check("the service claims a bounded batch with the configured attempt maximum",
    calls[0].op === "claim" && calls[0].limit === 25 && calls[0].maxAttempts === 3, calls[0]);
  check("a resolved address is completed with the fingerprint it was claimed under",
    calls[1].op === "complete" && calls[1].fingerprint === FINGERPRINT
    && calls[1].branchId === "b-known", calls[1]);
  check("the completion carries the provider name and reference",
    calls[1].provider === "mock" && typeof calls[1].providerRef === "string");
  check("the summary counts the resolution",
    summary.resolved === 1 && summary.failed === 0 && summary.rejectedStale === 0
    && summary.claimed === 1 && summary.provider === "mock"
    && summary.policyVersion === RESTAURANT_GEOCODING_POLICY_VERSION, summary);
}
{
  const { calls, repository } = repositoryDouble([item("b-nomatch", "台北市 信義區 無此路 1 號")]);
  const summary = await new RestaurantGeocodeDispatchService(repository, provider).dispatch(25, 3);
  check("a provider no-match is recorded as a failure and never as a coordinate",
    calls[1].op === "fail" && calls[1].errorCode === "provider_no_match"
    && !calls.some((c) => c.op === "complete"), calls);
  check("the summary counts the failure", summary.failed === 1 && summary.resolved === 0);
}
{
  const throwing = { name: "mock", async resolve() { throw new Error("boom"); } };
  const { calls, repository } = repositoryDouble([item("b-throw", KNOWN)]);
  const summary = await new RestaurantGeocodeDispatchService(repository, throwing).dispatch(25, 3);
  check("a provider that throws is recorded as unavailable, not propagated",
    calls[1].op === "fail" && calls[1].errorCode === "provider_unavailable" && summary.failed === 1);
}
{
  const lying = { name: "mock", async resolve() {
    return { ok: true, value: { coordinate: { latitude: 999, longitude: 0 }, providerRef: null } };
  } };
  const { calls, repository } = repositoryDouble([item("b-lying", KNOWN)]);
  await new RestaurantGeocodeDispatchService(repository, lying).dispatch(25, 3);
  check("an out-of-range provider answer is re-validated at the boundary and refused",
    calls[1].op === "fail" && calls[1].errorCode === "provider_invalid_response"
    && !calls.some((c) => c.op === "complete"), calls);
}
{
  const { repository } = repositoryDouble([item("b-stale", KNOWN)], { complete: "rejected_stale" });
  const summary = await new RestaurantGeocodeDispatchService(repository, provider).dispatch(25, 3);
  check("a database staleness rejection is counted and never retried locally",
    summary.rejectedStale === 1 && summary.resolved === 0 && summary.failed === 0, summary);
}
{
  const { calls, repository } = repositoryDouble([]);
  const summary = await new RestaurantGeocodeDispatchService(repository, provider).dispatch(25, 3);
  check("an empty claim does no provider work at all",
    calls.length === 1 && summary.claimed === 0 && summary.resolved === 0);
}

// --- the dispatcher configuration -----------------------------------------------------------------
{
  denoEnv.clear();
  check("an absent dispatch secret refuses to run",
    loadRestaurantGeocodeDispatchConfig().ok === false);
  denoEnv.set("RESTAURANT_GEOCODE_DISPATCH_SECRET", "short");
  denoEnv.set("RESTAURANT_GEOCODING_PROVIDER", "mock");
  check("a too-short dispatch secret refuses to run",
    loadRestaurantGeocodeDispatchConfig().ok === false);
  denoEnv.set("RESTAURANT_GEOCODE_DISPATCH_SECRET", "s".repeat(48));
  check("a valid mock configuration loads",
    loadRestaurantGeocodeDispatchConfig().ok === true);
  for (const provider of ["google", "tgos", "nominatim", "disabled", ""]) {
    denoEnv.set("RESTAURANT_GEOCODING_PROVIDER", provider);
    check(`an unimplemented provider selection (${provider || "empty"}) refuses to run rather than falling back`,
      loadRestaurantGeocodeDispatchConfig().ok === false);
  }
  denoEnv.set("RESTAURANT_GEOCODING_PROVIDER", "mock");
  denoEnv.set("RESTAURANT_GEOCODE_MAX_ATTEMPTS", "5");
  check("the attempt maximum is configurable within bounds",
    loadRestaurantGeocodeDispatchConfig().value.maxAttempts === 5);
  for (const [label, value] of [["zero", "0"], ["negative", "-1"], ["absurd", "999"], ["nonsense", "abc"]]) {
    denoEnv.set("RESTAURANT_GEOCODE_MAX_ATTEMPTS", value);
    check(`an out-of-bounds attempt maximum (${label}) falls back to the safe default`,
      loadRestaurantGeocodeDispatchConfig().value.maxAttempts === 3);
  }
}
check("the shared secret comparison is length-safe and constant time",
  secretMatches("abcdef", "abcdef") === true && secretMatches("abcdef", "abcdeg") === false
  && secretMatches("abcdef", "abcde") === false && secretMatches("abcdef", null) === false);

// --- source-level boundaries --------------------------------------------------------------------
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sharedCode = ["types.ts", "mockProvider.ts", "repository.ts", "service.ts", "index.ts"]
  .map((f) => source(`supabase/functions/_shared/restaurant-geocoding/${f}`)).join("\n")
  .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/[^\n]*/g, "$1");
const handler = source("supabase/functions/restaurant-geocode-dispatch/handler.ts");

check("the geocoding layer contains no distance or ranking arithmetic",
  !/haversine|Math\.asin|Math\.atan2|distanceMeters|withinRadius|rankCandidates/i.test(sharedCode));
check("the geocoding layer never names a commercial geocoding vendor",
  !/googleapis|google\.maps|mapbox|nominatim|openstreetmap|here\.com|tgos/i.test(sharedCode));
check("the canonical provider reference is not called a place id",
  !/place_id|placeId/i.test(sharedCode));
check("the provider port receives one composed address and nothing else",
  /resolve\(sourceAddress: string\)/.test(sharedCode)
  && !/branchId[^\n]*resolve|resolve\([^)]*branch/i.test(sharedCode));
check("the repository never decides staleness locally",
  !/rejected_stale\s*=|isStale|checkFingerprint/.test(sharedCode));
check("the dispatcher is a POST-only shared-secret endpoint",
  /request\.method !== "POST"/.test(handler)
  && /x-restaurant-geocode-dispatch/.test(handler)
  && !/auth\.getUser|Authorization/.test(handler));
check("the dispatcher always closes its transport",
  /finally \{\s*await transport\.close\(\);/.test(handler));

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
